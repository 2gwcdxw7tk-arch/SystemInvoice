import { PrismaClient } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client"; // Type-only Prisma for TransactionClient
import type { Decimal, InputJsonValue } from "@prisma/client/runtime/library";
import { buildClosureSummary } from "@/lib/services/cash-registers/summary";
import {
  CashRegisterAssignment,
  CashRegisterAssignmentGroup,
  CashRegisterClosureSummary,
  CashRegisterRecord,
  CashRegisterSessionRecord,
  CreateCashRegisterInput,
  ExpectedPayment,
  ReportedPayment,
  UpdateCashRegisterInput,
} from "@/lib/services/cash-registers/types";
import type { ICashRegisterRepository } from "./ICashRegisterRepository";

// Tipos para los payloads de Prisma con las relaciones incluidas
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
};

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
  };
};

type CashRegisterSessionWithRelations = {
  id: number | bigint;
  cash_register_id: number;
  admin_user_id: number;
  opening_amount: number | Decimal;
  opening_at: Date;
  opening_notes: string | null;
  closing_amount: number | Decimal | null;
  closing_at: Date | null;
  closing_notes: string | null;
  status: string;
  closing_user_id: number | null;
  totals_snapshot: unknown;
  created_at: Date;
  updated_at: Date | null;
  cash_registers: {
    id: number | bigint;
    code: string;
    name: string;
    allow_manual_warehouse_override: boolean;
    warehouses: { id: number; code: string; name: string } | null;
  } | null;
};

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
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
  } satisfies CashRegisterRecord;
}

function mapSessionToRecord(session: CashRegisterSessionWithRelations & { is_default?: boolean }): CashRegisterSessionRecord {
  return {
    id: Number(session.id),
    status: session.status as "OPEN" | "CLOSED" | "CANCELLED",
    adminUserId: Number(session.admin_user_id),
    openingAmount: Number(session.opening_amount),
    openingAt: session.opening_at.toISOString(),
    openingNotes: session.opening_notes,
    closingAmount: session.closing_amount != null ? Number(session.closing_amount) : null,
    closingAt: session.closing_at?.toISOString() ?? null,
    closingNotes: session.closing_notes,
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
    },
  } satisfies CashRegisterSessionRecord;
}

export class CashRegisterRepository implements ICashRegisterRepository {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  async listCashRegisters(options: { includeInactive?: boolean } = {}): Promise<CashRegisterRecord[]> {
    const { includeInactive = false } = options;

    const registers = await this.prisma.cash_registers.findMany({
      where: {
        is_active: includeInactive ? undefined : true,
      },
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: {
        code: "asc",
      },
    });

    return registers.map((register: CashRegisterWithWarehouse) => mapRegisterToRecord(register));
  }

  async createCashRegister(input: CreateCashRegisterInput): Promise<CashRegisterRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(input.code);
      const normalizedWarehouseCode = normalizeCode(input.warehouseCode);
      const allowManualWarehouseOverride = Boolean(input.allowManualWarehouseOverride);
      const notes = input.notes?.trim() ? input.notes.trim().slice(0, 250) : null;

      const warehouse = await tx.warehouses.findFirst({
        where: { code: normalizedWarehouseCode, is_active: true },
        select: { id: true, code: true, name: true },
      });

      if (!warehouse) {
        throw new Error(`El almacén ${normalizedWarehouseCode} no existe o está inactivo`);
      }

      const newRegister = await tx.cash_registers.create({
        data: {
          code: normalizedCode,
          name: input.name.trim(),
          warehouse_id: warehouse.id,
          allow_manual_warehouse_override: allowManualWarehouseOverride,
          notes: notes,
        },
        include: {
          warehouses: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      return mapRegisterToRecord(newRegister);
    });
  }

