import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CollectionLogDTO } from "@/lib/types/cxc";

import { bigIntToNumber, dateTimeToIso } from "./mappers";

type CollectionLogRow = Prisma.collection_logsGetPayload<Prisma.collection_logsDefaultArgs>;

export type CreateCollectionLogInput = {
  customerId: number;
  documentId?: number | null;
  contactMethod?: string | null;
  contactName?: string | null;
  notes?: string | null;
  outcome?: string | null;
  followUpAt?: string | Date | null;
  createdBy?: number | null;
};

export class CollectionLogRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  private map(row: CollectionLogRow): CollectionLogDTO {
    return {
      id: bigIntToNumber(row.id),
      customerId: bigIntToNumber(row.customer_id),
      documentId: row.document_id ? bigIntToNumber(row.document_id) : null,
      contactMethod: row.contact_method ?? null,
      contactName: row.contact_name ?? null,
      notes: row.notes ?? null,
      outcome: row.outcome ?? null,
      followUpAt: dateTimeToIso(row.follow_up_at),
      createdBy: row.created_by ?? null,
      createdAt: dateTimeToIso(row.created_at)!,
    } satisfies CollectionLogDTO;
  }

  async listByCustomer(customerId: number, tx?: Prisma.TransactionClient): Promise<CollectionLogDTO[]> {
    const client = this.getClient(tx);
    const rows = await client.collection_logs.findMany({
      where: { customer_id: BigInt(customerId) },
      orderBy: [{ created_at: "desc" }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(input: CreateCollectionLogInput, tx?: Prisma.TransactionClient): Promise<CollectionLogDTO> {
    const client = this.getClient(tx);
    const row = await client.collection_logs.create({
      data: {
        customer_id: BigInt(input.customerId),
        document_id: input.documentId ? BigInt(input.documentId) : null,
        contact_method: input.contactMethod ?? null,
        contact_name: input.contactName ?? null,
        notes: input.notes ?? null,
        outcome: input.outcome ?? null,
        follow_up_at: input.followUpAt ? new Date(input.followUpAt) : null,
        created_by: typeof input.createdBy === "number" ? input.createdBy : null,
      },
    });
    return this.map(row);
  }

  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.collection_logs.delete({ where: { id: BigInt(id) } });
  }
}

export const collectionLogRepository = new CollectionLogRepository();
