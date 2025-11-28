import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import {
  customerDisputeRepository,
  type CreateCustomerDisputeInput as RepositoryCreateCustomerDisputeInput,
  type CustomerDisputeRepository,
  type UpdateCustomerDisputeInput as RepositoryUpdateCustomerDisputeInput,
} from "@/lib/repositories/cxc/CustomerDisputeRepository";
import { customerDocumentRepository, type CustomerDocumentRepository } from "@/lib/repositories/cxc/CustomerDocumentRepository";
import { customerRepository, type CustomerRepository } from "@/lib/repositories/cxc/CustomerRepository";
import type { CustomerDisputeDTO, CustomerDocumentDTO, CustomerDTO } from "@/lib/types/cxc";

import { mockCxcStore } from "./mock-data";

const DISPUTE_STATUSES: ReadonlyArray<CustomerDisputeDTO["status"]> = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
];

const normalizeOptionalString = (value: string | null | undefined, maxLength: number): string | null => {
  if (typeof value !== "string") {
    return value ?? null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.slice(0, maxLength);
};

const normalizeStatus = (value: string | null | undefined, fallback: CustomerDisputeDTO["status"]): CustomerDisputeDTO["status"] => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toUpperCase();
  return DISPUTE_STATUSES.includes(normalized as CustomerDisputeDTO["status"])
    ? (normalized as CustomerDisputeDTO["status"])
    : fallback;
};

const parseResolvedAt = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("La fecha de resolución no es válida");
  }
  return date.toISOString();
};

export type ListCustomerDisputesOptions = {
  customerId: number;
  documentId?: number;
  statuses?: CustomerDisputeDTO["status"][];
};

export type CreateCustomerDisputePayload = {
  customerId: number;
  documentId?: number | null;
  disputeCode?: string | null;
  description?: string | null;
  status?: CustomerDisputeDTO["status"];
  resolutionNotes?: string | null;
  resolvedAt?: string | Date | null;
  createdBy?: number | null;
};

export type UpdateCustomerDisputePayload = {
  id: number;
  documentId?: number | null;
  disputeCode?: string | null;
  description?: string | null;
  status?: CustomerDisputeDTO["status"];
  resolutionNotes?: string | null;
  resolvedAt?: string | Date | null;
};

export class CustomerDisputeService {
  constructor(
    private readonly repo: CustomerDisputeRepository = customerDisputeRepository,
    private readonly customerRepo: CustomerRepository = customerRepository,
    private readonly documentRepo: CustomerDocumentRepository = customerDocumentRepository,
  ) {}

