import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import {
  customerCreditLineRepository,
  type CustomerCreditLineRepository,
  type UpdateCustomerCreditLineInput as RepoUpdateCustomerCreditLineInput,
} from "@/lib/repositories/cxc/CustomerCreditLineRepository";
import { customerRepository, type CustomerRepository } from "@/lib/repositories/cxc/CustomerRepository";
import {
  customerDocumentRepository,
  type CustomerDocumentRepository,
} from "@/lib/repositories/cxc/CustomerDocumentRepository";
import type { CustomerCreditLineDTO, CustomerDTO } from "@/lib/types/cxc";

import { mockCxcStore } from "./mock-data";

type CreditLineStatus = CustomerCreditLineDTO["status"];

const CREDIT_LINE_STATUSES: CreditLineStatus[] = ["ACTIVE", "PAUSED", "BLOCKED"];

const CUSTOMER_STATUSES: CustomerDTO["creditStatus"][] = ["ACTIVE", "ON_HOLD", "BLOCKED"];

const cloneLine = (line: CustomerCreditLineDTO): CustomerCreditLineDTO => ({ ...line });

const normalizeCode = (value: string) => value.trim().toUpperCase();

const toIsoDateTime = (value?: string | Date | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00Z`) : new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha indicada no es válida");
  }
  return date.toISOString();
};

const resolveLineStatus = (input?: string | null): CreditLineStatus => {
  if (!input) return "ACTIVE";
  const normalized = input.trim().toUpperCase();
  return CREDIT_LINE_STATUSES.includes(normalized as CreditLineStatus)
    ? (normalized as CreditLineStatus)
    : "ACTIVE";
};

const resolveCustomerStatus = (
  input?: string | null,
  fallback: CustomerDTO["creditStatus"] = "ACTIVE",
): CustomerDTO["creditStatus"] => {
  if (!input) return fallback;
  const normalized = input.trim().toUpperCase();
  return CUSTOMER_STATUSES.includes(normalized as CustomerDTO["creditStatus"])
    ? (normalized as CustomerDTO["creditStatus"])
    : fallback;
};

const mapLineStatusToCustomerStatus = (status: CreditLineStatus): CustomerDTO["creditStatus"] => {
  switch (status) {
    case "BLOCKED":
      return "BLOCKED";
    case "PAUSED":
      return "ON_HOLD";
    default:
      return "ACTIVE";
  }
};

const computeAvailable = (approvedLimit: number, creditUsed: number, blockedAmount: number) => {
  const available = approvedLimit - creditUsed - blockedAmount;
  return available > 0 ? Number(available.toFixed(2)) : 0;
};

const isDebitDocumentType = (documentType: string | null | undefined) =>
  documentType === "INVOICE" || documentType === "DEBIT_NOTE";

export type AssignCustomerCreditLineInput = {
  customerCode: string;
  approvedLimit: number;
  blockedAmount?: number;
  availableLimit?: number;
  status?: CreditLineStatus;
  reviewerAdminUserId?: number | null;
  reviewNotes?: string | null;
  reviewedAt?: string | Date | null;
  nextReviewAt?: string | Date | null;
  creditHoldReason?: string | null;
  customerStatus?: CustomerDTO["creditStatus"] | null;
};

export type UpdateCustomerCreditLinePayload = {
  id: number;
  approvedLimit?: number;
  blockedAmount?: number;
  availableLimit?: number;
  status?: CreditLineStatus;
  reviewerAdminUserId?: number | null;
  reviewNotes?: string | null;
  reviewedAt?: string | Date | null;
  nextReviewAt?: string | Date | null;
  creditHoldReason?: string | null;
  customerStatus?: CustomerDTO["creditStatus"] | null;
};

export type UpdateCustomerCreditStatusInput = {
  customerCode: string;
  status: CustomerDTO["creditStatus"];
  creditHoldReason?: string | null;
};

export type CustomerCreditOverview = {
  customer: CustomerDTO;
  lines: CustomerCreditLineDTO[];
  latestLine: CustomerCreditLineDTO | null;
  availableCredit: number;
  usagePercentage: number;
  limitWarning: boolean;
  isBlocked: boolean;
};

export class CustomerCreditLineService {
  constructor(
    private readonly repo: CustomerCreditLineRepository = customerCreditLineRepository,
    private readonly customerRepo: CustomerRepository = customerRepository,
    private readonly documentRepo: CustomerDocumentRepository = customerDocumentRepository,
  ) {}

  private assertRetailFeature() {
    if (env.features.isRestaurant) {
      throw new Error("El módulo de Cuentas por Cobrar no está disponible en modo restaurante");
    }
  }

  private async getCustomerByCode(code: string): Promise<CustomerDTO> {
    if (!code) {
      throw new Error("Debe indicar el código del cliente");
    }
    const normalized = normalizeCode(code);

    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.code === normalized);
      if (!customer) {
        throw new Error(`El cliente ${normalized} no existe en los datos de prueba`);
      }
      return { ...customer };
    }

    const customer = await this.customerRepo.findByCode(normalized);
    if (!customer) {
      throw new Error(`El cliente ${normalized} no existe`);
    }
    return customer;
  }

  private syncMockCustomer(updated: CustomerDTO) {
    const index = mockCxcStore.customers.findIndex((entry) => entry.id === updated.id);
    if (index !== -1) {
      mockCxcStore.customers[index] = { ...updated };
    }
  }

  private appendMockCreditLine(line: CustomerCreditLineDTO) {
    mockCxcStore.creditLines.unshift({ ...line });
  }

  private updateMockCreditLine(line: CustomerCreditLineDTO) {
    const index = mockCxcStore.creditLines.findIndex((entry) => entry.id === line.id);
    if (index !== -1) {
      mockCxcStore.creditLines[index] = { ...line };
    } else {
      this.appendMockCreditLine(line);
    }
  }

  private computeMockOutstanding(customerId: number): number {
    const total = mockCxcStore.documents
      .filter(
        (doc) =>
          doc.customerId === customerId &&
          doc.status !== "CANCELADO" &&
          isDebitDocumentType(doc.documentType) &&
          doc.balanceAmount > 0,
      )
      .reduce((acc, doc) => acc + doc.balanceAmount, 0);

    return Number(Math.max(0, total).toFixed(2));
  }

  private computeUsageSummary(customer: CustomerDTO): {
    available: number;
    usagePercentage: number;
    limitWarning: boolean;
  } {
    const rawAvailable = customer.creditLimit - customer.creditUsed - customer.creditOnHold;
    const availableCredit = rawAvailable > 0 ? Number(rawAvailable.toFixed(2)) : 0;
    const usagePercentage = customer.creditLimit > 0 ? (customer.creditUsed + customer.creditOnHold) / customer.creditLimit : 0;
    const limitWarning = usagePercentage >= 0.8;
    return {
      available: availableCredit,
      usagePercentage: Number(usagePercentage.toFixed(4)),
      limitWarning,
    };
  }

  async listByCustomer(code: string): Promise<CustomerCreditLineDTO[]> {
    this.assertRetailFeature();
    const customer = await this.getCustomerByCode(code);

    if (env.useMockData) {
      return mockCxcStore.creditLines
        .filter((line) => line.customerId === customer.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(cloneLine);
    }

    return this.repo.listByCustomer(customer.id);
  }

  async getOverview(code: string): Promise<CustomerCreditOverview> {
    this.assertRetailFeature();
    const customer = await this.getCustomerByCode(code);
    const lines = await this.listByCustomer(code);
    const latestLine = lines.length > 0 ? lines[0] : null;

    const summary = this.computeUsageSummary(customer);

    return {
      customer,
      lines,
      latestLine,
      availableCredit: summary.available,
      usagePercentage: summary.usagePercentage,
      limitWarning: summary.limitWarning,
      isBlocked: customer.creditStatus === "BLOCKED",
    };
  }

  async assignCreditLine(input: AssignCustomerCreditLineInput): Promise<{ line: CustomerCreditLineDTO; customer: CustomerDTO }> {
    this.assertRetailFeature();
    if (input.approvedLimit <= 0) {
      throw new Error("El límite aprobado debe ser mayor a cero");
    }

    const customer = await this.getCustomerByCode(input.customerCode);
    const status = resolveLineStatus(input.status) ?? "ACTIVE";
    const customerStatus = resolveCustomerStatus(
      input.customerStatus ?? mapLineStatusToCustomerStatus(status),
      customer.creditStatus,
    );

    const blockedAmount = typeof input.blockedAmount === "number" && input.blockedAmount >= 0 ? Number(input.blockedAmount.toFixed(2)) : customer.creditOnHold;
    const computedAvailable = computeAvailable(input.approvedLimit, customer.creditUsed, blockedAmount);
    const availableLimit = typeof input.availableLimit === "number" && input.availableLimit >= 0 ? Number(input.availableLimit.toFixed(2)) : computedAvailable;
    const reviewerId = typeof input.reviewerAdminUserId === "number" ? input.reviewerAdminUserId : null;
    const reviewNotes = typeof input.reviewNotes === "string" ? input.reviewNotes : null;
    const reviewedAt = toIsoDateTime(input.reviewedAt) ?? new Date().toISOString();
    const nextReviewAt = toIsoDateTime(input.nextReviewAt);
    const creditHoldReason = typeof input.creditHoldReason === "string" ? input.creditHoldReason : null;

    if (env.useMockData) {
      const line: CustomerCreditLineDTO = {
        id: mockCxcStore.sequences.creditLine++,
        customerId: customer.id,
        status,
        approvedLimit: Number(input.approvedLimit.toFixed(2)),
        availableLimit,
        blockedAmount,
        reviewerAdminUserId: reviewerId,
        reviewNotes,
        reviewedAt,
        nextReviewAt,
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      };
      this.appendMockCreditLine(line);

      const updatedCustomer: CustomerDTO = {
        ...customer,
        creditLimit: line.approvedLimit,
        creditOnHold: blockedAmount,
        creditStatus: customerStatus,
        creditHoldReason: customerStatus === "ACTIVE" ? null : creditHoldReason,
        lastCreditReviewAt: reviewedAt,
        nextCreditReviewAt: nextReviewAt,
        updatedAt: new Date().toISOString(),
      };
      this.syncMockCustomer(updatedCustomer);
      if (env.features.retailModeEnabled) {
        const refreshedCustomer = await this.syncCustomerCreditUsageByCustomerId(customer.id);
        return { line: cloneLine(line), customer: refreshedCustomer };
      }

      return { line: cloneLine(line), customer: updatedCustomer };
    }

    const result = await prisma.$transaction(async (tx) => {
      const created = await this.repo.create(
        {
          customerId: customer.id,
          status,
          approvedLimit: Number(input.approvedLimit.toFixed(2)),
          availableLimit,
          blockedAmount,
          reviewerAdminUserId: reviewerId,
          reviewNotes,
          reviewedAt,
          nextReviewAt,
        },
        tx,
      );

      const updatedCustomer = await this.customerRepo.update(
        customer.id,
        {
          creditLimit: created.approvedLimit,
          creditOnHold: blockedAmount,
          creditStatus: customerStatus,
          creditHoldReason: customerStatus === "ACTIVE" ? null : creditHoldReason ?? customer.creditHoldReason,
          lastCreditReviewAt: reviewedAt,
          nextCreditReviewAt: nextReviewAt,
        },
        tx,
      );

      return { line: created, customer: updatedCustomer };
    });

    if (env.features.retailModeEnabled) {
      const refreshed = await this.syncCustomerCreditUsageByCustomerId(result.customer.id);
      return { line: result.line, customer: refreshed };
    }

    return result;
  }

  async updateCreditLine(input: UpdateCustomerCreditLinePayload): Promise<{ line: CustomerCreditLineDTO; customer: CustomerDTO }> {
    this.assertRetailFeature();
    if (!input.id || input.id <= 0) {
      throw new Error("Debe indicar el identificador de la línea de crédito");
    }

    let existingLine: CustomerCreditLineDTO | null = null;
    if (env.useMockData) {
      existingLine = mockCxcStore.creditLines.find((line) => line.id === input.id) ?? null;
    } else {
      existingLine = await this.repo.findById(input.id);
    }

    if (!existingLine) {
      throw new Error("La línea de crédito indicada no existe");
    }

    let customer: CustomerDTO;
    if (env.useMockData) {
      const mockCustomer = mockCxcStore.customers.find((entry) => entry.id === existingLine.customerId);
      if (!mockCustomer) {
        throw new Error("El cliente asociado a la línea de crédito no existe en los datos de prueba");
      }
      customer = { ...mockCustomer };
    } else {
      const customerRecord = await this.customerRepo.findById(existingLine.customerId);
      if (!customerRecord) {
        throw new Error("El cliente asociado a la línea de crédito no existe");
      }
      customer = customerRecord;
    }

    const approvedLimit = typeof input.approvedLimit === "number" && input.approvedLimit > 0 ? Number(input.approvedLimit.toFixed(2)) : existingLine.approvedLimit;
    const blockedAmount = typeof input.blockedAmount === "number" && input.blockedAmount >= 0 ? Number(input.blockedAmount.toFixed(2)) : existingLine.blockedAmount;
    const status = resolveLineStatus(input.status ?? existingLine.status);
    const availableLimit = typeof input.availableLimit === "number" && input.availableLimit >= 0
      ? Number(input.availableLimit.toFixed(2))
      : computeAvailable(approvedLimit, customer.creditUsed, blockedAmount);
    const reviewerAdminUserId =
      typeof input.reviewerAdminUserId === "number"
        ? input.reviewerAdminUserId
        : input.reviewerAdminUserId === null
          ? null
          : existingLine.reviewerAdminUserId;
    const reviewNotes = typeof input.reviewNotes !== "undefined" ? input.reviewNotes : existingLine.reviewNotes;
    const reviewedAt = typeof input.reviewedAt !== "undefined" ? toIsoDateTime(input.reviewedAt) : existingLine.reviewedAt;
    const nextReviewAt = typeof input.nextReviewAt !== "undefined" ? toIsoDateTime(input.nextReviewAt) : existingLine.nextReviewAt;
    const creditHoldReason = typeof input.creditHoldReason === "string" ? input.creditHoldReason : undefined;
    const customerStatus = resolveCustomerStatus(
      input.customerStatus ?? mapLineStatusToCustomerStatus(status),
      customer.creditStatus,
    );

    if (env.useMockData) {
      const updatedLine: CustomerCreditLineDTO = {
        ...existingLine,
        status,
        approvedLimit,
        availableLimit,
        blockedAmount,
        reviewerAdminUserId,
        reviewNotes: typeof reviewNotes === "string" ? reviewNotes : existingLine.reviewNotes,
        reviewedAt: reviewedAt ?? existingLine.reviewedAt,
        nextReviewAt: typeof nextReviewAt !== "undefined" ? nextReviewAt : existingLine.nextReviewAt,
        updatedAt: new Date().toISOString(),
      };
      this.updateMockCreditLine(updatedLine);
      const updatedCustomer: CustomerDTO = {
        ...customer,
        creditLimit: approvedLimit,
        creditOnHold: blockedAmount,
        creditStatus: customerStatus,
        creditHoldReason: customerStatus === "ACTIVE" ? null : creditHoldReason ?? customer.creditHoldReason,
        lastCreditReviewAt: updatedLine.reviewedAt,
        nextCreditReviewAt: updatedLine.nextReviewAt,
        updatedAt: new Date().toISOString(),
      };
      this.syncMockCustomer(updatedCustomer);
      if (env.features.retailModeEnabled) {
        const refreshed = await this.syncCustomerCreditUsageByCustomerId(updatedCustomer.id);
        return { line: cloneLine(updatedLine), customer: refreshed };
      }

      return { line: cloneLine(updatedLine), customer: updatedCustomer };
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedLine = await this.repo.update(
        input.id,
        {
          status,
          approvedLimit,
          availableLimit,
          blockedAmount,
          reviewerAdminUserId,
          reviewNotes,
          reviewedAt,
          nextReviewAt,
        } satisfies RepoUpdateCustomerCreditLineInput,
        tx,
      );

      const updatedCustomer = await this.customerRepo.update(
        customer.id,
        {
          creditLimit: approvedLimit,
          creditOnHold: blockedAmount,
          creditStatus: customerStatus,
          creditHoldReason: customerStatus === "ACTIVE" ? null : creditHoldReason ?? customer.creditHoldReason,
          lastCreditReviewAt: updatedLine.reviewedAt,
          nextCreditReviewAt: updatedLine.nextReviewAt,
        },
        tx,
      );

      return { line: updatedLine, customer: updatedCustomer };
    });

    if (env.features.retailModeEnabled) {
      const refreshed = await this.syncCustomerCreditUsageByCustomerId(result.customer.id);
      return { line: result.line, customer: refreshed };
    }

    return result;
  }

  async updateCustomerCreditStatus(input: UpdateCustomerCreditStatusInput): Promise<CustomerDTO> {
    this.assertRetailFeature();
    const status = resolveCustomerStatus(input.status, "ACTIVE");
    const customer = await this.getCustomerByCode(input.customerCode);
    const creditHoldReason = typeof input.creditHoldReason === "string" ? input.creditHoldReason : null;

    if (env.useMockData) {
      const updated: CustomerDTO = {
        ...customer,
        creditStatus: status,
        creditHoldReason: status === "ACTIVE" ? null : creditHoldReason,
        updatedAt: new Date().toISOString(),
      };
      this.syncMockCustomer(updated);
      return updated;
    }

    return this.customerRepo.update(customer.id, {
      creditStatus: status,
      creditHoldReason: status === "ACTIVE" ? null : creditHoldReason,
    });
  }

  async syncCustomerCreditUsageByCustomerId(customerId: number, options: { tx?: Prisma.TransactionClient } = {}): Promise<CustomerDTO> {
    this.assertRetailFeature();

    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.id === customerId);
      if (!customer) {
        throw new Error("El cliente indicado no existe en los datos de prueba");
      }
      const outstanding = this.computeMockOutstanding(customerId);
      customer.creditUsed = outstanding;
      customer.updatedAt = new Date().toISOString();
      return { ...customer };
    }

    const customer = await this.customerRepo.findById(customerId, options.tx);
    if (!customer) {
      throw new Error("El cliente indicado no existe");
    }

    const outstanding = await this.documentRepo.sumOutstandingByCustomer(customerId, options.tx);
    const normalized = Number(Math.max(0, outstanding).toFixed(2));
    return this.customerRepo.update(customerId, { creditUsed: normalized }, options.tx);
  }
}

export const customerCreditLineService = new CustomerCreditLineService();
