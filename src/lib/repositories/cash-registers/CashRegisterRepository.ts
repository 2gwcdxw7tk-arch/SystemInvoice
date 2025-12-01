import { PrismaClient, prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client"; // Prisma namespace for runtime error detection
import type { Decimal, InputJsonValue } from "@prisma/client/runtime/library";
import { buildClosureSummary } from "@/lib/services/cash-registers/summary";
import {
  CashRegisterAssignment,
  CashRegisterAssignmentGroup,
  CashRegisterClosureSummary,
  CashRegisterRecord,
  CashRegisterSessionRecord,
  CreateCashRegisterInput,
  CashDenominationLine,
  DenominationKind,
  ExpectedPayment,
  ReportedPayment,
  UpdateCashRegisterInput,
} from "@/lib/services/cash-registers/types";
import type { ICashRegisterRepository } from "./ICashRegisterRepository";

// Tipos para los payloads de Prisma con las relaciones incluidas
type SequenceDefinitionSummary = {
  id: number;
  code: string;
  name: string;
};

type CashRegisterWithWarehouse = {
  id: number | bigint;
  code: string;
  name: string;
  warehouse_id: number;
  allow_manual_warehouse_override: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date | null;
  warehouses: { id: number; code: string; name: string };
  invoice_sequence_definition_id: number | null;
  sequence_definitions: SequenceDefinitionSummary | null;
  default_customer_id: number | bigint | null;
  default_customer?: DefaultCustomerRow | null;
};

type DefaultCustomerRow = {
  id: number | bigint;
  code: string;
  name: string;
  payment_terms: { code: string } | null;
};

type DefaultCustomerInclude = {
  default_customer: {
    select: {
      id: true;
      code: true;
      name: true;
      payment_terms: {
        select: {
          code: true;
        };
      };
    };
  };
};

type CashRegisterIncludeWithDefault = Prisma.cash_registersInclude & Partial<DefaultCustomerInclude>;

const defaultCustomerSelect = {
  id: true,
  code: true,
  name: true,
  payment_terms: {
    select: {
      code: true,
    },
  },
} as const;

function buildIncludeWithDefault(
  base: CashRegisterIncludeWithDefault,
  includeDefault: boolean
): CashRegisterIncludeWithDefault {
  if (!includeDefault) {
    return base;
  }

  return {
    ...base,
    default_customer: {
      select: defaultCustomerSelect,
    },
  };
}

type CashRegisterUserWithRelations = {
  admin_user_id: number;
  cash_register_id: number;
  is_default: boolean;
  cash_registers: {
    id: number | bigint;
    code: string;
    name: string;
    allow_manual_warehouse_override: boolean;
    warehouses: { id: number; code: string; name: string } | null;
    default_customer?: DefaultCustomerRow | null;
  };
};

function isMissingDefaultCustomerRelationError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientValidationError)) {
    return false;
  }
  return typeof error.message === "string" && error.message.includes("default_customer");
}

type CashRegisterSessionWithRelations = {
  id: number | bigint;
  cash_register_id: number;
  admin_user_id: number;
  opening_amount: number | Decimal;
  opening_at: Date;
  opening_notes: string | null;
  opening_denominations: unknown | null;
  closing_amount: number | Decimal | null;
  closing_at: Date | null;
  closing_notes: string | null;
  closing_denominations: unknown | null;
  status: string;
  closing_user_id: number | null;
  totals_snapshot: unknown;
  invoice_sequence_start: string | null;
  invoice_sequence_end: string | null;
  created_at: Date;
  updated_at: Date | null;
  cash_registers: {
    id: number | bigint;
    code: string;
    name: string;
    allow_manual_warehouse_override: boolean;
    warehouses: { id: number; code: string; name: string } | null;
    default_customer?: DefaultCustomerRow | null;
  } | null;
};

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSessionId(value: number | string): bigint {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || !/^[0-9]+$/.test(trimmed)) {
      throw new Error("Identificador de sesión inválido");
    }
    return BigInt(trimmed);
  }
  if (!Number.isFinite(value)) {
    throw new Error("Identificador de sesión inválido");
  }
  const integer = Math.trunc(value);
  if (integer <= 0) {
    throw new Error("Identificador de sesión inválido");
  }
  return BigInt(integer);
}

async function findCustomerIdByCode(tx: Prisma.TransactionClient, code: string): Promise<bigint> {
  const normalizedCode = normalizeCode(code);
  const customer = await tx.customers.findUnique({
    where: { code: normalizedCode },
    select: { id: true },
  });

  if (!customer) {
    throw new Error(`El cliente ${normalizedCode} no existe`);
  }

  return BigInt(customer.id);
}

