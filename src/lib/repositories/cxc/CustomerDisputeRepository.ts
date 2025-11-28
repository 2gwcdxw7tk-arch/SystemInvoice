import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CustomerDisputeDTO } from "@/lib/types/cxc";

import { bigIntToNumber, dateTimeToIso } from "./mappers";

type DisputeRow = Prisma.customer_disputesGetPayload<Prisma.customer_disputesDefaultArgs>;

export type CreateCustomerDisputeInput = {
  customerId: number;
  documentId?: number | null;
  disputeCode?: string | null;
  description?: string | null;
  status?: CustomerDisputeDTO["status"];
  resolutionNotes?: string | null;
  resolvedAt?: string | Date | null;
  createdBy?: number | null;
};

export type UpdateCustomerDisputeInput = Partial<Omit<CreateCustomerDisputeInput, "customerId">>;

const mapDispute = (row: DisputeRow): CustomerDisputeDTO => ({
  id: bigIntToNumber(row.id),
  customerId: bigIntToNumber(row.customer_id),
  documentId: row.document_id ? bigIntToNumber(row.document_id) : null,
  disputeCode: row.dispute_code ?? null,
  description: row.description ?? null,
  status: (row.status as CustomerDisputeDTO["status"]) ?? "OPEN",
  resolutionNotes: row.resolution_notes ?? null,
  resolvedAt: dateTimeToIso(row.resolved_at),
  createdBy: row.created_by ?? null,
  createdAt: dateTimeToIso(row.created_at)!,
  updatedAt: dateTimeToIso(row.updated_at),
});

export class CustomerDisputeRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  async listByCustomer(customerId: number, tx?: Prisma.TransactionClient): Promise<CustomerDisputeDTO[]> {
    const client = this.getClient(tx);
    const rows = await client.customer_disputes.findMany({
      where: { customer_id: BigInt(customerId) },
      orderBy: [{ created_at: "desc" }],
    });
    return rows.map(mapDispute);
  }

  async findById(id: number, tx?: Prisma.TransactionClient): Promise<CustomerDisputeDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_disputes.findUnique({ where: { id: BigInt(id) } });
    return row ? mapDispute(row) : null;
  }

  async create(input: CreateCustomerDisputeInput, tx?: Prisma.TransactionClient): Promise<CustomerDisputeDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_disputes.create({
      data: {
        customer_id: BigInt(input.customerId),
        document_id: input.documentId ? BigInt(input.documentId) : null,
        dispute_code: input.disputeCode ?? null,
        description: input.description ?? null,
        status: input.status ?? "OPEN",
        resolution_notes: input.resolutionNotes ?? null,
        resolved_at: input.resolvedAt ? new Date(input.resolvedAt) : null,
        created_by: typeof input.createdBy === "number" ? input.createdBy : null,
      },
    });
    return mapDispute(row);
  }

  async update(id: number, input: UpdateCustomerDisputeInput, tx?: Prisma.TransactionClient): Promise<CustomerDisputeDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_disputes.update({
      where: { id: BigInt(id) },
      data: {
        document_id: typeof input.documentId === "number" ? BigInt(input.documentId) : input.documentId === null ? null : undefined,
        dispute_code: typeof input.disputeCode !== "undefined" ? input.disputeCode : undefined,
        description: typeof input.description !== "undefined" ? input.description : undefined,
        status: input.status,
        resolution_notes: typeof input.resolutionNotes !== "undefined" ? input.resolutionNotes : undefined,
        resolved_at: typeof input.resolvedAt !== "undefined" ? (input.resolvedAt ? new Date(input.resolvedAt) : null) : undefined,
        updated_at: new Date(),
      },
    });
    return mapDispute(row);
  }
}

export const customerDisputeRepository = new CustomerDisputeRepository();
