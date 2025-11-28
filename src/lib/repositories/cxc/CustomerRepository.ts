import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CustomerDTO, CustomerSummaryDTO } from "@/lib/types/cxc";

import { dateTimeToIso, decimalToNumber } from "./mappers";

type CustomerRow = Prisma.customersGetPayload<{ include: { payment_terms: { select: { code: true } } } }>;

const creditStatuses = new Set(["ACTIVE", "ON_HOLD", "BLOCKED"]);

const mapCustomer = (row: CustomerRow): CustomerDTO => ({
  id: Number(row.id),
  code: row.code,
  name: row.name,
  tradeName: row.trade_name ?? null,
  taxId: row.tax_id ?? null,
  email: row.email ?? null,
  phone: row.phone ?? null,
  mobilePhone: row.mobile_phone ?? null,
  billingAddress: row.billing_address ?? null,
  city: row.city ?? null,
  state: row.state ?? null,
  countryCode: row.country_code ?? null,
  postalCode: row.postal_code ?? null,
  paymentTermId: row.payment_term_id ?? null,
  paymentTermCode: row.payment_terms?.code ?? null,
  creditLimit: decimalToNumber(row.credit_limit),
  creditUsed: decimalToNumber(row.credit_used),
  creditOnHold: decimalToNumber(row.credit_on_hold),
  creditStatus: creditStatuses.has((row.credit_status ?? "ACTIVE") as string)
    ? ((row.credit_status ?? "ACTIVE") as CustomerDTO["creditStatus"])
    : "ACTIVE",
  creditHoldReason: row.credit_hold_reason ?? null,
  lastCreditReviewAt: row.last_credit_review_at ? row.last_credit_review_at.toISOString() : null,
  nextCreditReviewAt: row.next_credit_review_at ? row.next_credit_review_at.toISOString() : null,
  isActive: row.is_active ?? true,
  notes: row.notes ?? null,
  createdAt: dateTimeToIso(row.created_at)!,
  updatedAt: dateTimeToIso(row.updated_at),
});

function toSummary(row: CustomerDTO): CustomerSummaryDTO {
  const available = Math.max(0, row.creditLimit - row.creditUsed - row.creditOnHold);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    taxId: row.taxId,
    paymentTermCode: row.paymentTermCode,
    creditLimit: row.creditLimit,
    creditUsed: row.creditUsed,
    creditOnHold: row.creditOnHold,
    creditStatus: row.creditStatus,
    availableCredit: available,
  };
}