function mapRegisterToRecord(register: CashRegisterWithWarehouse): CashRegisterRecord {
  return {
    id: Number(register.id),
    code: register.code,
    name: register.name,
    warehouseId: Number(register.warehouses.id),
    warehouseCode: register.warehouses.code,
    warehouseName: register.warehouses.name,
    allowManualWarehouseOverride: register.allow_manual_warehouse_override,
    isActive: register.is_active,
    notes: register.notes,
    createdAt: register.created_at.toISOString(),
    updatedAt: register.updated_at?.toISOString() ?? null,
    invoiceSequenceDefinitionId: register.invoice_sequence_definition_id ? Number(register.invoice_sequence_definition_id) : null,
    invoiceSequenceCode: register.sequence_definitions?.code ?? null,
    invoiceSequenceName: register.sequence_definitions?.name ?? null,
    defaultCustomer: register.default_customer
      ? {
          id: Number(register.default_customer.id),
          code: register.default_customer.code,
          name: register.default_customer.name,
          paymentTermCode: register.default_customer.payment_terms?.code ?? null,
        }
      : null,
  } satisfies CashRegisterRecord;
}

function mapSessionToRecord(session: CashRegisterSessionWithRelations & { is_default?: boolean }): CashRegisterSessionRecord {
  const normalizeDenoms = (input: unknown): CashDenominationLine[] | null => {
    if (!Array.isArray(input)) return null;
    return (input as Array<{ currency: unknown; value: unknown; qty: unknown; kind?: unknown }>)
      .map((d) => {
        const rawKind = typeof d.kind === "string" ? d.kind.toUpperCase() : undefined;
        const allowed: DenominationKind[] = ["COIN", "BILL", "OTHER"];
        const kind = (rawKind && (allowed as readonly string[]).includes(rawKind)) ? (rawKind as DenominationKind) : undefined;
        const currency = typeof d.currency === "string" ? d.currency.trim().toUpperCase() : "";
        const value = Number(d.value);
        const qty = Number(d.qty);
        if (!currency || !Number.isFinite(value) || value < 0 || !Number.isFinite(qty) || qty < 0) {
          return null;
        }
        return { currency, value, qty, kind } as CashDenominationLine;
      })
      .filter((x): x is CashDenominationLine => x !== null);
  };
  const openingDenoms = normalizeDenoms(session.opening_denominations);
  const closingDenoms = normalizeDenoms(session.closing_denominations);
  return {
    id: Number(session.id),
    idRaw: session.id.toString(),
    status: session.status as "OPEN" | "CLOSED" | "CANCELLED",
    adminUserId: Number(session.admin_user_id),
    openingAmount: Number(session.opening_amount),
    openingAt: session.opening_at.toISOString(),
    openingNotes: session.opening_notes,
    openingDenominations: openingDenoms,
    closingAmount: session.closing_amount != null ? Number(session.closing_amount) : null,
    closingAt: session.closing_at?.toISOString() ?? null,
    closingNotes: session.closing_notes,
    closingDenominations: closingDenoms,
    closingUserId: session.closing_user_id != null ? Number(session.closing_user_id) : null,
    totalsSnapshot: session.totals_snapshot ?? null,
    cashRegister: {
      cashRegisterId: Number(session.cash_registers!.id),
      cashRegisterCode: session.cash_registers!.code,
      cashRegisterName: session.cash_registers!.name,
      allowManualWarehouseOverride: session.cash_registers!.allow_manual_warehouse_override,
      warehouseId: Number(session.cash_registers!.warehouses!.id),
      warehouseCode: session.cash_registers!.warehouses!.code,
      warehouseName: session.cash_registers!.warehouses!.name,
      isDefault: !!session.is_default,
      defaultCustomer: session.cash_registers?.default_customer
        ? {
            id: Number(session.cash_registers.default_customer.id),
            code: session.cash_registers.default_customer.code,
            name: session.cash_registers.default_customer.name,
            paymentTermCode: session.cash_registers.default_customer.payment_terms?.code ?? null,
          }
        : null,
    },
    invoiceSequenceStart: session.invoice_sequence_start ?? null,
    invoiceSequenceEnd: session.invoice_sequence_end ?? null,
  } satisfies CashRegisterSessionRecord;
}

