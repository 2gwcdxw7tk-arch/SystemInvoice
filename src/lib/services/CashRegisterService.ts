import { env } from "@/lib/env";
import {
  CashRegisterAssignment,
  CashRegisterAssignmentGroup,
  CashRegisterClosureSummary,
  CashRegisterReport,
  CashRegisterRecord,
  CashRegisterSessionRecord,
  CloseCashRegisterSessionInput,
  CreateCashRegisterInput,
  ExpectedPayment,
  OpenCashRegisterSessionInput,
  ReportedPayment,
  AssignInvoiceSequenceInput,
  UpdateCashRegisterInput,
} from "@/lib/services/cash-registers/types";
import { buildClosureSummary } from "@/lib/services/cash-registers/summary";
import type { ICashRegisterRepository } from "@/lib/repositories/cash-registers/ICashRegisterRepository";
import { CashRegisterRepository } from "@/lib/repositories/cash-registers/CashRegisterRepository";
import { warehouseService } from "@/lib/services/WarehouseService";

const normalizeCode = (value: string) => value.trim().toUpperCase();

function cloneAssignment(assignment: CashRegisterAssignment): CashRegisterAssignment {
  return { ...assignment };
}

function cloneSession(session: CashRegisterSessionRecord): CashRegisterSessionRecord {
  return {
    ...session,
    idRaw: session.idRaw,
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
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
  invoiceSequenceDefinitionId: number | null;
  invoiceSequenceCode: string | null;
  invoiceSequenceName: string | null;
};

function cloneRegister(register: MockCashRegister): MockCashRegister {
  return {
    ...register,
    createdAt: register.createdAt,
    updatedAt: register.updatedAt,
    notes: register.notes,
    invoiceSequenceDefinitionId: register.invoiceSequenceDefinitionId,
    invoiceSequenceCode: register.invoiceSequenceCode,
    invoiceSequenceName: register.invoiceSequenceName,
  };
}

function mapRegisterToRecord(register: MockCashRegister): CashRegisterRecord {
  return {
    id: register.id,
    code: register.code,
    name: register.name,
    warehouseId: register.warehouseId,
    warehouseCode: register.warehouseCode,
    warehouseName: register.warehouseName,
    allowManualWarehouseOverride: register.allowManualWarehouseOverride,
    isActive: register.isActive,
    notes: register.notes,
    createdAt: register.createdAt,
    updatedAt: register.updatedAt,
    invoiceSequenceDefinitionId: register.invoiceSequenceDefinitionId,
    invoiceSequenceCode: register.invoiceSequenceCode,
    invoiceSequenceName: register.invoiceSequenceName,
  } satisfies CashRegisterRecord;
}

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
  private mockRegisterSeq: number;

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
          isActive: true,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: null,
          invoiceSequenceDefinitionId: null,
          invoiceSequenceCode: null,
          invoiceSequenceName: null,
        },
      ];
      this.mockAssignments = new Map();
      this.mockSessions = new Map();
      this.mockSessionInvoices = [];
      this.mockSessionSeq = 1;
      this.mockRegisterSeq = this.mockCashRegisters.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    } else {
      this.mockCashRegisters = [];
      this.mockAssignments = null;
      this.mockSessions = null;
      this.mockSessionInvoices = null;
      this.mockSessionSeq = 0;
      this.mockRegisterSeq = 0;
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

  async listCashRegisters(options: { includeInactive?: boolean } = {}): Promise<CashRegisterRecord[]> {
    if (env.useMockData) {
      const includeInactive = options.includeInactive ?? false;
      return this.mockCashRegisters
        .filter((register) => includeInactive || register.isActive)
        .map((register) => mapRegisterToRecord(cloneRegister(register)))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    return this.repository.listCashRegisters(options);
  }

  async createCashRegister(input: CreateCashRegisterInput): Promise<CashRegisterRecord> {
    if (!env.useMockData) {
      return this.repository.createCashRegister(input);
    }

    const normalizedCode = normalizeCode(input.code);
    if (this.mockCashRegisters.some((register) => register.code === normalizedCode)) {
      throw new Error("Ya existe una caja con ese código");
    }

    const normalizedWarehouseCode = normalizeCode(input.warehouseCode);
    const warehouse = await warehouseService.getWarehouseByCode(normalizedWarehouseCode);
    if (!warehouse || !warehouse.isActive) {
      throw new Error(`El almacén ${normalizedWarehouseCode} no existe o está inactivo (mock)`);
    }

    const nowIso = new Date().toISOString();
    const newRegister: MockCashRegister = {
      id: this.mockRegisterSeq++,
      code: normalizedCode,
      name: input.name.trim(),
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      allowManualWarehouseOverride: Boolean(input.allowManualWarehouseOverride),
      isActive: true,
      notes: input.notes?.trim() ? input.notes.trim().slice(0, 250) : null,
      createdAt: nowIso,
      updatedAt: nowIso,
      invoiceSequenceDefinitionId: null,
      invoiceSequenceCode: null,
      invoiceSequenceName: null,
    };
    this.mockCashRegisters.push(newRegister);
    return mapRegisterToRecord(cloneRegister(newRegister));
  }

  async updateCashRegister(code: string, input: UpdateCashRegisterInput): Promise<CashRegisterRecord> {
    if (!env.useMockData) {
      return this.repository.updateCashRegister(code, input);
    }

    const normalizedCode = normalizeCode(code);
    const target = this.mockCashRegisters.find((register) => register.code === normalizedCode);
    if (!target) {
      throw new Error("Caja no encontrada (mock)");
    }

    if (typeof input.name === "string") {
      target.name = input.name.trim();
    }

    if (typeof input.allowManualWarehouseOverride === "boolean") {
      target.allowManualWarehouseOverride = input.allowManualWarehouseOverride;
    }

    if (typeof input.isActive === "boolean") {
      target.isActive = input.isActive;
    }

    if (typeof input.notes !== "undefined") {
      target.notes = input.notes?.trim() ? input.notes.trim().slice(0, 250) : null;
    }

    if (typeof input.invoiceSequenceDefinitionId !== "undefined") {
      target.invoiceSequenceDefinitionId = input.invoiceSequenceDefinitionId ?? null;
      target.invoiceSequenceCode = null;
      target.invoiceSequenceName = null;
    }

    if (typeof input.warehouseCode === "string" && input.warehouseCode.trim().length > 0) {
      const normalizedWarehouseCode = normalizeCode(input.warehouseCode);
      const warehouse = await warehouseService.getWarehouseByCode(normalizedWarehouseCode);
      if (!warehouse || !warehouse.isActive) {
        throw new Error(`El almacén ${normalizedWarehouseCode} no existe o está inactivo (mock)`);
      }
      target.warehouseId = warehouse.id;
      target.warehouseCode = warehouse.code;
      target.warehouseName = warehouse.name;
    }

    target.updatedAt = new Date().toISOString();
    return mapRegisterToRecord(cloneRegister(target));
  }

  async setInvoiceSequenceForRegister(input: AssignInvoiceSequenceInput): Promise<CashRegisterRecord> {
    const normalizedCode = normalizeCode(input.cashRegisterCode);
    if (env.useMockData) {
      const target = this.mockCashRegisters.find((register) => register.code === normalizedCode);
      if (!target) {
        throw new Error("Caja no encontrada (mock)");
      }
      target.invoiceSequenceDefinitionId = input.sequenceDefinitionId ?? null;
      target.invoiceSequenceCode = null;
      target.invoiceSequenceName = null;
      target.updatedAt = new Date().toISOString();
      return mapRegisterToRecord(cloneRegister(target));
    }

    return this.repository.updateCashRegister(normalizedCode, {
      invoiceSequenceDefinitionId: input.sequenceDefinitionId ?? null,
    });
  }

  async getCashRegisterById(cashRegisterId: number): Promise<CashRegisterRecord | null> {
    if (env.useMockData) {
      const target = this.mockCashRegisters.find((register) => register.id === cashRegisterId);
      return target ? mapRegisterToRecord(cloneRegister(target)) : null;
    }
    return this.repository.getCashRegisterById(cashRegisterId);
  }

  async listCashRegisterAssignments(options: { adminUserIds?: number[] } = {}): Promise<CashRegisterAssignmentGroup[]> {
    if (!env.useMockData || !this.mockAssignments) {
      return this.repository.listCashRegisterAssignments(options);
    }
    const { adminUserIds } = options;
    const allowList = adminUserIds && adminUserIds.length > 0 ? new Set(adminUserIds.map((id) => Number(id))) : null;
    const result: CashRegisterAssignmentGroup[] = [];
    for (const [adminId, assignments] of this.mockAssignments.entries()) {
      if (allowList && !allowList.has(adminId)) {
        continue;
      }
      const cloned = assignments.map(cloneAssignment);
      const defaultAssignment = cloned.find((assignment) => assignment.isDefault) ?? null;
      result.push({
        adminUserId: adminId,
        assignments: cloned,
        defaultCashRegisterId: defaultAssignment ? defaultAssignment.cashRegisterId : null,
      });
    }
    result.sort((a, b) => a.adminUserId - b.adminUserId);
    return result;
  }

  async assignCashRegisterToAdmin(params: {
    adminUserId: number;
    cashRegisterCode: string;
    makeDefault?: boolean;
  }): Promise<void> {
    if (!env.useMockData || !this.mockAssignments) {
      await this.repository.assignCashRegisterToAdmin(params);
      return;
    }

    const normalizedCode = normalizeCode(params.cashRegisterCode);
    const register = this.mockCashRegisters.find((item) => item.code === normalizedCode && item.isActive);
    if (!register) {
      throw new Error(`La caja ${normalizedCode} no existe o está inactiva (mock)`);
    }

    const assignments = this.mockAssignments.get(params.adminUserId) ?? [];
    if (params.makeDefault) {
      for (const existing of assignments) {
        existing.isDefault = false;
      }
    }

    const existing = assignments.find((item) => item.cashRegisterId === register.id);
    if (existing) {
      existing.isDefault = Boolean(params.makeDefault);
    } else {
      assignments.push({
        cashRegisterId: register.id,
        cashRegisterCode: register.code,
        cashRegisterName: register.name,
        allowManualWarehouseOverride: register.allowManualWarehouseOverride,
        warehouseId: register.warehouseId,
        warehouseCode: register.warehouseCode,
        warehouseName: register.warehouseName,
        isDefault: Boolean(params.makeDefault),
      });
    }

    this.mockAssignments.set(params.adminUserId, assignments);
  }

  async unassignCashRegisterFromAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void> {
    if (!env.useMockData || !this.mockAssignments) {
      await this.repository.unassignCashRegisterFromAdmin(params);
      return;
    }

    const normalizedCode = normalizeCode(params.cashRegisterCode);
    const assignments = this.mockAssignments.get(params.adminUserId);
    if (!assignments) {
      return;
    }
    const filtered = assignments.filter((assignment) => assignment.cashRegisterCode !== normalizedCode);
    this.mockAssignments.set(params.adminUserId, filtered);
  }

  async setDefaultCashRegisterForAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void> {
    if (!env.useMockData || !this.mockAssignments) {
      await this.repository.setDefaultCashRegisterForAdmin(params);
      return;
    }

    const normalizedCode = normalizeCode(params.cashRegisterCode);
    const assignments = this.mockAssignments.get(params.adminUserId);
    if (!assignments || assignments.length === 0) {
      throw new Error("El usuario no tiene cajas asignadas (mock)");
    }

    let found = false;
    for (const assignment of assignments) {
      if (assignment.cashRegisterCode === normalizedCode) {
        assignment.isDefault = true;
        found = true;
      } else {
        assignment.isDefault = false;
      }
    }

    if (!found) {
      throw new Error("La caja no está asignada al usuario (mock)");
    }

    this.mockAssignments.set(params.adminUserId, assignments);
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

  async getCashRegisterSessionById(sessionId: number | string): Promise<CashRegisterSessionRecord | null> {
    if (env.useMockData && this.mockSessions) {
      const numericId = typeof sessionId === "string" ? Number(sessionId) : sessionId;
      if (!Number.isFinite(numericId)) {
        return null;
      }
      const session = this.mockSessions.get(numericId);
      return session ? cloneSession(session) : null;
    }
    return this.repository.getCashRegisterSessionById(sessionId);
  }

  async recordInvoiceSequenceUsage(sessionId: number, invoiceLabel: string): Promise<void> {
    if (!invoiceLabel || !invoiceLabel.trim()) {
      return;
    }

    if (env.useMockData && this.mockSessions) {
      const existing = this.mockSessions.get(sessionId);
      if (!existing) {
        return;
      }
      const trimmed = invoiceLabel.trim();
      const updated: CashRegisterSessionRecord = cloneSession({
        ...existing,
        invoiceSequenceStart: existing.invoiceSequenceStart ?? trimmed,
        invoiceSequenceEnd: trimmed,
      });
      this.mockSessions.set(sessionId, updated);
      return;
    }

    await this.repository.updateSessionInvoiceSequenceRange(sessionId, invoiceLabel);
  }

  async openCashRegisterSession(input: OpenCashRegisterSessionInput): Promise<CashRegisterSessionRecord> {
    const openingNotes = input.openingNotes?.trim()?.slice(0, 400) ?? null;
    if (!(input.openingAmount >= 0)) {
      throw new Error("El monto de apertura debe ser positivo o cero");
    }
    const allowUnassigned = input.allowUnassigned ?? false;
    const normalizedOpeningDenominations = Array.isArray(input.openingDenominations)
      ? input.openingDenominations.filter((d) => Number.isFinite(d.value) && d.value >= 0 && Number.isFinite(d.qty) && d.qty >= 0)
      : [];
    const requiresOpeningDenoms = input.openingAmount > 0;
    const hasOpeningDenoms = normalizedOpeningDenominations.length > 0;

    if (requiresOpeningDenoms && !hasOpeningDenoms) {
      throw new Error("Debes capturar denominaciones de apertura cuando el monto es mayor a cero");
    }

    if (hasOpeningDenoms) {
      const openingCurrencySet = new Set(normalizedOpeningDenominations.map((d) => d.currency.toUpperCase()));
      if (openingCurrencySet.size !== 1 || !openingCurrencySet.has(env.currency.local.code)) {
        throw new Error(`Las denominaciones de apertura deben ser en ${env.currency.local.code}`);
      }
      const openingSum = normalizedOpeningDenominations.reduce((acc, d) => acc + d.value * d.qty, 0);
      if (Math.abs(Number(openingSum.toFixed(2)) - Number(input.openingAmount.toFixed(2))) >= 0.005) {
        throw new Error("La suma de denominaciones no coincide con el monto de apertura");
      }
    }

    const payloadOpeningDenoms = hasOpeningDenoms ? normalizedOpeningDenominations : undefined;

    if (env.useMockData && this.mockSessions && this.mockAssignments) {
      const normalizedCode = input.cashRegisterCode.trim().toUpperCase();
      const assignments = this.ensureMockAssignments(input.adminUserId);
      let target = assignments.find((assignment) => assignment.cashRegisterCode === normalizedCode);
      if (!target && allowUnassigned) {
        const register = this.mockCashRegisters.find(
          (item) => item.code === normalizedCode && item.isActive
        );
        if (!register) {
          throw new Error(`La caja ${input.cashRegisterCode} no existe o está inactiva (mock)`);
        }
        target = {
          cashRegisterId: register.id,
          cashRegisterCode: register.code,
          cashRegisterName: register.name,
          allowManualWarehouseOverride: register.allowManualWarehouseOverride,
          warehouseId: register.warehouseId,
          warehouseCode: register.warehouseCode,
          warehouseName: register.warehouseName,
          isDefault: false,
        } satisfies CashRegisterAssignment;
      }
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
        idRaw: String(id),
        status: "OPEN",
        adminUserId: input.adminUserId,
        openingAmount: Number(input.openingAmount.toFixed(2)),
        openingAt: nowIso,
        openingNotes,
        openingDenominations: payloadOpeningDenoms ?? null,
        closingAmount: null,
        closingAt: null,
        closingNotes: null,
        cashRegister: cloneAssignment(target),
        closingUserId: null,
        totalsSnapshot: null,
        invoiceSequenceStart: null,
        invoiceSequenceEnd: null,
      };
      this.mockSessions.set(id, newSession);
      return cloneSession(newSession);
    }

    return this.repository.openCashRegisterSession({
      adminUserId: input.adminUserId,
      cashRegisterCode: input.cashRegisterCode,
      openingAmount: input.openingAmount,
      openingNotes,
      allowUnassigned,
      actingAdminUserId: input.actingAdminUserId,
      openingDenominations: payloadOpeningDenoms,
    });
  }

  async closeCashRegisterSession(input: CloseCashRegisterSessionInput): Promise<CashRegisterClosureSummary> {
    const closingNotes = input.closingNotes?.trim()?.slice(0, 400) ?? null;
    const closingAmount = Number(input.closingAmount);
    if (!(closingAmount >= 0)) {
      throw new Error("El monto de cierre debe ser positivo o cero");
    }
    const allowDifferentUser = input.allowDifferentUser ?? false;
    const closingDenominations = Array.isArray(input.closingDenominations)
      ? input.closingDenominations.filter((d) => Number.isFinite(d.value) && d.value >= 0 && Number.isFinite(d.qty) && d.qty >= 0)
      : undefined;

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

    // Denominaciones: requeridas solo si hay efectivo reportado, y deben cuadrar con ese efectivo
    const cashReported = normalizedPayments
      .filter((p) => p.method === "CASH" || p.method === "EFECTIVO")
      .reduce((acc, p) => acc + p.reportedAmount, 0);
    if (cashReported > 0) {
      if (!closingDenominations || closingDenominations.length === 0) {
        throw new Error("Debes capturar denominaciones de cierre para efectivo");
      }
      const closingCurrencySet = new Set(closingDenominations.map((d) => d.currency.toUpperCase()));
      if (closingCurrencySet.size !== 1 || !closingCurrencySet.has(env.currency.local.code)) {
        throw new Error(`Las denominaciones de cierre deben ser en ${env.currency.local.code}`);
      }
      const closingSum = closingDenominations.reduce((acc, d) => acc + d.value * d.qty, 0);
      if (Math.abs(Number(closingSum.toFixed(2)) - Number(cashReported.toFixed(2))) >= 0.005) {
        throw new Error("Las denominaciones de cierre no cuadran con el efectivo reportado");
      }
    }

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
      if (session.adminUserId !== input.adminUserId && !allowDifferentUser) {
        throw new Error("Solo el usuario que abrió la caja puede cerrarla");
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
        closingDenominations: closingDenominations ?? null,
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
      allowDifferentUser,
      closingDenominations,
    });
  }

  async getCashRegisterClosureReport(sessionId: number | string): Promise<CashRegisterReport | null> {
    const session = await this.getCashRegisterSessionById(sessionId);
    if (!session) {
      return null;
    }

    if (session.totalsSnapshot && typeof session.totalsSnapshot === "object") {
      const snapshot = session.totalsSnapshot as Partial<CashRegisterClosureSummary>;
      if (snapshot.payments && snapshot.payments.length > 0) {
        const base: CashRegisterReport = {
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
          openingDenominations: session.openingDenominations ?? null,
          closingDenominations: session.closingDenominations ?? null,
        } satisfies CashRegisterReport;
        return base;
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

      const built = buildClosureSummary({
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
      return {
        ...built,
        openingDenominations: session.openingDenominations ?? null,
        closingDenominations: session.closingDenominations ?? null,
      };
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
    return {
      ...summary,
      openingDenominations: result.session.openingDenominations ?? null,
      closingDenominations: result.session.closingDenominations ?? null,
    };
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

  async listActiveCashRegisterSessions(): Promise<CashRegisterSessionRecord[]> {
    if (env.useMockData && this.mockSessions) {
      const sessions = Array.from(this.mockSessions.values()).filter((session) => session.status === "OPEN");
      sessions.sort((a, b) => new Date(a.openingAt).getTime() - new Date(b.openingAt).getTime());
      return sessions.map((session) => cloneSession(session));
    }

    return this.repository.listActiveCashRegisterSessions();
  }
}

export const cashRegisterService = new CashRegisterService();

export type {
  CashRegisterAssignment,
  CashRegisterClosureSummary,
  CashRegisterReport,
  CashRegisterSessionRecord,
};