  async updateCashRegister(cashRegisterCode: string, input: UpdateCashRegisterInput): Promise<CashRegisterRecord> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);

      const currentRegister = await tx.cash_registers.findUnique({
        where: { code: normalizedCode },
        include: {
          warehouses: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      if (!currentRegister) {
        throw new Error(`La caja ${normalizedCode} no existe`);
      }

      let targetWarehouseId = currentRegister.warehouse_id;

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

      const updatedRegister = await tx.cash_registers.update({
        where: { code: normalizedCode },
        data: {
          name: input.name?.trim(),
          allow_manual_warehouse_override: input.allowManualWarehouseOverride,
          is_active: input.isActive,
          notes: input.notes?.trim() ? input.notes.trim().slice(0, 250) : null,
          warehouse_id: targetWarehouseId,
        },
        include: {
          warehouses: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      });

      return mapRegisterToRecord(updatedRegister);
    });
  }

  async listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]> {
    const assignments = await this.prisma.cash_register_users.findMany({
      where: { admin_user_id: adminUserId, cash_registers: { is_active: true } }, // Filter active cash registers here
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: [{ is_default: "desc" }, { cash_registers: { code: "asc" } }],
    });

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
      }));
  }

  async listCashRegisterAssignments(options: { adminUserIds?: number[] } = {}): Promise<CashRegisterAssignmentGroup[]> {
    const { adminUserIds } = options;

    const whereClause: Record<string, unknown> = {};
    if (Array.isArray(adminUserIds) && adminUserIds.length > 0) {
      whereClause.admin_user_id = { in: adminUserIds.map((id) => Number(id)) };
    }

    const assignments = await this.prisma.cash_register_users.findMany({
      where: { ...whereClause, cash_registers: { is_active: true } }, // Filter active cash registers here
      include: {
        cash_registers: {
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
      orderBy: [{ admin_user_id: "asc" }, { is_default: "desc" }, { cash_registers: { code: "asc" } }],
    });

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

  async getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null> {
    const session = await this.prisma.cash_register_sessions.findUnique({
      where: { id: BigInt(sessionId) },
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

    if (!session || !session.cash_registers || !session.cash_registers.warehouses) return null;

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

    return mapSessionToRecord({ ...session, is_default: cashRegisterUser?.is_default ?? false });
  }

  async openCashRegisterSession(params: {
    adminUserId: number;
    cashRegisterCode: string;
    openingAmount: number;
    openingNotes: string | null;
    allowUnassigned?: boolean;
    actingAdminUserId?: number;
  }): Promise<CashRegisterSessionRecord> {
    const { adminUserId, cashRegisterCode, openingAmount, openingNotes, allowUnassigned = false } = params;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const normalizedCode = normalizeCode(cashRegisterCode);
      let targetCashRegister: CashRegisterWithWarehouse | null = null;
      let isDefaultAssignment = false;

      if (allowUnassigned) {
        targetCashRegister = await tx.cash_registers.findFirst({
          where: { code: normalizedCode, is_active: true },
          include: {
            warehouses: {
              select: { id: true, code: true, name: true },
            },
          },
        });
      } else {
        const assignment = await tx.cash_register_users.findFirst({
          where: { admin_user_id: adminUserId, cash_registers: { code: normalizedCode, is_active: true } },
          include: {
            cash_registers: {
              select: { id: true, code: true, name: true, allow_manual_warehouse_override: true, warehouse_id: true },
              include: {
                warehouses: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
        });
        if (assignment) {
          targetCashRegister = assignment.cash_registers;
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
        },
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
  }): Promise<CashRegisterClosureSummary> {
    const { adminUserId, sessionId, closingAmount, payments, closingNotes, allowDifferentUser = false } = params;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let sessionToClose: CashRegisterSessionWithRelations | null = null;

      if (sessionId) {
        sessionToClose = await tx.cash_register_sessions.findUnique({
          where: { id: BigInt(sessionId) },
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
      } else {
        sessionToClose = await tx.cash_register_sessions.findFirst({
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

  async getCashRegisterClosureReport(sessionId: number): Promise<{
    session: CashRegisterSessionRecord;
    payments: ExpectedPayment[];
    totalInvoices: number;
  } | null> {
    const session = await this.getCashRegisterSessionById(sessionId);
    if (!session) {
      return null;
    }

    const expectedPaymentsResult = await this.prisma.invoice_payments.groupBy({
      by: ["payment_method"],
      where: {
        invoices: {
          cash_register_session_id: BigInt(sessionId),
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
      where: { cash_register_session_id: BigInt(sessionId) },
    });

    return { session, payments, totalInvoices };
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