export class CustomerRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.orm;
  }

  async list(options: { search?: string; includeInactive?: boolean; limit?: number } = {}): Promise<CustomerDTO[]> {
    const includeInactive = options.includeInactive ?? false;
    const filters: Prisma.customersWhereInput = {};
    if (!includeInactive) {
      filters.is_active = true;
    }
    if (options.search) {
      const term = options.search.trim();
      if (term.length > 0) {
        filters.OR = [
          { code: { contains: term, mode: "insensitive" } },
          { name: { contains: term, mode: "insensitive" } },
          { tax_id: { contains: term, mode: "insensitive" } },
        ];
      }
    }
    const rows = await this.orm.customers.findMany({
      where: filters,
      take: options.limit && options.limit > 0 ? options.limit : undefined,
      orderBy: [{ name: "asc" }],
      include: { payment_terms: { select: { code: true } } },
    });
    return rows.map(mapCustomer);
  }

  async listSummaries(options: { limit?: number; search?: string } = {}): Promise<CustomerSummaryDTO[]> {
    const customers = await this.list({ limit: options.limit ?? 100, search: options.search, includeInactive: false });
    return customers.map(toSummary);
  }

  async findById(id: number, tx?: Prisma.TransactionClient): Promise<CustomerDTO | null> {
    const client = this.getClient(tx);
    const row = await client.customers.findUnique({
      where: { id: BigInt(id) },
      include: { payment_terms: { select: { code: true } } },
    });
    return row ? mapCustomer(row) : null;
  }

  async findByCode(code: string, tx?: Prisma.TransactionClient): Promise<CustomerDTO | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    const client = this.getClient(tx);
    const row = await client.customers.findUnique({ where: { code: normalized }, include: { payment_terms: { select: { code: true } } } });
    return row ? mapCustomer(row) : null;
  }

  async create(payload: Partial<CustomerDTO> & { code: string; name: string }, tx?: Prisma.TransactionClient): Promise<CustomerDTO> {
    const now = new Date();
    const client = this.getClient(tx);
    const row = await client.customers.create({
      data: {
        code: payload.code.trim().toUpperCase(),
        name: payload.name.trim(),
        trade_name: payload.tradeName ?? null,
        tax_id: payload.taxId ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        mobile_phone: payload.mobilePhone ?? null,
        billing_address: payload.billingAddress ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        country_code: payload.countryCode ?? "NI",
        postal_code: payload.postalCode ?? null,
        payment_term_id: payload.paymentTermId ?? null,
        credit_limit: payload.creditLimit ?? 0,
        credit_used: payload.creditUsed ?? 0,
        credit_on_hold: payload.creditOnHold ?? 0,
        credit_status: payload.creditStatus ?? "ACTIVE",
        credit_hold_reason: payload.creditHoldReason ?? null,
        last_credit_review_at: payload.lastCreditReviewAt ? new Date(payload.lastCreditReviewAt) : null,
        next_credit_review_at: payload.nextCreditReviewAt ? new Date(payload.nextCreditReviewAt) : null,
        is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
        notes: payload.notes ?? null,
        created_at: now,
        updated_at: now,
      },
      include: { payment_terms: { select: { code: true } } },
    });
    return mapCustomer(row);
  }

  async update(id: number, payload: Partial<CustomerDTO>, tx?: Prisma.TransactionClient): Promise<CustomerDTO> {
    const client = this.getClient(tx);
    const row = await client.customers.update({
      where: { id: BigInt(id) },
      data: {
        name: payload.name?.trim(),
        trade_name: payload.tradeName ?? undefined,
        tax_id: payload.taxId ?? undefined,
        email: payload.email ?? undefined,
        phone: payload.phone ?? undefined,
        mobile_phone: payload.mobilePhone ?? undefined,
        billing_address: payload.billingAddress ?? undefined,
        city: payload.city ?? undefined,
        state: payload.state ?? undefined,
        country_code: payload.countryCode ?? undefined,
        postal_code: payload.postalCode ?? undefined,
        payment_term_id: typeof payload.paymentTermId === "number" ? payload.paymentTermId : payload.paymentTermId === null ? null : undefined,
        credit_limit: typeof payload.creditLimit === "number" ? payload.creditLimit : undefined,
        credit_used: typeof payload.creditUsed === "number" ? payload.creditUsed : undefined,
        credit_on_hold: typeof payload.creditOnHold === "number" ? payload.creditOnHold : undefined,
        credit_status: payload.creditStatus ?? undefined,
        credit_hold_reason: payload.creditHoldReason ?? undefined,
        last_credit_review_at: payload.lastCreditReviewAt ? new Date(payload.lastCreditReviewAt) : undefined,
        next_credit_review_at: payload.nextCreditReviewAt ? new Date(payload.nextCreditReviewAt) : undefined,
        is_active: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
        notes: payload.notes ?? undefined,
        updated_at: new Date(),
      },
      include: { payment_terms: { select: { code: true } } },
    });
    return mapCustomer(row);
  }

  async setActiveState(id: number, isActive: boolean, tx?: Prisma.TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.customers.update({ where: { id: BigInt(id) }, data: { is_active: !!isActive, updated_at: new Date() } });
  }

  async countByPaymentTermId(paymentTermId: number): Promise<number> {
    const count = await this.orm.customers.count({ where: { payment_term_id: paymentTermId } });
    return count;
  }
}

export const customerRepository = new CustomerRepository();
