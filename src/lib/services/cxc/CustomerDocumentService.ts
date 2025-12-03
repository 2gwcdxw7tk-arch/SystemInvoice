import { env } from "@/lib/env";
import {
  customerDocumentRepository,
  type CreateCustomerDocumentInput,
  type CustomerDocumentRepository,
  type ListCustomerDocumentOptions,
  type UpdateCustomerDocumentInput,
} from "@/lib/repositories/cxc/CustomerDocumentRepository";
import type { CustomerDocumentDTO, CustomerDocumentStatus, CustomerDocumentType } from "@/lib/types/cxc";
import { toCentralClosedDate } from "@/lib/utils/date";

import { paymentTermService } from "./PaymentTermService";
import { customerCreditLineService } from "./CustomerCreditLineService";
import { mockCxcStore } from "./mock-data";

const formatDate = (value: string | Date | null | undefined): string | null => {
  if (!value) return null;
  const date = toCentralClosedDate(value);
  return date.toISOString().slice(0, 10);
};

const cloneDocument = (doc: CustomerDocumentDTO): CustomerDocumentDTO => ({ ...doc });

type ServiceCreateDocumentInput = Omit<CreateCustomerDocumentInput, "paymentTermId" | "documentDate" | "dueDate" | "metadata"> & {
  paymentTermId?: number | null;
  paymentTermCode?: string | null;
  documentDate: string | Date;
  dueDate?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

type ServiceUpdateDocumentInput = UpdateCustomerDocumentInput & {
  paymentTermCode?: string | null;
};

const normalizeDocumentNumber = (value: string) => value.trim().toUpperCase();

const isDebitDocumentType = (type: CustomerDocumentDTO["documentType"]): boolean =>
  type === "INVOICE" || type === "DEBIT_NOTE";

export class CustomerDocumentService {
  constructor(private readonly repo: CustomerDocumentRepository = customerDocumentRepository) {}

  private resolveStatus(status?: CustomerDocumentStatus | null, balance?: number): CustomerDocumentStatus {
    if (status) return status;
    if (typeof balance === "number" && balance <= 0) return "PAGADO";
    return "PENDIENTE";
  }

  private async resolvePaymentTerm(input: { paymentTermId?: number | null; paymentTermCode?: string | null }) {
    if (typeof input.paymentTermId === "number") {
      const term = env.useMockData
        ? mockCxcStore.paymentTerms.find((entry) => entry.id === input.paymentTermId) ?? null
        : await paymentTermService.getById(input.paymentTermId);
      if (!term) throw new Error("La condición de pago indicada no existe");
      return term;
    }
    if (input.paymentTermCode) {
      const term = await paymentTermService.getByCode(input.paymentTermCode);
      if (!term) throw new Error("La condición de pago indicada no existe");
      return term;
    }
    return null;
  }

  private ensureCustomerExists(customerId: number) {
    const customer = mockCxcStore.customers.find((entry) => entry.id === customerId);
    if (!customer) {
      throw new Error("El cliente indicado no existe en los datos de prueba");
    }
    return customer;
  }

  async list(options: ListCustomerDocumentOptions = {}): Promise<CustomerDocumentDTO[]> {
    if (env.useMockData) {
      const includeSettled = Boolean(options.includeSettled);
      const search = options.search?.trim().toLowerCase();
      const normalizeFilterDate = (value?: string | Date): string | null => {
        if (!value) return null;
        try {
          return toCentralClosedDate(value).toISOString().slice(0, 10);
        } catch {
          return null;
        }
      };
      const documentDateFrom = normalizeFilterDate(options.documentDateFrom);
      const documentDateTo = normalizeFilterDate(options.documentDateTo);
      const filtered = mockCxcStore.documents.filter((doc) => {
        if (typeof options.customerId === "number" && doc.customerId !== options.customerId) {
            return false;
        }
        if (!includeSettled && doc.status === "PAGADO") {
            return false;
        }
        if (options.types && options.types.length > 0 && !options.types.includes(doc.documentType)) {
            return false;
        }
        if (options.status && options.status.length > 0 && !options.status.includes(doc.status)) {
            return false;
        }
        if (documentDateFrom && doc.documentDate < documentDateFrom) {
          return false;
        }
        if (documentDateTo && doc.documentDate > documentDateTo) {
          return false;
        }
        if (search) {
          const haystack = `${doc.documentNumber} ${doc.reference ?? ""} ${doc.notes ?? ""}`.toLowerCase();
          if (!haystack.includes(search)) {
            return false;
          }
        }
        return true;
      });
      const limit = options.limit && options.limit > 0 ? options.limit : filtered.length;
      const direction = options.orderDirection === "asc" ? 1 : -1;
      const sorted = filtered.sort((a, b) => {
        switch (options.orderBy) {
          case "dueDate": {
            const dueA = a.dueDate ?? "";
            const dueB = b.dueDate ?? "";
            return direction * dueA.localeCompare(dueB);
          }
          case "createdAt":
            return direction * a.createdAt.localeCompare(b.createdAt);
          case "documentDate":
          default:
            return direction * a.documentDate.localeCompare(b.documentDate);
        }
      });
      return sorted.slice(0, limit).map(cloneDocument);
    }

    return this.repo.list(options);
  }

  async getById(id: number): Promise<CustomerDocumentDTO | null> {
    if (env.useMockData) {
      const doc = mockCxcStore.documents.find((entry) => entry.id === id);
      return doc ? cloneDocument(doc) : null;
    }

    return this.repo.findById(id);
  }

  async getByInvoiceId(invoiceId: number): Promise<CustomerDocumentDTO | null> {
    if (env.useMockData) {
      const doc = mockCxcStore.documents.find((entry) => entry.relatedInvoiceId === invoiceId);
      return doc ? cloneDocument(doc) : null;
    }
    return this.repo.findByInvoiceId(invoiceId);
  }

  async findByDocumentNumber(documentType: CustomerDocumentType, documentNumber: string): Promise<CustomerDocumentDTO | null> {
    if (env.useMockData) {
      const normalized = normalizeDocumentNumber(documentNumber);
      const doc = mockCxcStore.documents.find((entry) => entry.documentType === documentType && entry.documentNumber === normalized);
      return doc ? cloneDocument(doc) : null;
    }
    return this.repo.findByDocumentNumber(documentType, documentNumber);
  }

  private computeDueDate(documentDate: string | Date, paymentTerm: Awaited<ReturnType<typeof paymentTermService.getById>> | null, override?: string | Date | null) {
    if (override) {
      return formatDate(override);
    }
    if (!paymentTerm || paymentTerm.days <= 0) {
      return formatDate(documentDate);
    }
    const computed = paymentTermService.calculateDueDate(documentDate, { days: paymentTerm.days, graceDays: paymentTerm.graceDays });
    return computed.toISOString().slice(0, 10);
  }

  async create(input: ServiceCreateDocumentInput): Promise<CustomerDocumentDTO> {
    if (input.originalAmount <= 0) {
      throw new Error("El monto del documento debe ser mayor a cero");
    }
    const paymentTerm = await this.resolvePaymentTerm({ paymentTermId: input.paymentTermId ?? null, paymentTermCode: input.paymentTermCode ?? null });
    const dueDate = this.computeDueDate(input.documentDate, paymentTerm, input.dueDate ?? null);
    const status = this.resolveStatus(input.status ?? null, input.balanceAmount ?? input.originalAmount);

    if (env.useMockData) {
      const customer = this.ensureCustomerExists(input.customerId);
      const document: CustomerDocumentDTO = {
        id: mockCxcStore.sequences.document++,
        customerId: customer.id,
        customerCode: customer.code,
        customerName: customer.name,
        documentType: input.documentType,
        documentNumber: normalizeDocumentNumber(input.documentNumber),
        documentDate: formatDate(input.documentDate)!,
        dueDate,
        currencyCode: input.currencyCode ?? "NIO",
        originalAmount: input.originalAmount,
        balanceAmount: typeof input.balanceAmount === "number" ? input.balanceAmount : input.originalAmount,
        status,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? null,
        paymentTermId: paymentTerm ? paymentTerm.id : null,
        paymentTermCode: paymentTerm ? paymentTerm.code : null,
        relatedInvoiceId: input.relatedInvoiceId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.documents.push(document);

      if (env.features.retailModeEnabled && isDebitDocumentType(document.documentType)) {
        await customerCreditLineService.syncCustomerCreditUsageByCustomerId(customer.id);
      }

      return cloneDocument(document);
    }

    const created = await this.repo.create({
      customerId: input.customerId,
      paymentTermId: paymentTerm ? paymentTerm.id : undefined,
      relatedInvoiceId: input.relatedInvoiceId,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      documentDate: toCentralClosedDate(input.documentDate),
      dueDate: dueDate ? new Date(`${dueDate}T00:00:00`) : null,
      currencyCode: input.currencyCode ?? "NIO",
      originalAmount: input.originalAmount,
      balanceAmount: typeof input.balanceAmount === "number" ? input.balanceAmount : input.originalAmount,
      status,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? null,
    });

    if (env.features.retailModeEnabled && isDebitDocumentType(created.documentType)) {
      await customerCreditLineService.syncCustomerCreditUsageByCustomerId(created.customerId);
    }

    return created;
  }

  async update(id: number, input: ServiceUpdateDocumentInput): Promise<CustomerDocumentDTO> {
    if (env.useMockData) {
      const index = mockCxcStore.documents.findIndex((entry) => entry.id === id);
      if (index === -1) {
        throw new Error("El documento indicado no existe");
      }
      const current = mockCxcStore.documents[index];
      const paymentTerm =
        typeof input.paymentTermId === "number" || input.paymentTermCode
          ? await this.resolvePaymentTerm({ paymentTermId: input.paymentTermId ?? null, paymentTermCode: input.paymentTermCode ?? null })
          : null;
      const updated: CustomerDocumentDTO = {
        ...current,
        documentDate: typeof input.documentDate !== "undefined" ? formatDate(input.documentDate ?? current.documentDate)! : current.documentDate,
        dueDate: typeof input.dueDate !== "undefined" ? formatDate(input.dueDate) : current.dueDate,
        currencyCode: typeof input.currencyCode === "string" ? input.currencyCode : current.currencyCode,
        balanceAmount: typeof input.balanceAmount === "number" ? input.balanceAmount : current.balanceAmount,
        status: input.status ? input.status : current.status,
        reference: typeof input.reference !== "undefined" ? input.reference : current.reference,
        notes: typeof input.notes !== "undefined" ? input.notes : current.notes,
        metadata: typeof input.metadata !== "undefined" ? input.metadata : current.metadata,
        paymentTermId:
          paymentTerm && typeof paymentTerm.id === "number"
            ? paymentTerm.id
            : paymentTerm === null && typeof input.paymentTermId !== "undefined"
              ? null
              : current.paymentTermId,
        paymentTermCode:
          paymentTerm && typeof paymentTerm.code === "string"
            ? paymentTerm.code
            : paymentTerm === null && typeof input.paymentTermCode !== "undefined"
              ? null
              : current.paymentTermCode,
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.documents[index] = updated;

      if (env.features.retailModeEnabled && isDebitDocumentType(updated.documentType)) {
        await customerCreditLineService.syncCustomerCreditUsageByCustomerId(updated.customerId);
      }

      return cloneDocument(updated);
    }

    const updated = await this.repo.update(id, {
      documentDate: typeof input.documentDate !== "undefined" ? input.documentDate : undefined,
      dueDate: typeof input.dueDate !== "undefined" ? input.dueDate : undefined,
      currencyCode: typeof input.currencyCode === "string" ? input.currencyCode : undefined,
      balanceAmount: typeof input.balanceAmount === "number" ? input.balanceAmount : undefined,
      status: input.status,
      reference: typeof input.reference !== "undefined" ? input.reference : undefined,
      notes: typeof input.notes !== "undefined" ? input.notes : undefined,
      metadata: typeof input.metadata !== "undefined" ? input.metadata : undefined,
      paymentTermId:
        typeof input.paymentTermId === "number"
          ? input.paymentTermId
          : input.paymentTermId === null
            ? null
            : undefined,
    });

    if (env.features.retailModeEnabled && isDebitDocumentType(updated.documentType)) {
      await customerCreditLineService.syncCustomerCreditUsageByCustomerId(updated.customerId);
    }

    return updated;
  }

  async adjustBalance(id: number, delta: number): Promise<CustomerDocumentDTO> {
    if (env.useMockData) {
      const index = mockCxcStore.documents.findIndex((entry) => entry.id === id);
      if (index === -1) {
        throw new Error("El documento indicado no existe");
      }
      const updatedBalance = mockCxcStore.documents[index].balanceAmount + delta;
      if (updatedBalance < -0.01) {
        throw new Error("El saldo del documento no puede ser negativo");
      }
      mockCxcStore.documents[index].balanceAmount = Math.max(0, Number(updatedBalance.toFixed(2)));
      mockCxcStore.documents[index].status = mockCxcStore.documents[index].balanceAmount <= 0 ? "PAGADO" : mockCxcStore.documents[index].status;
      mockCxcStore.documents[index].updatedAt = new Date().toISOString();

      const updated = mockCxcStore.documents[index];

      if (env.features.retailModeEnabled && isDebitDocumentType(updated.documentType)) {
        await customerCreditLineService.syncCustomerCreditUsageByCustomerId(updated.customerId);
      }

      return cloneDocument(updated);
    }

    const updated = await this.repo.adjustBalance(id, delta);

    if (env.features.retailModeEnabled && isDebitDocumentType(updated.documentType)) {
      await customerCreditLineService.syncCustomerCreditUsageByCustomerId(updated.customerId);
    }

    return updated;
  }

  async setStatus(id: number, status: CustomerDocumentStatus): Promise<void> {
    if (env.useMockData) {
      const doc = mockCxcStore.documents.find((entry) => entry.id === id);
      if (doc) {
        doc.status = status;
        doc.updatedAt = new Date().toISOString();

        if (env.features.retailModeEnabled && isDebitDocumentType(doc.documentType)) {
          await customerCreditLineService.syncCustomerCreditUsageByCustomerId(doc.customerId);
        }
      }
      return;
    }

    const target = await this.repo.findById(id);

    if (!target) {
      return;
    }

    await this.repo.setStatus(id, status);

    if (env.features.retailModeEnabled && isDebitDocumentType(target.documentType)) {
      await customerCreditLineService.syncCustomerCreditUsageByCustomerId(target.customerId);
    }
  }
}

export const customerDocumentService = new CustomerDocumentService();
