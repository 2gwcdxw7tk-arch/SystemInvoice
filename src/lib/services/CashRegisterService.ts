import { env } from "@/lib/env";
import {
  CashRegisterAssignment,
  CashRegisterClosureSummary,
  CashRegisterReport,
  CashRegisterSessionRecord,
  CloseCashRegisterSessionInput,
  ExpectedPayment,
  OpenCashRegisterSessionInput,
  ReportedPayment,
} from "@/lib/services/cash-registers/types";
import { buildClosureSummary } from "@/lib/services/cash-registers/summary";
import type { ICashRegisterRepository } from "@/lib/repositories/cash-registers/ICashRegisterRepository";
import { CashRegisterRepository } from "@/lib/repositories/cash-registers/CashRegisterRepository";

function cloneAssignment(assignment: CashRegisterAssignment): CashRegisterAssignment {
  return { ...assignment };
}

function cloneSession(session: CashRegisterSessionRecord): CashRegisterSessionRecord {
  return {
    ...session,
    cashRegister: cloneAssignment(session.cashRegister),
  };
}

type MockCashRegister = {
  id: number;
  code: string;
  name: string;
  allowManualWarehouseOverride: boolean;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
};

type MockSessionInvoice = {
  sessionId: number;
  invoiceId: number;
  totalAmount: number;
  payments: Array<{ method: string; amount: number }>;
};

export class CashRegisterService {
  private readonly repository: ICashRegisterRepository;
  private readonly mockCashRegisters: MockCashRegister[];
  private readonly mockAssignments: Map<number, CashRegisterAssignment[]> | null;
  private readonly mockSessions: Map<number, CashRegisterSessionRecord> | null;
  private readonly mockSessionInvoices: MockSessionInvoice[] | null;
  private mockSessionSeq: number;

  constructor(repository: ICashRegisterRepository = new CashRegisterRepository()) {
    this.repository = repository;

    if (env.useMockData) {
      this.mockCashRegisters = [
        {
          id: 1,
          code: "CAJA-01",
          name: "Caja principal",
          allowManualWarehouseOverride: false,
          warehouseId: 1,
          warehouseCode: "PRINCIPAL",
          warehouseName: "Almacen principal",
        },
      ];
      this.mockAssignments = new Map();
      this.mockSessions = new Map();
      this.mockSessionInvoices = [];
      this.mockSessionSeq = 1;
    } else {
      this.mockCashRegisters = [];
      this.mockAssignments = null;
      this.mockSessions = null;
      this.mockSessionInvoices = null;
      this.mockSessionSeq = 0;
    }
  }

  private ensureMockAssignments(adminUserId: number): CashRegisterAssignment[] {
    if (!env.useMockData || !this.mockAssignments) {
      return [];
    }
    const existing = this.mockAssignments.get(adminUserId);
    if (existing) {
      return existing.map(cloneAssignment);
    }
    const assignments = this.mockCashRegisters.map((register, index) => ({
      cashRegisterId: register.id,
      cashRegisterCode: register.code,
      cashRegisterName: register.name,
      allowManualWarehouseOverride: register.allowManualWarehouseOverride,
      warehouseId: register.warehouseId,
      warehouseCode: register.warehouseCode,
      warehouseName: register.warehouseName,
      isDefault: index === 0,
    } satisfies CashRegisterAssignment));
    this.mockAssignments.set(adminUserId, assignments);
    return assignments.map(cloneAssignment);
  }

  private findMockSession(predicate: (session: CashRegisterSessionRecord) => boolean): CashRegisterSessionRecord | null {
    if (!env.useMockData || !this.mockSessions) {
      return null;
    }
    for (const session of this.mockSessions.values()) {
      if (predicate(session)) {
        return cloneSession(session);
      }
    }
    return null;
  }

