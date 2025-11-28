import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { PaymentTermDTO } from "@/lib/types/cxc";

function mapPaymentTerm(row: {
  id: number;
  code: string;
  name: string;
  description: string | null;
  days: number;
  grace_days: number | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
}): PaymentTermDTO {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    days: row.days,
    graceDays: row.grace_days,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export class PaymentTermRepository {
  constructor(private readonly orm: PrismaClient = prisma) {}

  async list(options: { includeInactive?: boolean } = {}): Promise<PaymentTermDTO[]> {
    const includeInactive = options.includeInactive ?? false;
    const rows = await this.orm.payment_terms.findMany({
      where: includeInactive ? undefined : { is_active: true },
      orderBy: [{ days: "asc" }, { code: "asc" }],
    });
    return rows.map(mapPaymentTerm);
  }

  async findByCode(code: string): Promise<PaymentTermDTO | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    const row = await this.orm.payment_terms.findUnique({ where: { code: normalized } });
    return row ? mapPaymentTerm(row) : null;
  }

  async findById(id: number): Promise<PaymentTermDTO | null> {
    const row = await this.orm.payment_terms.findUnique({ where: { id } });
    return row ? mapPaymentTerm(row) : null;
  }

  async create(payload: {
    code: string;
    name: string;
    description?: string | null;
    days: number;
    graceDays?: number | null;
    isActive?: boolean;
  }): Promise<PaymentTermDTO> {
    const normalized = payload.code.trim().toUpperCase();
    const row = await this.orm.payment_terms.create({
      data: {
        code: normalized,
        name: payload.name.trim(),
        description: payload.description ?? null,
        days: payload.days,
        grace_days: typeof payload.graceDays === "number" ? payload.graceDays : null,
        is_active: typeof payload.isActive === "boolean" ? payload.isActive : true,
      },
    });
    return mapPaymentTerm(row);
  }

  async update(code: string, payload: {
    name?: string;
    description?: string | null;
    days?: number;
    graceDays?: number | null;
    isActive?: boolean;
  }): Promise<PaymentTermDTO> {
    const normalized = code.trim().toUpperCase();
    const row = await this.orm.payment_terms.update({
      where: { code: normalized },
      data: {
        name: payload.name?.trim(),
        description: payload.description ?? undefined,
        days: typeof payload.days === "number" ? payload.days : undefined,
        grace_days: typeof payload.graceDays === "number" ? payload.graceDays : payload.graceDays === null ? null : undefined,
        is_active: typeof payload.isActive === "boolean" ? payload.isActive : undefined,
        updated_at: new Date(),
      },
    });
    return mapPaymentTerm(row);
  }

  async delete(code: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    await this.orm.payment_terms.delete({ where: { code: normalized } });
  }
}

export const paymentTermRepository = new PaymentTermRepository();
