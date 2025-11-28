import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CustomerDocumentApplicationDTO } from "@/lib/types/cxc";

import { bigIntToNumber, dateTimeToIso, decimalToNumber } from "./mappers";

type ApplicationRow = Prisma.customer_document_applicationsGetPayload<Prisma.customer_document_applicationsDefaultArgs>;

export type ListApplicationsOptions = {
  appliedDocumentId?: number;
  targetDocumentId?: number;
};

export type CreateCustomerDocumentApplicationInput = {
  appliedDocumentId: number;
  targetDocumentId: number;
  amount: number;
  applicationDate?: string | Date;
  reference?: string | null;
  notes?: string | null;
};

export class CustomerDocumentApplicationRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  private map(row: ApplicationRow): CustomerDocumentApplicationDTO {
    return {
      id: bigIntToNumber(row.id),
      appliedDocumentId: bigIntToNumber(row.applied_document_id),
      targetDocumentId: bigIntToNumber(row.target_document_id),
      applicationDate: dateTimeToIso(row.application_date)!,
      amount: decimalToNumber(row.amount),
      reference: row.reference ?? null,
      notes: row.notes ?? null,
      createdAt: dateTimeToIso(row.created_at)!,
    } satisfies CustomerDocumentApplicationDTO;
  }

  async list(options: ListApplicationsOptions = {}, tx?: Prisma.TransactionClient): Promise<CustomerDocumentApplicationDTO[]> {
    const client = this.getClient(tx);
    const where: Prisma.customer_document_applicationsWhereInput = {};

    if (typeof options.appliedDocumentId === "number") {
      where.applied_document_id = BigInt(options.appliedDocumentId);
    }

    if (typeof options.targetDocumentId === "number") {
      where.target_document_id = BigInt(options.targetDocumentId);
    }

    const rows = await client.customer_document_applications.findMany({
      where,
      orderBy: [{ application_date: "desc" }, { id: "desc" }],
    });

    return rows.map((row) => this.map(row));
  }

  async findById(id: number, tx?: Prisma.TransactionClient): Promise<CustomerDocumentApplicationDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_document_applications.findUnique({ where: { id: BigInt(id) } });
    return row ? this.map(row) : null;
  }

  async create(input: CreateCustomerDocumentApplicationInput, tx?: Prisma.TransactionClient): Promise<CustomerDocumentApplicationDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_document_applications.create({
      data: {
        applied_document_id: BigInt(input.appliedDocumentId),
        target_document_id: BigInt(input.targetDocumentId),
        amount: input.amount,
        application_date: input.applicationDate ? new Date(input.applicationDate) : new Date(),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
    });
    return this.map(row);
  }

  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.customer_document_applications.delete({ where: { id: BigInt(id) } });
  }
}

export const customerDocumentApplicationRepository = new CustomerDocumentApplicationRepository();