export class CashRegisterRepository implements ICashRegisterRepository {
  private readonly prisma: PrismaClient;
  private defaultCustomerRelationSupported: boolean | null = null;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async listCashRegisters(options: { includeInactive?: boolean } = {}): Promise<CashRegisterRecord[]> {
    const { includeInactive = false } = options;
    const shouldIncludeDefault = this.defaultCustomerRelationSupported !== false;

    const baseInclude: CashRegisterIncludeWithDefault = {
      warehouses: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      sequence_definitions: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    };

    const include = buildIncludeWithDefault(baseInclude, shouldIncludeDefault);

    try {
      const registers = await this.prisma.cash_registers.findMany({
        where: {
          is_active: includeInactive ? undefined : true,
        },
        include,
        orderBy: {
          code: "asc",
        },
      });

      if (shouldIncludeDefault) {
        this.defaultCustomerRelationSupported = true;
      }

      return registers.map((register) =>
        mapRegisterToRecord({
          ...(register as unknown as CashRegisterWithWarehouse),
          default_customer: (register as unknown as CashRegisterWithWarehouse).default_customer ?? null,
        })
      );
    } catch (error) {
      if (shouldIncludeDefault && isMissingDefaultCustomerRelationError(error)) {
        this.defaultCustomerRelationSupported = false;
        return this.listCashRegisters(options);
      }
      throw error;
    }
  }

  async createCashRegister(input: CreateCashRegisterInput): Promise<CashRegisterRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(input.code);
      const normalizedWarehouseCode = normalizeCode(input.warehouseCode);
      const allowManualWarehouseOverride = Boolean(input.allowManualWarehouseOverride);
      const notes = input.notes?.trim() ? input.notes.trim().slice(0, 250) : null;
      let defaultCustomerId: bigint | null = null;

      if (typeof input.defaultCustomerCode === "string" && input.defaultCustomerCode.trim().length > 0) {
        defaultCustomerId = await findCustomerIdByCode(tx, input.defaultCustomerCode);
      }

      const warehouse = await tx.warehouses.findFirst({
        where: { code: normalizedWarehouseCode, is_active: true },
        select: { id: true, code: true, name: true },
      });

      if (!warehouse) {
        throw new Error(`El almacén ${normalizedWarehouseCode} no existe o está inactivo`);
      }

