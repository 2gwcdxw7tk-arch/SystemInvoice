import { env } from "@/lib/env";
import { customerRepository, CustomerRepository } from "@/lib/repositories/cxc/CustomerRepository";
import { paymentTermRepository } from "@/lib/repositories/cxc/PaymentTermRepository";
import type { CustomerDTO, CustomerSummaryDTO } from "@/lib/types/cxc";

import { mockCxcStore } from "./mock-data";

export type CreateCustomerInput = {
  code: string;
  name: string;
  tradeName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  billingAddress?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  postalCode?: string | null;
  paymentTermId?: number | null;
  paymentTermCode?: string | null;
  creditLimit?: number;
  creditUsed?: number;
  creditOnHold?: number;
  creditStatus?: CustomerDTO["creditStatus"];
  creditHoldReason?: string | null;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

const normalizeCode = (value: string) => value.trim().toUpperCase();

const cloneCustomer = (customer: CustomerDTO): CustomerDTO => ({ ...customer });

const CREDIT_STATUSES: CustomerDTO["creditStatus"][] = ["ACTIVE", "ON_HOLD", "BLOCKED"];

function resolveCreditStatus(input?: string | null): CustomerDTO["creditStatus"] {
  if (!input) return "ACTIVE";
  const normalized = input.trim().toUpperCase();
  return (CREDIT_STATUSES.includes(normalized as CustomerDTO["creditStatus"]) ? normalized : "ACTIVE") as CustomerDTO["creditStatus"];
}

export class CustomerService {
  constructor(private readonly repo: CustomerRepository = customerRepository) {}

  async list(options: { search?: string; includeInactive?: boolean; limit?: number } = {}): Promise<CustomerDTO[]> {
    if (env.useMockData) {
      const includeInactive = Boolean(options.includeInactive);
      const search = options.search?.trim().toLowerCase();
      return mockCxcStore.customers
        .filter((customer) => (includeInactive || customer.isActive) && (!search || customer.name.toLowerCase().includes(search) || customer.code.toLowerCase().includes(search)))
        .slice(0, options.limit && options.limit > 0 ? options.limit : mockCxcStore.customers.length)
        .map(cloneCustomer);
    }

    return this.repo.list(options);
  }

  async listSummaries(options: { search?: string; limit?: number } = {}): Promise<CustomerSummaryDTO[]> {
    if (env.useMockData) {
      const customers = await this.list({ search: options.search, limit: options.limit, includeInactive: false });
      return customers.map((customer) => ({
        id: customer.id,
        code: customer.code,
        name: customer.name,
        taxId: customer.taxId,
        paymentTermCode: customer.paymentTermCode,
        creditLimit: customer.creditLimit,
        creditUsed: customer.creditUsed,
        creditOnHold: customer.creditOnHold,
        creditStatus: customer.creditStatus,
        availableCredit: Math.max(0, customer.creditLimit - customer.creditUsed - customer.creditOnHold),
      } satisfies CustomerSummaryDTO));
    }

    return this.repo.listSummaries(options);
  }

  async getById(id: number): Promise<CustomerDTO | null> {
    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.id === id);
      return customer ? cloneCustomer(customer) : null;
    }

    return this.repo.findById(id);
  }

  async getByCode(code: string): Promise<CustomerDTO | null> {
    if (!code) return null;

    if (env.useMockData) {
      const normalized = normalizeCode(code);
      const customer = mockCxcStore.customers.find((entry) => entry.code === normalized);
      return customer ? cloneCustomer(customer) : null;
    }

    return this.repo.findByCode(code);
  }

  private async resolvePaymentTermId(input: {
    paymentTermId?: number | null;
    paymentTermCode?: string | null;
  }): Promise<{ id: number | null; code: string | null }> {
    const idIsNull = input.paymentTermId === null;
    const codeIsNull = input.paymentTermCode === null;
    const hasId = typeof input.paymentTermId === "number" && Number.isFinite(input.paymentTermId);
    const hasCode = typeof input.paymentTermCode === "string" && input.paymentTermCode.trim().length > 0;

    if (!hasId && !hasCode) {
      if (idIsNull || codeIsNull) {
        return { id: null, code: null };
      }
      return { id: null, code: null };
    }

    const normalizedCode = hasCode ? normalizeCode(input.paymentTermCode!) : null;

    const fetchTermById = async (termId: number) => {
      const term = env.useMockData
        ? mockCxcStore.paymentTerms.find((entry) => entry.id === termId) ?? null
        : await paymentTermRepository.findById(termId);
      return term ?? null;
    };

    const fetchTermByCode = async (code: string) => {
      const term = env.useMockData
        ? mockCxcStore.paymentTerms.find((entry) => entry.code === code) ?? null
        : await paymentTermRepository.findByCode(code);
      return term ?? null;
    };

    const [termById, termByCode] = await Promise.all([
      hasId ? fetchTermById(input.paymentTermId as number) : Promise.resolve(null),
      hasCode && normalizedCode ? fetchTermByCode(normalizedCode) : Promise.resolve(null),
    ]);

    if (hasId && !termById) {
      throw new Error("La condición de pago indicada no existe");
    }

    if (hasCode && normalizedCode && !termByCode) {
      throw new Error("La condición de pago indicada no existe");
    }

    if (termById && termByCode && termById.id !== termByCode.id) {
      throw new Error("La condición de pago indicada no coincide con el código proporcionado");
    }

    const resolved = termById ?? termByCode;
    return resolved ? { id: resolved.id, code: resolved.code } : { id: null, code: null };
  }

  async create(input: CreateCustomerInput): Promise<CustomerDTO> {
    if (!input.code || !input.name) {
      throw new Error("El código y nombre del cliente son obligatorios");
    }
    const normalizedCode = normalizeCode(input.code);
    const paymentTerm = await this.resolvePaymentTermId({ paymentTermId: input.paymentTermId ?? null, paymentTermCode: input.paymentTermCode ?? null });

    if (env.useMockData) {
      if (mockCxcStore.customers.some((customer) => customer.code === normalizedCode)) {
        throw new Error(`Ya existe un cliente con el código ${normalizedCode}`);
      }
      const customer: CustomerDTO = {
        id: mockCxcStore.sequences.customer++,
        code: normalizedCode,
        name: input.name.trim(),
        tradeName: input.tradeName ?? null,
        taxId: input.taxId ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        mobilePhone: input.mobilePhone ?? null,
        billingAddress: input.billingAddress ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        countryCode: input.countryCode ?? "NI",
        postalCode: input.postalCode ?? null,
        paymentTermId: paymentTerm.id,
        paymentTermCode: paymentTerm.code,
        creditLimit: input.creditLimit ?? 0,
        creditUsed: input.creditUsed ?? 0,
        creditOnHold: input.creditOnHold ?? 0,
        creditStatus: resolveCreditStatus(input.creditStatus),
        creditHoldReason: input.creditHoldReason ?? null,
        lastCreditReviewAt: null,
        nextCreditReviewAt: null,
        isActive: typeof input.isActive === "boolean" ? input.isActive : true,
        notes: input.notes ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.customers.push(customer);
      return cloneCustomer(customer);
    }

    return this.repo.create({
      code: normalizedCode,
      name: input.name.trim(),
      tradeName: input.tradeName ?? null,
      taxId: input.taxId ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      mobilePhone: input.mobilePhone ?? null,
      billingAddress: input.billingAddress ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      countryCode: input.countryCode ?? undefined,
      postalCode: input.postalCode ?? null,
      paymentTermId: paymentTerm.id,
      creditLimit: input.creditLimit ?? 0,
      creditUsed: input.creditUsed ?? 0,
      creditOnHold: input.creditOnHold ?? 0,
      creditStatus: resolveCreditStatus(input.creditStatus),
      creditHoldReason: input.creditHoldReason ?? null,
      isActive: typeof input.isActive === "boolean" ? input.isActive : true,
      notes: input.notes ?? null,
    });
  }

  async update(code: string, input: UpdateCustomerInput): Promise<CustomerDTO> {
    if (!code) {
      throw new Error("Debe indicar el código del cliente");
    }
    const normalizedCode = normalizeCode(code);
    const paymentTermIdProvided = typeof input.paymentTermId === "number";
    const paymentTermCodeProvided = typeof input.paymentTermCode === "string" && input.paymentTermCode.trim().length > 0;
    const paymentTermCleared = input.paymentTermId === null || input.paymentTermCode === null;

    let resolvedPaymentTermId: number | null | undefined;
    let resolvedPaymentTermCode: string | null | undefined;

    if (paymentTermIdProvided || paymentTermCodeProvided) {
      const term = await this.resolvePaymentTermId({
        paymentTermId: paymentTermIdProvided ? (input.paymentTermId as number) : null,
        paymentTermCode: paymentTermCodeProvided ? (input.paymentTermCode as string) : null,
      });
      resolvedPaymentTermId = term.id;
      resolvedPaymentTermCode = term.code;
    } else if (paymentTermCleared) {
      resolvedPaymentTermId = null;
      resolvedPaymentTermCode = null;
    } else {
      resolvedPaymentTermId = undefined;
      resolvedPaymentTermCode = undefined;
    }

    if (env.useMockData) {
      const index = mockCxcStore.customers.findIndex((customer) => customer.code === normalizedCode);
      if (index === -1) {
        throw new Error(`El cliente ${normalizedCode} no existe`);
      }
      const current = mockCxcStore.customers[index];
      const updated: CustomerDTO = {
        ...current,
        name: typeof input.name === "string" ? input.name.trim() : current.name,
        tradeName: typeof input.tradeName !== "undefined" ? input.tradeName : current.tradeName,
        taxId: typeof input.taxId !== "undefined" ? input.taxId : current.taxId,
        email: typeof input.email !== "undefined" ? input.email : current.email,
        phone: typeof input.phone !== "undefined" ? input.phone : current.phone,
        mobilePhone: typeof input.mobilePhone !== "undefined" ? input.mobilePhone : current.mobilePhone,
        billingAddress: typeof input.billingAddress !== "undefined" ? input.billingAddress : current.billingAddress,
        city: typeof input.city !== "undefined" ? input.city : current.city,
        state: typeof input.state !== "undefined" ? input.state : current.state,
        countryCode: typeof input.countryCode !== "undefined" ? input.countryCode : current.countryCode,
        postalCode: typeof input.postalCode !== "undefined" ? input.postalCode : current.postalCode,
        paymentTermId:
          typeof resolvedPaymentTermId === "number"
            ? resolvedPaymentTermId
            : resolvedPaymentTermId === null
              ? null
              : current.paymentTermId,
        paymentTermCode:
          typeof resolvedPaymentTermCode === "string"
            ? resolvedPaymentTermCode
            : resolvedPaymentTermCode === null
              ? null
              : current.paymentTermCode,
        creditLimit: typeof input.creditLimit === "number" ? input.creditLimit : current.creditLimit,
        creditUsed: typeof input.creditUsed === "number" ? input.creditUsed : current.creditUsed,
        creditOnHold: typeof input.creditOnHold === "number" ? input.creditOnHold : current.creditOnHold,
        creditStatus: input.creditStatus ? resolveCreditStatus(input.creditStatus) : current.creditStatus,
        creditHoldReason: typeof input.creditHoldReason !== "undefined" ? input.creditHoldReason : current.creditHoldReason,
        isActive: typeof input.isActive === "boolean" ? input.isActive : current.isActive,
        notes: typeof input.notes !== "undefined" ? input.notes : current.notes,
        updatedAt: new Date().toISOString(),
      };
      mockCxcStore.customers[index] = updated;
      return cloneCustomer(updated);
    }

    const existing = await this.repo.findByCode(normalizedCode);
    if (!existing) {
      throw new Error("El cliente indicado no existe");
    }

    return this.repo.update(existing.id, {
      name: typeof input.name === "string" ? input.name.trim() : undefined,
      tradeName: typeof input.tradeName !== "undefined" ? input.tradeName : undefined,
      taxId: typeof input.taxId !== "undefined" ? input.taxId : undefined,
      email: typeof input.email !== "undefined" ? input.email : undefined,
      phone: typeof input.phone !== "undefined" ? input.phone : undefined,
      mobilePhone: typeof input.mobilePhone !== "undefined" ? input.mobilePhone : undefined,
      billingAddress: typeof input.billingAddress !== "undefined" ? input.billingAddress : undefined,
      city: typeof input.city !== "undefined" ? input.city : undefined,
      state: typeof input.state !== "undefined" ? input.state : undefined,
      countryCode: typeof input.countryCode !== "undefined" ? input.countryCode : undefined,
      postalCode: typeof input.postalCode !== "undefined" ? input.postalCode : undefined,
      paymentTermId:
        typeof resolvedPaymentTermId === "number"
          ? resolvedPaymentTermId
          : resolvedPaymentTermId === null
            ? null
            : undefined,
      creditLimit: typeof input.creditLimit === "number" ? input.creditLimit : undefined,
      creditUsed: typeof input.creditUsed === "number" ? input.creditUsed : undefined,
      creditOnHold: typeof input.creditOnHold === "number" ? input.creditOnHold : undefined,
      creditStatus: input.creditStatus ? resolveCreditStatus(input.creditStatus) : undefined,
      creditHoldReason: typeof input.creditHoldReason !== "undefined" ? input.creditHoldReason : undefined,
      isActive: typeof input.isActive === "boolean" ? input.isActive : undefined,
      notes: typeof input.notes !== "undefined" ? input.notes : undefined,
    });
  }

  async setActiveState(code: string, isActive: boolean): Promise<void> {
    if (!code) {
      throw new Error("Debe indicar el código del cliente");
    }
    const normalizedCode = normalizeCode(code);

    if (env.useMockData) {
      const customer = mockCxcStore.customers.find((entry) => entry.code === normalizedCode);
      if (customer) {
        customer.isActive = !!isActive;
        customer.updatedAt = new Date().toISOString();
      }
      return;
    }

    const record = await this.repo.findByCode(normalizedCode);
    if (!record) {
      throw new Error("El cliente indicado no existe");
    }
    await this.repo.setActiveState(record.id, isActive);
  }
}

export const customerService = new CustomerService();
