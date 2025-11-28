import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CustomerCreditLineDTO } from "@/lib/types/cxc";

import { bigIntToNumber, dateTimeToIso, decimalToNumber } from "./mappers";

type CreditLineRow = Prisma.customer_credit_linesGetPayload<Prisma.customer_credit_linesDefaultArgs>;

export type CreateCustomerCreditLineInput = {
  customerId: number;
  status?: CustomerCreditLineDTO["status"];
  approvedLimit: number;
  availableLimit?: number;
  blockedAmount?: number;
  reviewerAdminUserId?: number | null;
  reviewNotes?: string | null;
  reviewedAt?: string | Date | null;
  nextReviewAt?: string | Date | null;
};

export type UpdateCustomerCreditLineInput = Partial<Omit<CreateCustomerCreditLineInput, "customerId">>;

const mapLine = (row: CreditLineRow): CustomerCreditLineDTO => ({
  id: bigIntToNumber(row.id),
  customerId: bigIntToNumber(row.customer_id),
  status: (row.status as CustomerCreditLineDTO["status"]) ?? "ACTIVE",
  approvedLimit: decimalToNumber(row.approved_limit),
  availableLimit: decimalToNumber(row.available_limit),
  blockedAmount: decimalToNumber(row.blocked_amount),
  reviewerAdminUserId: row.reviewer_admin_user_id ?? null,
  reviewNotes: row.review_notes ?? null,
  reviewedAt: dateTimeToIso(row.reviewed_at),
  nextReviewAt: dateTimeToIso(row.next_review_at),
  createdAt: dateTimeToIso(row.created_at)!,
  updatedAt: dateTimeToIso(row.updated_at),
});

export class CustomerCreditLineRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  async listByCustomer(customerId: number, tx?: Prisma.TransactionClient): Promise<CustomerCreditLineDTO[]> {
    const client = this.getClient(tx);
    const rows = await client.customer_credit_lines.findMany({
      where: { customer_id: BigInt(customerId) },
      orderBy: [{ created_at: "desc" }],
    });
    return rows.map(mapLine);
  }

  async findById(id: number, tx?: Prisma.TransactionClient): Promise<CustomerCreditLineDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_credit_lines.findUnique({ where: { id: BigInt(id) } });
    return row ? mapLine(row) : null;
  }

  async findLatestByCustomer(customerId: number, tx?: Prisma.TransactionClient): Promise<CustomerCreditLineDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customer_credit_lines.findFirst({
      where: { customer_id: BigInt(customerId) },
      orderBy: [{ created_at: "desc" }],
    });
    return row ? mapLine(row) : null;
  }

  async create(input: CreateCustomerCreditLineInput, tx?: Prisma.TransactionClient): Promise<CustomerCreditLineDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_credit_lines.create({
      data: {
        customer_id: BigInt(input.customerId),
        status: input.status ?? "ACTIVE",
        approved_limit: input.approvedLimit,
        available_limit: typeof input.availableLimit === "number" ? input.availableLimit : input.approvedLimit,
        blocked_amount: input.blockedAmount ?? 0,
        reviewer_admin_user_id: typeof input.reviewerAdminUserId === "number" ? input.reviewerAdminUserId : null,
        review_notes: input.reviewNotes ?? null,
        reviewed_at: input.reviewedAt ? new Date(input.reviewedAt) : null,
        next_review_at: input.nextReviewAt ? new Date(input.nextReviewAt) : null,
      },
    });
    return mapLine(row);
  }

  async update(id: number, input: UpdateCustomerCreditLineInput, tx?: Prisma.TransactionClient): Promise<CustomerCreditLineDTO> {
    const client = this.getClient(tx);
    const row = await client.customer_credit_lines.update({
      where: { id: BigInt(id) },
      data: {
        status: input.status,
        approved_limit: typeof input.approvedLimit === "number" ? input.approvedLimit : undefined,
        available_limit: typeof input.availableLimit === "number" ? input.availableLimit : undefined,
        blocked_amount: typeof input.blockedAmount === "number" ? input.blockedAmount : undefined,
        reviewer_admin_user_id:
          typeof input.reviewerAdminUserId === "number"
            ? input.reviewerAdminUserId
            : input.reviewerAdminUserId === null
              ? null
              : undefined,
        review_notes: typeof input.reviewNotes !== "undefined" ? input.reviewNotes : undefined,
        reviewed_at: typeof input.reviewedAt !== "undefined" ? (input.reviewedAt ? new Date(input.reviewedAt) : null) : undefined,
        next_review_at: typeof input.nextReviewAt !== "undefined" ? (input.nextReviewAt ? new Date(input.nextReviewAt) : null) : undefined,
        updated_at: new Date(),
      },
    });
    return mapLine(row);
  }
}

export const customerCreditLineRepository = new CustomerCreditLineRepository();
