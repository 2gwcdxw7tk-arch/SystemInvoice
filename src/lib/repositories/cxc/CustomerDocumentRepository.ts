import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CustomerDocumentDTO, CustomerDocumentStatus, CustomerDocumentType } from "@/lib/types/cxc";
import { bigIntToNumber, dateOnlyToIso, dateTimeToIso, decimalToNumber, jsonToRecord } from "./mappers";

type DocumentRow = Prisma.customer_documentsGetPayload<{
  include: {
    customers: { select: { id: true; code: true; name: true } };
    payment_terms: { select: { id: true; code: true } };
  };
}>;

export type ListCustomerDocumentOptions = {
  customerId?: number;
  status?: CustomerDocumentStatus[];
  types?: CustomerDocumentType[];
  includeSettled?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: "documentDate" | "dueDate" | "createdAt";
  orderDirection?: "asc" | "desc";
};

export type CreateCustomerDocumentInput = {
  customerId: number;
  paymentTermId?: number | null;
  relatedInvoiceId?: number | null;
  documentType: CustomerDocumentType;
  documentNumber: string;
  documentDate: string | Date;
  dueDate?: string | Date | null;
  currencyCode?: string;
  originalAmount: number;
  balanceAmount?: number;
  status?: CustomerDocumentStatus;
  reference?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type UpdateCustomerDocumentInput = Partial<
  Pick<
    CreateCustomerDocumentInput,
    | "paymentTermId"
    | "documentDate"
    | "dueDate"
    | "currencyCode"
    | "status"
    | "reference"
    | "notes"
    | "metadata"
  >
> & { balanceAmount?: number };

const defaultInclude = {
  customers: { select: { id: true, code: true, name: true } },
  payment_terms: { select: { id: true, code: true } },
} satisfies Prisma.customer_documentsInclude;

const serializeMetadataInput = (metadata: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull | undefined => {
  if (typeof metadata === "undefined") {
    return undefined;
  }
  if (metadata === null) {
    return Prisma.JsonNull;
  }
  return metadata as Prisma.InputJsonValue;
};

const mapDocument = (row: DocumentRow): CustomerDocumentDTO => ({
  id: bigIntToNumber(row.id),
  customerId: bigIntToNumber(row.customer_id),
  customerCode: row.customers.code,
  customerName: row.customers.name,
  documentType: row.document_type as CustomerDocumentType,
  documentNumber: row.document_number,
  documentDate: dateOnlyToIso(row.document_date)!,
  dueDate: dateOnlyToIso(row.due_date),
  currencyCode: row.currency_code,
  originalAmount: decimalToNumber(row.original_amount),
  balanceAmount: decimalToNumber(row.balance_amount),
  status: row.status as CustomerDocumentStatus,
  reference: row.reference ?? null,
  notes: row.notes ?? null,
  metadata: jsonToRecord(row.metadata),
  paymentTermId: row.payment_term_id ?? null,
  paymentTermCode: row.payment_terms?.code ?? null,
  relatedInvoiceId: row.related_invoice_id ? bigIntToNumber(row.related_invoice_id) : null,
  createdAt: dateTimeToIso(row.created_at)!,
  updatedAt: dateTimeToIso(row.updated_at),
});

const resolveOrder = (orderBy: ListCustomerDocumentOptions["orderBy"], direction: "asc" | "desc") => {
  switch (orderBy) {
    case "dueDate":
      return [{ due_date: direction }, { document_date: direction }];
    case "createdAt":
      return [{ created_at: direction }];
    case "documentDate":
    default:
      return [{ document_date: direction }, { id: direction }];
  }
};

export class CustomerDocumentRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  async list(options: ListCustomerDocumentOptions = {}, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO[]> {
    const client = this.getClient(tx);
    const where: Prisma.customer_documentsWhereInput = {};

    if (typeof options.customerId === "number" && options.customerId > 0) {
      where.customer_id = BigInt(options.customerId);
    }

    if (options.types && options.types.length > 0) {
      where.document_type = { in: options.types };
    }

    if (options.status && options.status.length > 0) {
      where.status = { in: options.status };
    } else if (!options.includeSettled) {
      where.status = { in: ["PENDIENTE", "BORRADOR"] };
    }

    if (options.search && options.search.trim().length > 0) {
      const query = options.search.trim();
      where.OR = [
        { document_number: { contains: query, mode: "insensitive" } },
        { reference: { contains: query, mode: "insensitive" } },
        { notes: { contains: query, mode: "insensitive" } },
      ];
    }

    const limit = options.limit && options.limit > 0 ? options.limit : undefined;
    const offset = options.offset && options.offset > 0 ? options.offset : undefined;
    const orderDirection = options.orderDirection === "asc" ? "asc" : "desc";
    const orderBy = resolveOrder(options.orderBy, orderDirection);

    const rows = await client.customer_documents.findMany({
      where,
      include: defaultInclude,
      take: limit,
      skip: offset,
      orderBy,
    });

    return rows.map(mapDocument);
  }

  async findById(id: number, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_documents.findUnique({
      where: { id: BigInt(id) },
      include: defaultInclude,
    });
    return row ? mapDocument(row) : null;
  }

  async findByInvoiceId(invoiceId: number, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_documents.findFirst({
      where: { related_invoice_id: BigInt(invoiceId) },
      include: defaultInclude,
    });
    return row ? mapDocument(row) : null;
  }

  async findByDocumentNumber(documentType: CustomerDocumentType, documentNumber: string, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_documents.findFirst({
      where: {
        document_type: documentType,
        document_number: documentNumber.trim().toUpperCase(),
      },
      include: defaultInclude,
    });
    return row ? mapDocument(row) : null;
  }

  async create(input: CreateCustomerDocumentInput, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO> {
    const client = this.getClient(tx);
    const now = new Date();
    const payload: Prisma.customer_documentsUncheckedCreateInput = {
      customer_id: BigInt(input.customerId),
      payment_term_id: typeof input.paymentTermId === "number" ? input.paymentTermId : null,
      related_invoice_id: input.relatedInvoiceId ? BigInt(input.relatedInvoiceId) : null,
      document_type: input.documentType,
      document_number: input.documentNumber.trim().toUpperCase(),
      document_date: new Date(input.documentDate),
      due_date: input.dueDate ? new Date(input.dueDate) : null,
      currency_code: input.currencyCode?.trim().toUpperCase() ?? "NIO",
      original_amount: input.originalAmount,
      balance_amount: typeof input.balanceAmount === "number" ? input.balanceAmount : input.originalAmount,
      status: input.status ?? "PENDIENTE",
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      metadata: serializeMetadataInput(input.metadata),
      created_at: now,
      updated_at: now,
    };

    const row = await client.customer_documents.create({ data: payload, include: defaultInclude });
    return mapDocument(row);
  }

  async update(id: number, input: UpdateCustomerDocumentInput, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO> {
    const client = this.getClient(tx);
    const updates: Prisma.customer_documentsUpdateInput = {
      updated_at: new Date(),
    };

    if (typeof input.paymentTermId === "number" || input.paymentTermId === null) {
      updates.payment_terms = input.paymentTermId ? { connect: { id: input.paymentTermId } } : { disconnect: true };
    }

    if (typeof input.documentDate !== "undefined") {
      updates.document_date = input.documentDate ? new Date(input.documentDate) : undefined;
    }

    if (typeof input.dueDate !== "undefined") {
      updates.due_date = input.dueDate ? new Date(input.dueDate) : null;
    }

    if (typeof input.currencyCode === "string") {
      updates.currency_code = input.currencyCode.trim().toUpperCase();
    }

    if (typeof input.status === "string") {
      updates.status = input.status;
    }

    if (typeof input.reference !== "undefined") {
      updates.reference = input.reference;
    }

    if (typeof input.notes !== "undefined") {
      updates.notes = input.notes;
    }

    const serializedMetadata = serializeMetadataInput(input.metadata);
    if (typeof serializedMetadata !== "undefined") {
      updates.metadata = serializedMetadata;
    }

    if (typeof input.balanceAmount === "number") {
      updates.balance_amount = input.balanceAmount;
    }

    const row = await client.customer_documents.update({
      where: { id: BigInt(id) },
      data: updates,
      include: defaultInclude,
    });

    return mapDocument(row);
  }

  async adjustBalance(id: number, delta: number, tx?: Prisma.TransactionClient): Promise<CustomerDocumentDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_documents.update({
      where: { id: BigInt(id) },
      data: {
        balance_amount: { increment: delta },
        updated_at: new Date(),
      },
      include: defaultInclude,
    });
    return mapDocument(row);
  }

  async setStatus(id: number, status: CustomerDocumentStatus, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.customer_documents.update({
      where: { id: BigInt(id) },
      data: { status, updated_at: new Date() },
    });
  }

  async sumOutstandingByCustomer(customerId: number, tx?: Prisma.TransactionClient): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.customer_documents.aggregate({
      _sum: { balance_amount: true },
      where: {
        customer_id: BigInt(customerId),
        document_type: { in: ["INVOICE", "DEBIT_NOTE"] },
        status: { not: "CANCELADO" },
        balance_amount: { gt: 0 },
      },
    });

    const total = result._sum.balance_amount ?? new Prisma.Decimal(0);
    return decimalToNumber(total);
  }
}

export const customerDocumentRepository = new CustomerDocumentRepository();