      const include = buildIncludeWithDefault(
        {
          warehouses: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          sequence_definitions: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        true
      );

      const newRegister = await tx.cash_registers.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          warehouse_id: Number(warehouse.id),
          allow_manual_warehouse_override: allowManualWarehouseOverride,
          notes: notes,
          default_customer_id: typeof defaultCustomerId === "bigint" ? defaultCustomerId : undefined,
        } as unknown as Prisma.cash_registersUncheckedCreateInput,
        include,
      });

      return mapRegisterToRecord(newRegister as unknown as CashRegisterWithWarehouse);
    });
  }

  async updateCashRegister(cashRegisterCode: string, input: UpdateCashRegisterInput): Promise<CashRegisterRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);

      const includeWithDefault = buildIncludeWithDefault(
        {
          warehouses: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          sequence_definitions: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
        true
      );

      const currentRegister = await tx.cash_registers.findUnique({
        where: { code: normalizedCode },
        include: includeWithDefault,
      });

      if (!currentRegister) {
        throw new Error(`La caja ${normalizedCode} no existe`);
      }

      let targetWarehouseId = currentRegister.warehouse_id;
      let targetSequenceDefinitionId = currentRegister.invoice_sequence_definition_id;
      let defaultCustomerUpdate: bigint | null | undefined = undefined;

      if (typeof input.warehouseCode === "string" && input.warehouseCode.trim().length > 0) {
        const normalizedInputWarehouseCode = normalizeCode(input.warehouseCode);
        const newWarehouse = await tx.warehouses.findFirst({
          where: { code: normalizedInputWarehouseCode, is_active: true },
          select: { id: true, code: true, name: true },
        });

        if (!newWarehouse) {
          throw new Error(`El almacén ${normalizedInputWarehouseCode} no existe o está inactivo`);
        }
        targetWarehouseId = newWarehouse.id;
      }

      if (typeof input.invoiceSequenceDefinitionId !== "undefined") {
        if (input.invoiceSequenceDefinitionId === null) {
          targetSequenceDefinitionId = null;
        } else {
          const candidate = await tx.sequence_definitions.findUnique({
            where: { id: Number(input.invoiceSequenceDefinitionId) },
            select: { id: true },
          });
          if (!candidate) {
            throw new Error("La secuencia especificada no existe");
          }
          targetSequenceDefinitionId = Number(candidate.id);
        }
      }

      if (typeof input.defaultCustomerCode !== "undefined") {
        if (input.defaultCustomerCode === null) {
          defaultCustomerUpdate = null;
        } else {
          const trimmed = input.defaultCustomerCode.trim();
          if (trimmed.length === 0) {
            defaultCustomerUpdate = null;
          } else {
            defaultCustomerUpdate = await findCustomerIdByCode(tx, trimmed);
          }
        }
      }

      const updatedRegister = await tx.cash_registers.update({
        where: { code: normalizedCode },
        data: {
          name: input.name?.trim(),
          allow_manual_warehouse_override: input.allowManualWarehouseOverride,
          is_active: input.isActive,
          notes: input.notes?.trim() ? input.notes.trim().slice(0, 250) : null,
          warehouse_id: targetWarehouseId,
          invoice_sequence_definition_id: targetSequenceDefinitionId,
          default_customer_id:
            typeof defaultCustomerUpdate === "undefined"
              ? undefined
              : defaultCustomerUpdate,
        } as unknown as Prisma.cash_registersUncheckedUpdateInput,
        include: includeWithDefault,
      });

      return mapRegisterToRecord(updatedRegister as unknown as CashRegisterWithWarehouse);
    });
  }

  async getCashRegisterById(cashRegisterId: number): Promise<CashRegisterRecord | null> {
    const include = buildIncludeWithDefault(
      {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sequence_definitions: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      true
    );

    const register = await this.prisma.cash_registers.findUnique({
      where: { id: Number(cashRegisterId) },
      include,
    });

    if (!register || !register.warehouses) {
      return null;
    }

    return mapRegisterToRecord(register as unknown as CashRegisterWithWarehouse);
  }

  async getCashRegisterByCode(cashRegisterCode: string): Promise<CashRegisterRecord | null> {
    const normalizedCode = normalizeCode(cashRegisterCode);
    const include = buildIncludeWithDefault(
      {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        sequence_definitions: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      true
    );

    const register = await this.prisma.cash_registers.findUnique({
      where: { code: normalizedCode },
      include,
    });

    if (!register || !register.warehouses) {
      return null;
    }

    return mapRegisterToRecord(register as unknown as CashRegisterWithWarehouse);
  }

  async countActiveCashRegisters(): Promise<number> {
    return this.prisma.cash_registers.count({ where: { is_active: true } });
  }

  async countOpenCashRegisterSessions(): Promise<number> {
    return this.prisma.cash_register_sessions.count({ where: { status: "OPEN" } });
  }

  async listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]> {
    const shouldIncludeDefault = this.defaultCustomerRelationSupported !== false;
    const cashRegisterInclude = buildIncludeWithDefault(
      {
        warehouses: {
          select: { id: true, code: true, name: true },
        },
      },
      shouldIncludeDefault
    );

    try {
      const assignments = await this.prisma.cash_register_users.findMany({
        where: { admin_user_id: adminUserId, cash_registers: { is_active: true } },
        include: {
          cash_registers: {
            include: cashRegisterInclude,
          },
        },
        orderBy: [{ is_default: "desc" }, { cash_registers: { code: "asc" } }],
      });

      if (shouldIncludeDefault) {
        this.defaultCustomerRelationSupported = true;
      }

      return assignments
        .filter((a: CashRegisterUserWithRelations) => a.cash_registers !== null && a.cash_registers.warehouses !== null)
        .map((assignment: CashRegisterUserWithRelations) => ({
          cashRegisterId: Number(assignment.cash_registers!.id),
          cashRegisterCode: assignment.cash_registers!.code,
          cashRegisterName: assignment.cash_registers!.name,
          allowManualWarehouseOverride: assignment.cash_registers!.allow_manual_warehouse_override,
          warehouseId: Number(assignment.cash_registers!.warehouses!.id),
          warehouseCode: assignment.cash_registers!.warehouses!.code,
          warehouseName: assignment.cash_registers!.warehouses!.name,
          isDefault: assignment.is_default,
          defaultCustomer: assignment.cash_registers!.default_customer
            ? {
                id: Number(assignment.cash_registers!.default_customer!.id),
                code: assignment.cash_registers!.default_customer!.code,
                name: assignment.cash_registers!.default_customer!.name,
                paymentTermCode: assignment.cash_registers!.default_customer!.payment_terms?.code ?? null,
              }
            : null,
        }));
    } catch (error) {
      if (shouldIncludeDefault && isMissingDefaultCustomerRelationError(error)) {
        this.defaultCustomerRelationSupported = false;
        return this.listCashRegistersForAdmin(adminUserId);
      }
      throw error;
    }
  }

  async listCashRegisterAssignments(options: { adminUserIds?: number[] } = {}): Promise<CashRegisterAssignmentGroup[]> {
    const { adminUserIds } = options;

    const whereClause: Record<string, unknown> = {};
    if (Array.isArray(adminUserIds) && adminUserIds.length > 0) {
      whereClause.admin_user_id = { in: adminUserIds.map((id) => Number(id)) };
    }

    const shouldIncludeDefault = this.defaultCustomerRelationSupported !== false;
    const cashRegisterInclude = buildIncludeWithDefault(
      {
        warehouses: {
          select: { id: true, code: true, name: true },
        },
      },
      shouldIncludeDefault
    );

    let assignments: CashRegisterUserWithRelations[];

    try {
      assignments = await this.prisma.cash_register_users.findMany({
        where: { ...whereClause, cash_registers: { is_active: true } },
        include: {
          cash_registers: {
            include: cashRegisterInclude,
          },
        },
        orderBy: [{ admin_user_id: "asc" }, { is_default: "desc" }, { cash_registers: { code: "asc" } }],
      });

      if (shouldIncludeDefault) {
        this.defaultCustomerRelationSupported = true;
      }
    } catch (error) {
      if (shouldIncludeDefault && isMissingDefaultCustomerRelationError(error)) {
        this.defaultCustomerRelationSupported = false;
        return this.listCashRegisterAssignments(options);
      }
      throw error;
    }

    const grouped = new Map<number, CashRegisterAssignmentGroup>();
    for (const assignment of assignments) {
      if (!assignment.cash_registers || !assignment.cash_registers.warehouses) continue;

      const mappedAssignment: CashRegisterAssignment = {
        cashRegisterId: Number(assignment.cash_registers.id),
        cashRegisterCode: assignment.cash_registers.code,
        cashRegisterName: assignment.cash_registers.name,
        allowManualWarehouseOverride: assignment.cash_registers.allow_manual_warehouse_override,
        warehouseId: Number(assignment.cash_registers.warehouses.id),
        warehouseCode: assignment.cash_registers.warehouses.code,
        warehouseName: assignment.cash_registers.warehouses.name,
        isDefault: assignment.is_default,
        defaultCustomer: assignment.cash_registers.default_customer
          ? {
              id: Number(assignment.cash_registers.default_customer.id),
              code: assignment.cash_registers.default_customer.code,
              name: assignment.cash_registers.default_customer.name,
              paymentTermCode: assignment.cash_registers.default_customer.payment_terms?.code ?? null,
            }
          : null,
      };

      const existing = grouped.get(Number(assignment.admin_user_id));
      if (!existing) {
        grouped.set(Number(assignment.admin_user_id), {
          adminUserId: Number(assignment.admin_user_id),
          assignments: [mappedAssignment],
          defaultCashRegisterId: mappedAssignment.isDefault ? mappedAssignment.cashRegisterId : null,
        });
      } else {
        existing.assignments.push(mappedAssignment);
        if (mappedAssignment.isDefault) {
          existing.defaultCashRegisterId = mappedAssignment.cashRegisterId;
        }
      }
    }

    return Array.from(grouped.values());
  }

  async assignCashRegisterToAdmin(params: {
    adminUserId: number;
    cashRegisterCode: string;
    makeDefault?: boolean;
  }): Promise<void> {
    const { adminUserId, cashRegisterCode, makeDefault = false } = params;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);
      const register = await tx.cash_registers.findFirst({
        where: { code: normalizedCode, is_active: true },
        select: { id: true },
      });

      if (!register) {
        throw new Error(`La caja ${normalizedCode} no existe o está inactiva`);
      }

      if (makeDefault) {
        await tx.cash_register_users.updateMany({
          where: { admin_user_id: adminUserId },
          data: { is_default: false },
        });
      }

      await tx.cash_register_users.upsert({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: register.id,
            admin_user_id: adminUserId,
          },
        },
        update: {
          is_default: makeDefault,
          assigned_at: new Date(),
        },
        create: {
          cash_register_id: register.id,
          admin_user_id: adminUserId,
          is_default: makeDefault,
        },
      });
    });
  }

  async unassignCashRegisterFromAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void> {
    const { adminUserId, cashRegisterCode } = params;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);
      const register = await tx.cash_registers.findFirst({
        where: { code: normalizedCode },
        select: { id: true },
      });

      if (!register) {
        throw new Error(`La caja ${normalizedCode} no existe`);
      }

      await tx.cash_register_users.delete({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: register.id,
            admin_user_id: adminUserId,
          },
        },
      });
    });
  }

  async setDefaultCashRegisterForAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void> {
    const { adminUserId, cashRegisterCode } = params;
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);
      const register = await tx.cash_registers.findFirst({
        where: { code: normalizedCode, is_active: true },
        select: { id: true },
      });

      if (!register) {
        throw new Error(`La caja ${normalizedCode} no existe o está inactiva`);
      }

      const assignment = await tx.cash_register_users.findUnique({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: register.id,
            admin_user_id: adminUserId,
          },
        },
      });

      if (!assignment) {
        throw new Error("La caja no está asignada al usuario");
      }

      await tx.cash_register_users.updateMany({
        where: { admin_user_id: adminUserId },
        data: { is_default: false },
      });

      await tx.cash_register_users.update({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: register.id,
            admin_user_id: adminUserId,
          },
        },
        data: { is_default: true },
      });
    });
  }

  async getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null> {
    const session = await this.prisma.cash_register_sessions.findFirst({
      where: { admin_user_id: adminUserId, status: "OPEN" },
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: { opening_at: "desc" },
    });

    if (!session || !session.cash_registers || !session.cash_registers.warehouses) return null;

    // Simulate is_default from cash_register_users for mapping
    const cashRegisterUser = await this.prisma.cash_register_users.findUnique({
      where: {
        cash_register_id_admin_user_id: {
          cash_register_id: session.cash_register_id,
          admin_user_id: adminUserId,
        },
      },
      select: { is_default: true },
    });

    return mapSessionToRecord({ ...session, is_default: cashRegisterUser?.is_default ?? false });
  }

  async listCashRegisterSessionsForAdmin(adminUserId: number, options: { limit?: number } = {}): Promise<CashRegisterSessionRecord[]> {
    const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0 ? Math.min(Math.trunc(options.limit), 50) : 10;

    const sessions = await this.prisma.cash_register_sessions.findMany({
      where: { admin_user_id: adminUserId },
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: { opening_at: "desc" },
      take: limit,
    });

    return Promise.all(sessions.map(async (session: CashRegisterSessionWithRelations) => {
      if (!session.cash_registers || !session.cash_registers.warehouses) {
        // Handle cases where related data might be missing (e.g., if warehouse was deleted)
        return mapSessionToRecord({ ...session, is_default: false, cash_registers: { ...session.cash_registers!, warehouses: { id: 0, code: "UNKNOWN", name: "Unknown Warehouse" } } });
      }

      const cashRegisterUser = await this.prisma.cash_register_users.findUnique({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: session.cash_register_id,
            admin_user_id: adminUserId,
          },
        },
        select: { is_default: true },
      });
      return mapSessionToRecord({ ...session, is_default: cashRegisterUser?.is_default ?? false });
    }));
  }

  async getCashRegisterSessionById(sessionId: number | string): Promise<CashRegisterSessionRecord | null> {
    const normalizedId = normalizeSessionId(sessionId);
    const session = await this.prisma.cash_register_sessions.findUnique({
      where: { id: normalizedId },
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    if (!session) return null;

    // Ensure we always have a cash_registers object with a warehouse fallback so callers
    // (like report endpoints) don't fail when related rows were removed o son incompletos.
    const fallbackWarehouse = { id: 0, code: "UNKNOWN", name: "Unknown Warehouse" } as const;
    let sessionWithRelations: CashRegisterSessionWithRelations;

    if (session.cash_registers && session.cash_registers.warehouses) {
      sessionWithRelations = session;
    } else if (session.cash_registers) {
      sessionWithRelations = {
        ...session,
        cash_registers: {
          ...session.cash_registers,
          warehouses: session.cash_registers.warehouses ?? { ...fallbackWarehouse },
        },
      };
    } else {
      sessionWithRelations = {
        ...session,
        cash_registers: {
          id: session.cash_register_id,
          code: "UNKNOWN",
          name: "Unknown",
          allow_manual_warehouse_override: false,
          warehouses: { ...fallbackWarehouse },
        },
      };
    }

    // Simulate is_default from cash_register_users for mapping
    const cashRegisterUser = await this.prisma.cash_register_users.findUnique({
      where: {
        cash_register_id_admin_user_id: {
          cash_register_id: session.cash_register_id,
          admin_user_id: session.admin_user_id,
        },
      },
      select: { is_default: true },
    });

    return mapSessionToRecord({ ...sessionWithRelations, is_default: cashRegisterUser?.is_default ?? false });
  }

  async openCashRegisterSession(params: {
    adminUserId: number;
    cashRegisterCode: string;
    openingAmount: number;
    openingNotes: string | null;
    allowUnassigned?: boolean;
    actingAdminUserId?: number;
    openingDenominations?: Array<{ currency: string; value: number; qty: number; kind?: string }>;
  }): Promise<CashRegisterSessionRecord> {
    const { adminUserId, cashRegisterCode, openingAmount, openingNotes, allowUnassigned = false, openingDenominations } = params;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);
      let targetCashRegister: CashRegisterWithWarehouse | null = null;
      let isDefaultAssignment = false;
      const shouldIncludeDefault = this.defaultCustomerRelationSupported !== false;

      if (allowUnassigned) {
        const include = buildIncludeWithDefault(
          {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
            sequence_definitions: {
              select: { id: true, code: true, name: true },
            },
          },
          shouldIncludeDefault
        );

        const register = await tx.cash_registers.findFirst({
          where: { code: normalizedCode, is_active: true },
          include,
        });
        targetCashRegister = register ? (register as unknown as CashRegisterWithWarehouse) : null;
      } else {
        const assignment = await tx.cash_register_users.findFirst({
          where: { admin_user_id: adminUserId, cash_registers: { code: normalizedCode, is_active: true } },
          include: {
            cash_registers: {
              include: buildIncludeWithDefault(
                {
                  warehouses: {
                    select: { id: true, code: true, name: true },
                  },
                  sequence_definitions: {
                    select: { id: true, code: true, name: true },
                  },
                },
                shouldIncludeDefault
              ),
            },
          },
        });
        if (assignment) {
          targetCashRegister = assignment.cash_registers as unknown as CashRegisterWithWarehouse;
          isDefaultAssignment = assignment.is_default;
        }
      }

      if (!targetCashRegister || !targetCashRegister.warehouses) {
        throw new Error(`No tienes permisos para operar la caja ${cashRegisterCode} o no existe/está inactiva`);
      }

      const openForUser = await tx.cash_register_sessions.findFirst({
        where: { admin_user_id: adminUserId, status: "OPEN" },
      });
      if (openForUser) {
        throw new Error("Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.");
      }

      const openForRegister = await tx.cash_register_sessions.findFirst({
        where: { cash_register_id: Number(targetCashRegister.id), status: "OPEN" },
      });
      if (openForRegister) {
        throw new Error("La caja seleccionada ya cuenta con una apertura activa.");
      }

      const newSession = await tx.cash_register_sessions.create({
        data: {
          cash_register_id: Number(targetCashRegister.id),
          admin_user_id: adminUserId,
          opening_amount: openingAmount,
          opening_notes: openingNotes,
          opening_denominations: (openingDenominations as unknown as InputJsonValue) ?? undefined,
        },
        include: {
          cash_registers: {
            include: buildIncludeWithDefault(
              {
                warehouses: {
                  select: { id: true, code: true, name: true },
                },
              },
              shouldIncludeDefault
            ),
          },
        },
      });

      return mapSessionToRecord({ ...(newSession as unknown as CashRegisterSessionWithRelations), is_default: isDefaultAssignment });
    });
  }

  async closeCashRegisterSession(params: {
    adminUserId: number;
    sessionId?: number | null;
    closingAmount: number;
    payments: ReportedPayment[];
    closingNotes: string | null;
    allowDifferentUser?: boolean;
    closingDenominations?: Array<{ currency: string; value: number; qty: number; kind?: string }>;
  }): Promise<CashRegisterClosureSummary> {
    const { adminUserId, sessionId, closingAmount, payments, closingNotes, allowDifferentUser = false, closingDenominations } = params;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let sessionToClose: CashRegisterSessionWithRelations | null = null;
      const shouldIncludeDefault = this.defaultCustomerRelationSupported !== false;

      if (sessionId) {
        sessionToClose = await tx.cash_register_sessions.findUnique({
          where: { id: BigInt(sessionId) },
          include: {
            cash_registers: {
              include: buildIncludeWithDefault(
                {
                  warehouses: {
                    select: { id: true, code: true, name: true },
                  },
                },
                shouldIncludeDefault
              ),
            },
          },
        });
      } else {
        sessionToClose = await tx.cash_register_sessions.findFirst({
          where: { admin_user_id: adminUserId, status: "OPEN" },
          include: {
            cash_registers: {
              include: buildIncludeWithDefault(
                {
                  warehouses: {
                    select: { id: true, code: true, name: true },
                  },
                },
                shouldIncludeDefault
              ),
            },
          },
          orderBy: { opening_at: "desc" },
        });
      }

      if (!sessionToClose || !sessionToClose.cash_registers || !sessionToClose.cash_registers.warehouses) {
        throw new Error("No se encontró una apertura de caja activa");
      }
      if (sessionToClose.status !== "OPEN") {
        throw new Error("La sesión indicada ya fue cerrada");
      }
      const sessionOwnerId = Number(sessionToClose.admin_user_id);
      if (sessionOwnerId !== adminUserId && !allowDifferentUser) {
        throw new Error("Solo el usuario que abrió la caja puede cerrarla");
      }

      // Simulate is_default for mapping
      const cashRegisterUser = await tx.cash_register_users.findUnique({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: sessionToClose.cash_register_id,
            admin_user_id: sessionOwnerId,
          },
        },
        select: { is_default: true },
      });
      const mappedSession = mapSessionToRecord({ ...sessionToClose, is_default: cashRegisterUser?.is_default ?? false });

      const expectedPaymentsResult = await tx.invoice_payments.groupBy({
        by: ["payment_method"],
        where: {
          invoices: {
            cash_register_session_id: sessionToClose.id,
          },
        },
        _sum: { amount: true },
        _count: { invoice_id: true },
      });

      const expectedPayments: ExpectedPayment[] = expectedPaymentsResult.map((row: { payment_method: string; _sum: { amount: Decimal | null }; _count: { invoice_id: number } }) => ({
        method: row.payment_method.trim().toUpperCase(),
        amount: Number(row._sum.amount ?? 0),
        txCount: Number(row._count.invoice_id ?? 0),
      }));

      const totalInvoices = await tx.invoices.count({
        where: { cash_register_session_id: sessionToClose.id },
      });

      const summary = buildClosureSummary({
        session: mappedSession,
        closingUserId: adminUserId,
        closingAmount,
        closingAt: new Date(),
        closingNotes,
        expectedPayments,
        reportedPayments: payments,
        totalInvoices,
      });

      await tx.cash_register_sessions.update({
        where: { id: sessionToClose.id },
        data: {
          closing_amount: summary.closingAmount,
          closing_at: summary.closingAt,
          closing_notes: summary.closingNotes,
          closing_user_id: adminUserId,
          status: "CLOSED",
          totals_snapshot: summary as InputJsonValue, // Prisma JSON type
          closing_denominations: (closingDenominations as unknown as InputJsonValue) ?? undefined,
        },
      });

      // Upsert cash_register_session_payments
      for (const payment of summary.payments) {
        await tx.cash_register_session_payments.upsert({
          where: {
            session_id_payment_method: {
              session_id: summary.sessionId,
              payment_method: payment.method,
            },
          },
          update: {
            expected_amount: payment.expectedAmount,
            reported_amount: payment.reportedAmount,
            difference_amount: payment.differenceAmount,
            transaction_count: payment.transactionCount,
            updated_at: new Date(),
          },
          create: {
            session_id: summary.sessionId,
            payment_method: payment.method,
            expected_amount: payment.expectedAmount,
            reported_amount: payment.reportedAmount,
            difference_amount: payment.differenceAmount,
            transaction_count: payment.transactionCount,
          },
        });
      }

      return summary;
    });
  }

  async getCashRegisterClosureReport(sessionId: number | string): Promise<{
    session: CashRegisterSessionRecord;
    payments: ExpectedPayment[];
    totalInvoices: number;
  } | null> {
    const normalizedId = normalizeSessionId(sessionId);
    const session = await this.getCashRegisterSessionById(normalizedId.toString());
    if (!session) {
      return null;
    }

    const expectedPaymentsResult = await this.prisma.invoice_payments.groupBy({
      by: ["payment_method"],
      where: {
        invoices: {
          cash_register_session_id: normalizedId,
        },
      },
      _sum: { amount: true },
      _count: { invoice_id: true },
    });

    const payments: ExpectedPayment[] = expectedPaymentsResult.map((row: { payment_method: string; _sum: { amount: Decimal | null }; _count: { invoice_id: number } }) => ({
      method: row.payment_method.trim().toUpperCase(),
      amount: Number(row._sum.amount ?? 0),
      txCount: Number(row._count.invoice_id ?? 0),
    }));

    const totalInvoices = await this.prisma.invoices.count({
      where: { cash_register_session_id: normalizedId },
    });

    return { session, payments, totalInvoices };
  }

  async updateSessionInvoiceSequenceRange(sessionId: number | string, invoiceLabel: string): Promise<void> {
    const trimmed = invoiceLabel.trim();
    if (!trimmed) {
      throw new Error("El consecutivo de factura no puede estar vacío");
    }

    const normalizedId = normalizeSessionId(sessionId);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.cash_register_sessions.findUnique({
        where: { id: normalizedId },
        select: {
          id: true,
          invoice_sequence_start: true,
        },
      });

      if (!current) {
        throw new Error("Sesión de caja no encontrada");
      }

      const startValue = current.invoice_sequence_start ?? trimmed;

      await tx.cash_register_sessions.update({
        where: { id: current.id },
        data: {
          invoice_sequence_start: startValue,
          invoice_sequence_end: trimmed,
        },
      });
    });
  }

  async listActiveCashRegisterSessions(): Promise<CashRegisterSessionRecord[]> {
    const sessions = await this.prisma.cash_register_sessions.findMany({
      where: { status: "OPEN" },
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: { opening_at: "asc" },
    });

    return Promise.all(sessions.map(async (session: CashRegisterSessionWithRelations) => {
      if (!session.cash_registers || !session.cash_registers.warehouses) {
        return mapSessionToRecord({ ...session, is_default: false, cash_registers: { ...session.cash_registers!, warehouses: { id: 0, code: "UNKNOWN", name: "Unknown Warehouse" } } });
      }

      const cashRegisterUser = await this.prisma.cash_register_users.findUnique({
        where: {
          cash_register_id_admin_user_id: {
            cash_register_id: session.cash_register_id,
            admin_user_id: session.admin_user_id,
          },
        },
        select: { is_default: true },
      });
      return mapSessionToRecord({ ...session, is_default: cashRegisterUser?.is_default ?? false });
    }));
  }
}