  private async ensureCustomer(customerId: number): Promise<CustomerDTO> {
    if (customerId <= 0) {
      throw new Error("Debe indicar el cliente");
    }

    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.id === customerId);
      if (!customer) {
        throw new Error("El cliente indicado no existe");
      }
      return { ...customer };
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new Error("El cliente indicado no existe");
    }
    return customer;
  }

  private async ensureDocumentBelongsToCustomer(customer: CustomerDTO, documentId: number | null | undefined): Promise<CustomerDocumentDTO | null> {
    if (!documentId) {
      return null;
    }

    if (env.useMockData) {
      const document = mockCxcStore.documents.find((entry) => entry.id === documentId);
      if (!document) {
        throw new Error("El documento indicado no existe");
      }
      if (document.customerId !== customer.id) {
        throw new Error("El documento no pertenece al cliente indicado");
      }
      return { ...document };
    }

    const document = await this.documentRepo.findById(documentId);
    if (!document) {
      throw new Error("El documento indicado no existe");
    }
    if (document.customerId !== customer.id) {
      throw new Error("El documento no pertenece al cliente indicado");
    }
    return document;
  }

  async list(options: ListCustomerDisputesOptions): Promise<CustomerDisputeDTO[]> {
    const customer = await this.ensureCustomer(options.customerId);
    const allowedStatuses = options.statuses && options.statuses.length > 0 ? new Set(options.statuses) : null;

    const filterByDocument = (entry: CustomerDisputeDTO) =>
      typeof options.documentId === "number" ? entry.documentId === options.documentId : true;

    const filterByStatus = (entry: CustomerDisputeDTO) => (allowedStatuses ? allowedStatuses.has(entry.status) : true);

    if (env.useMockData) {
      return mockCxcStore.disputes
        .filter((entry) => entry.customerId === customer.id)
        .filter(filterByDocument)
        .filter(filterByStatus)
        .map((entry) => ({ ...entry }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const rows = await this.repo.listByCustomer(customer.id);
    return rows.filter(filterByDocument).filter(filterByStatus).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: CreateCustomerDisputePayload): Promise<CustomerDisputeDTO> {
    const customer = await this.ensureCustomer(input.customerId);
    const document = await this.ensureDocumentBelongsToCustomer(customer, input.documentId ?? null);

    const payload = {
      customerId: customer.id,
      documentId: document ? document.id : null,
      disputeCode: normalizeOptionalString(input.disputeCode, 60),
      description: normalizeOptionalString(input.description, 600),
      status: normalizeStatus(input.status ?? null, "OPEN"),
      resolutionNotes: normalizeOptionalString(input.resolutionNotes, 600),
      resolvedAt: parseResolvedAt(input.resolvedAt),
      createdBy: typeof input.createdBy === "number" ? input.createdBy : null,
    } satisfies CreateCustomerDisputePayload;

    if (env.useMockData) {
      const dispute: CustomerDisputeDTO = {
        id: mockCxcStore.sequences.dispute++,
        customerId: payload.customerId,
        documentId: payload.documentId,
        disputeCode: payload.disputeCode,
        description: payload.description,
        status: payload.status,
        resolutionNotes: payload.resolutionNotes,
        resolvedAt: payload.resolvedAt,
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.disputes.unshift(dispute);
      return { ...dispute };
    }

    const record = await prisma.$transaction((tx) =>
      this.repo.create(
        {
          customerId: payload.customerId,
          documentId: payload.documentId,
          disputeCode: payload.disputeCode,
          description: payload.description,
          status: payload.status,
          resolutionNotes: payload.resolutionNotes,
          resolvedAt: payload.resolvedAt,
          createdBy: payload.createdBy ?? undefined,
        } satisfies RepositoryCreateCustomerDisputeInput,
        tx,
      ),
    );

    return record;
  }

  async update(input: UpdateCustomerDisputePayload): Promise<CustomerDisputeDTO> {
    if (input.id <= 0) {
      throw new Error("Debe indicar el identificador de la disputa");
    }

    if (env.useMockData) {
      const index = mockCxcStore.disputes.findIndex((entry) => entry.id === input.id);
      if (index === -1) {
        throw new Error("La disputa indicada no existe");
      }
      const current = mockCxcStore.disputes[index];
      const customer = await this.ensureCustomer(current.customerId);
      await this.ensureDocumentBelongsToCustomer(customer, typeof input.documentId === "number" ? input.documentId : input.documentId === null ? null : current.documentId);

      const updated: CustomerDisputeDTO = {
        ...current,
        documentId:
          typeof input.documentId === "number"
            ? input.documentId
            : input.documentId === null
              ? null
              : current.documentId,
        disputeCode: typeof input.disputeCode !== "undefined" ? normalizeOptionalString(input.disputeCode, 60) : current.disputeCode,
        description: typeof input.description !== "undefined" ? normalizeOptionalString(input.description, 600) : current.description,
        status: input.status ? normalizeStatus(input.status, current.status) : current.status,
        resolutionNotes: typeof input.resolutionNotes !== "undefined" ? normalizeOptionalString(input.resolutionNotes, 600) : current.resolutionNotes,
        resolvedAt: typeof input.resolvedAt !== "undefined" ? parseResolvedAt(input.resolvedAt) : current.resolvedAt,
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.disputes[index] = updated;
      return { ...updated };
    }

    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new Error("La disputa indicada no existe");
    }

    const customer = await this.ensureCustomer(existing.customerId);
    const documentIdNormalized =
      typeof input.documentId === "number"
        ? input.documentId
        : input.documentId === null
          ? null
          : existing.documentId;
    await this.ensureDocumentBelongsToCustomer(customer, documentIdNormalized);

    const updatePayload: RepositoryUpdateCustomerDisputeInput = {
      documentId: typeof input.documentId !== "undefined" ? documentIdNormalized : undefined,
      disputeCode: typeof input.disputeCode !== "undefined" ? normalizeOptionalString(input.disputeCode, 60) : undefined,
      description: typeof input.description !== "undefined" ? normalizeOptionalString(input.description, 600) : undefined,
      status: input.status ? normalizeStatus(input.status, existing.status) : undefined,
      resolutionNotes: typeof input.resolutionNotes !== "undefined" ? normalizeOptionalString(input.resolutionNotes, 600) : undefined,
      resolvedAt: typeof input.resolvedAt !== "undefined" ? parseResolvedAt(input.resolvedAt) : undefined,
    };

    return prisma.$transaction((tx) => this.repo.update(input.id, updatePayload, tx));
  }
}

export const customerDisputeService = new CustomerDisputeService();