  async listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]> {
    if (env.useMockData) {
      return this.ensureMockAssignments(adminUserId);
    }
    return this.repository.listCashRegistersForAdmin(adminUserId);
  }

  async getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null> {
    if (env.useMockData && this.mockSessions) {
      return this.findMockSession(
        (session) => session.adminUserId === adminUserId && session.status === "OPEN"
      );
    }
    return this.repository.getActiveCashRegisterSessionByAdmin(adminUserId);
  }

  async listRecentCashRegisterSessions(adminUserId: number, options: { limit?: number } = {}): Promise<CashRegisterSessionRecord[]> {
    if (env.useMockData && this.mockSessions) {
      const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0 ? Math.min(Math.trunc(options.limit), 50) : 10;
      const sessions = Array.from(this.mockSessions.values()).filter((session) => session.adminUserId === adminUserId);
      sessions.sort((a, b) => {
        const timeA = new Date(a.openingAt).getTime();
        const timeB = new Date(b.openingAt).getTime();
        return timeB - timeA;
      });
      return sessions.slice(0, limit).map((session) => cloneSession(session));
    }

    return this.repository.listCashRegisterSessionsForAdmin(adminUserId, options);
  }

  async getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null> {
    if (env.useMockData && this.mockSessions) {
      const session = this.mockSessions.get(sessionId);
      return session ? cloneSession(session) : null;
    }
    return this.repository.getCashRegisterSessionById(sessionId);
  }

  async openCashRegisterSession(input: OpenCashRegisterSessionInput): Promise<CashRegisterSessionRecord> {
    const openingNotes = input.openingNotes?.trim()?.slice(0, 400) ?? null;
    if (!(input.openingAmount >= 0)) {
      throw new Error("El monto de apertura debe ser positivo o cero");
    }

    if (env.useMockData && this.mockSessions && this.mockAssignments) {
      const assignments = this.ensureMockAssignments(input.adminUserId);
      const target = assignments.find(
        (assignment) => assignment.cashRegisterCode === input.cashRegisterCode.trim().toUpperCase()
      );
      if (!target) {
        throw new Error(`No tienes permisos para operar la caja ${input.cashRegisterCode}`);
      }
      const hasOpen = this.findMockSession(
        (session) =>
          session.status === "OPEN" &&
          (session.adminUserId === input.adminUserId ||
            session.cashRegister.cashRegisterId === target.cashRegisterId)
      );
      if (hasOpen) {
        throw new Error("Ya existe una apertura activa para el usuario o la caja seleccionada");
      }
      const id = this.mockSessionSeq++;
      const nowIso = new Date().toISOString();
      const newSession: CashRegisterSessionRecord = {
        id,
        status: "OPEN",
        adminUserId: input.adminUserId,
        openingAmount: Number(input.openingAmount.toFixed(2)),
        openingAt: nowIso,
        openingNotes,
        closingAmount: null,
        closingAt: null,
        closingNotes: null,
        cashRegister: cloneAssignment(target),
        closingUserId: null,
        totalsSnapshot: null,
      };
      this.mockSessions.set(id, newSession);
      return cloneSession(newSession);
    }

    return this.repository.openCashRegisterSession({
      adminUserId: input.adminUserId,
      cashRegisterCode: input.cashRegisterCode,
      openingAmount: input.openingAmount,
      openingNotes,
    });
  }

  async closeCashRegisterSession(input: CloseCashRegisterSessionInput): Promise<CashRegisterClosureSummary> {
    const closingNotes = input.closingNotes?.trim()?.slice(0, 400) ?? null;
    const closingAmount = Number(input.closingAmount);
    if (!(closingAmount >= 0)) {
      throw new Error("El monto de cierre debe ser positivo o cero");
    }

    const normalizedPayments: ReportedPayment[] = input.payments.map((payment) => {
      const method = payment.method.trim().toUpperCase();
      const reportedAmount = Number(payment.reportedAmount ?? 0);
      if (!Number.isFinite(reportedAmount) || reportedAmount < 0) {
        throw new Error("Los montos reportados deben ser válidos y no negativos");
      }
      const txCount = payment.transactionCount != null ? Math.max(0, Math.trunc(payment.transactionCount)) : 0;
      return {
        method,
        reportedAmount,
        txCount,
      };
    });

    if (env.useMockData && this.mockSessions && this.mockSessionInvoices) {
      const session = (() => {
        if (input.sessionId != null) {
          return this.mockSessions.get(input.sessionId) ?? null;
        }
        return this.findMockSession(
          (candidate) => candidate.adminUserId === input.adminUserId && candidate.status === "OPEN"
        );
      })();

      if (!session) {
        throw new Error("No se encontró una apertura de caja activa");
      }
      if (session.status !== "OPEN") {
        throw new Error("La sesión indicada ya fue cerrada");
      }

      const invoices = this.mockSessionInvoices.filter((item) => item.sessionId === session.id);
      const expectedMap = new Map<string, { amount: number; txCount: number }>();
      for (const invoice of invoices) {
        for (const payment of invoice.payments) {
          const key = payment.method.trim().toUpperCase();
          const prev = expectedMap.get(key) ?? { amount: 0, txCount: 0 };
          expectedMap.set(key, {
            amount: prev.amount + payment.amount,
            txCount: prev.txCount + 1,
          });
        }
      }
      const expectedPayments: ExpectedPayment[] = Array.from(expectedMap.entries()).map(
        ([method, data]) => ({
          method,
          amount: Number(data.amount.toFixed(2)),
          txCount: data.txCount,
        })
      );

      const summary = buildClosureSummary({
        session,
        closingUserId: input.adminUserId,
        closingAmount,
        closingAt: new Date(),
        closingNotes,
        expectedPayments,
        reportedPayments: normalizedPayments,
        totalInvoices: invoices.length,
      });

      const updatedSession: CashRegisterSessionRecord = {
        ...session,
        status: "CLOSED",
        closingAmount: summary.closingAmount,
        closingAt: summary.closingAt,
        closingNotes: summary.closingNotes,
        closingUserId: input.adminUserId,
        totalsSnapshot: summary,
      };
      this.mockSessions.set(session.id, updatedSession);
      return summary;
    }

    return this.repository.closeCashRegisterSession({
      adminUserId: input.adminUserId,
      sessionId: input.sessionId ?? null,
      closingAmount,
      payments: normalizedPayments,
      closingNotes,
    });
  }

  async getCashRegisterClosureReport(sessionId: number): Promise<CashRegisterReport | null> {
    const session = await this.getCashRegisterSessionById(sessionId);
    if (!session) {
      return null;
    }

    if (session.totalsSnapshot && typeof session.totalsSnapshot === "object") {
      const snapshot = session.totalsSnapshot as Partial<CashRegisterClosureSummary>;
      if (snapshot.payments && snapshot.payments.length > 0) {
        return {
          sessionId: snapshot.sessionId ?? session.id,
          cashRegister: snapshot.cashRegister ?? session.cashRegister,
          openedByAdminId: snapshot.openedByAdminId ?? session.adminUserId,
          openingAmount: snapshot.openingAmount ?? session.openingAmount,
          openingAt: snapshot.openingAt ?? session.openingAt,
          closingByAdminId: snapshot.closingByAdminId ?? session.closingUserId ?? session.adminUserId,
          closingAmount: snapshot.closingAmount ?? (session.closingAmount ?? 0),
          closingAt: snapshot.closingAt ?? session.closingAt ?? new Date().toISOString(),
          closingNotes: snapshot.closingNotes ?? session.closingNotes ?? null,
          expectedTotalAmount: snapshot.expectedTotalAmount ?? 0,
          reportedTotalAmount: snapshot.reportedTotalAmount ?? 0,
          differenceTotalAmount: snapshot.differenceTotalAmount ?? 0,
          totalInvoices: snapshot.totalInvoices ?? 0,
          payments: snapshot.payments,
        } satisfies CashRegisterReport;
      }
    }

    if (env.useMockData && this.mockSessionInvoices && this.mockSessions) {
      const invoices = this.mockSessionInvoices.filter((item) => item.sessionId === session.id);
      const expectedMap = new Map<string, { amount: number; txCount: number }>();
      for (const invoice of invoices) {
        for (const payment of invoice.payments) {
          const key = payment.method.trim().toUpperCase();
          const prev = expectedMap.get(key) ?? { amount: 0, txCount: 0 };
          expectedMap.set(key, {
            amount: prev.amount + payment.amount,
            txCount: prev.txCount + 1,
          });
        }
      }
      const expectedPayments: ExpectedPayment[] = Array.from(expectedMap.entries()).map(
        ([method, data]) => ({
          method,
          amount: Number(data.amount.toFixed(2)),
          txCount: data.txCount,
        })
      );

      return buildClosureSummary({
        session,
        closingUserId: session.closingUserId ?? session.adminUserId,
        closingAmount: session.closingAmount ?? 0,
        closingAt: session.closingAt ? new Date(session.closingAt) : new Date(),
        closingNotes: session.closingNotes ?? null,
        expectedPayments,
        reportedPayments: expectedPayments.map((item) => ({
          method: item.method,
          reportedAmount: item.amount,
          txCount: item.txCount,
        })),
        totalInvoices: invoices.length,
      });
    }

    if (env.useMockData) {
      return null;
    }

    const result = await this.repository.getCashRegisterClosureReport(sessionId);
    if (!result) {
      return null;
    }

    const summary = buildClosureSummary({
      session: result.session,
      closingUserId: result.session.closingUserId ?? result.session.adminUserId,
      closingAmount: result.session.closingAmount ?? 0,
      closingAt: result.session.closingAt ? new Date(result.session.closingAt) : new Date(),
      closingNotes: result.session.closingNotes ?? null,
      expectedPayments: result.payments,
      reportedPayments: result.payments.map((payment) => ({
        method: payment.method,
        reportedAmount: payment.amount,
        txCount: payment.txCount,
      })),
      totalInvoices: result.totalInvoices,
    });

    return summary;
  }

  registerInvoiceForSession(params: {
    sessionId: number;
    invoiceId: number;
    totalAmount: number;
    payments: Array<{ method: string; amount: number }>;
  }): void {
    if (!env.useMockData || !this.mockSessionInvoices) {
      return;
    }
    this.mockSessionInvoices.push({
      sessionId: params.sessionId,
      invoiceId: params.invoiceId,
      totalAmount: params.totalAmount,
      payments: params.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
      })),
    });
  }
}

export const cashRegisterService = new CashRegisterService();

export type {
  CashRegisterAssignment,
  CashRegisterClosureSummary,
  CashRegisterReport,
  CashRegisterSessionRecord,
};
