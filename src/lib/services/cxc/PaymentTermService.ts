import { env } from "@/lib/env";
import { paymentTermRepository, PaymentTermRepository } from "@/lib/repositories/cxc/PaymentTermRepository";
import { customerRepository, CustomerRepository } from "@/lib/repositories/cxc/CustomerRepository";
import type { PaymentTermDTO } from "@/lib/types/cxc";
import { toCentralClosedDate } from "@/lib/utils/date";

import { mockCxcStore } from "./mock-data";

export type CreatePaymentTermInput = {
  code: string;
  name: string;
  description?: string | null;
  days: number;
  graceDays?: number | null;
  isActive?: boolean;
};

export type UpdatePaymentTermInput = Partial<Omit<CreatePaymentTermInput, "code">>;

const normalizeCode = (value: string) => value.trim().toUpperCase();

const cloneTerm = (term: PaymentTermDTO): PaymentTermDTO => ({ ...term });

function addDays(base: Date, days: number): Date {
  const clone = new Date(base.getTime());
  clone.setUTCDate(clone.getUTCDate() + days);
  return clone;
}

export class PaymentTermService {
  constructor(
    private readonly repo: PaymentTermRepository = paymentTermRepository,
    private readonly customerRepo: CustomerRepository = customerRepository,
  ) {}

  async list(options: { includeInactive?: boolean } = {}): Promise<PaymentTermDTO[]> {
    if (env.useMockData) {
      const includeInactive = Boolean(options.includeInactive);
      return mockCxcStore.paymentTerms
        .filter((term) => includeInactive || term.isActive)
        .map(cloneTerm)
        .sort((a, b) => a.days - b.days || a.code.localeCompare(b.code));
    }

    return this.repo.list(options);
  }

  async getByCode(code: string): Promise<PaymentTermDTO | null> {
    if (!code) return null;

    if (env.useMockData) {
      const normalized = normalizeCode(code);
      const match = mockCxcStore.paymentTerms.find((term) => term.code === normalized);
      return match ? cloneTerm(match) : null;
    }

    return this.repo.findByCode(code);
  }

  async getById(id: number): Promise<PaymentTermDTO | null> {
    if (env.useMockData) {
      const match = mockCxcStore.paymentTerms.find((term) => term.id === id);
      return match ? cloneTerm(match) : null;
    }

    return this.repo.findById(id);
  }

  async create(input: CreatePaymentTermInput): Promise<PaymentTermDTO> {
    if (!input.code || !input.name) {
      throw new Error("El código y nombre de la condición de pago son obligatorios");
    }

    const normalized = normalizeCode(input.code);

    if (env.useMockData) {
      if (mockCxcStore.paymentTerms.some((term) => term.code === normalized)) {
        throw new Error(`Ya existe una condición de pago con el código ${normalized}`);
      }

      const term: PaymentTermDTO = {
        id: mockCxcStore.sequences.paymentTerm++,
        code: normalized,
        name: input.name.trim(),
        description: input.description ?? null,
        days: input.days,
        graceDays: typeof input.graceDays === "number" ? input.graceDays : null,
        isActive: typeof input.isActive === "boolean" ? input.isActive : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.paymentTerms.push(term);
      return cloneTerm(term);
    }

    return this.repo.create(input);
  }

  async update(code: string, input: UpdatePaymentTermInput): Promise<PaymentTermDTO> {
    if (!code) {
      throw new Error("Debe indicar el código de la condición de pago");
    }
    const normalized = normalizeCode(code);

    if (env.useMockData) {
      const index = mockCxcStore.paymentTerms.findIndex((term) => term.code === normalized);
      if (index === -1) {
        throw new Error(`La condición ${normalized} no existe`);
      }
      const current = mockCxcStore.paymentTerms[index];
      const updated: PaymentTermDTO = {
        ...current,
        name: typeof input.name === "string" ? input.name.trim() : current.name,
        description: input.description ?? current.description,
        days: typeof input.days === "number" ? input.days : current.days,
        graceDays:
          typeof input.graceDays === "number"
            ? input.graceDays
            : input.graceDays === null
              ? null
              : current.graceDays,
        isActive: typeof input.isActive === "boolean" ? input.isActive : current.isActive,
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.paymentTerms[index] = updated;
      return cloneTerm(updated);
    }

    return this.repo.update(normalized, input);
  }

  async delete(code: string): Promise<void> {
    if (!code) {
      throw new Error("Debe indicar el código de la condición de pago");
    }
    const normalized = normalizeCode(code);

    if (env.useMockData) {
      const index = mockCxcStore.paymentTerms.findIndex((term) => term.code === normalized);
      if (index === -1) {
        return;
      }
      const term = mockCxcStore.paymentTerms[index];
      const hasCustomers = mockCxcStore.customers.some((customer) => customer.paymentTermId === term.id);
      if (hasCustomers) {
        throw new Error("No se puede eliminar la condición porque hay clientes asociados");
      }
      mockCxcStore.paymentTerms.splice(index, 1);
      return;
    }

    const term = await this.repo.findByCode(normalized);
    if (!term) {
      return;
    }

    const customerCount = await this.customerRepo.countByPaymentTermId(term.id);
    if (customerCount > 0) {
      throw new Error("No se puede eliminar la condición porque hay clientes asociados");
    }

    await this.repo.delete(normalized);
  }

  calculateDueDate(baseDate: string | Date, term: Pick<PaymentTermDTO, "days" | "graceDays"> | null): Date {
    const start = toCentralClosedDate(baseDate);
    const days = term ? term.days : 0;
    const grace = term && typeof term.graceDays === "number" ? term.graceDays : 0;
    return addDays(start, days + grace);
  }
}

export const paymentTermService = new PaymentTermService();
