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

export interface ICashRegisterRepository {
  listCashRegisters(options?: { includeInactive?: boolean }): Promise<CashRegisterRecord[]>;
  createCashRegister(input: CreateCashRegisterInput): Promise<CashRegisterRecord>;
  updateCashRegister(cashRegisterCode: string, input: UpdateCashRegisterInput): Promise<CashRegisterRecord>;
  listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]>;
  listCashRegisterAssignments(options?: { adminUserIds?: number[] }): Promise<CashRegisterAssignmentGroup[]>;
  assignCashRegisterToAdmin(params: {
    adminUserId: number;
    cashRegisterCode: string;
    makeDefault?: boolean;
  }): Promise<void>;
  unassignCashRegisterFromAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void>;
  setDefaultCashRegisterForAdmin(params: { adminUserId: number; cashRegisterCode: string }): Promise<void>;
  getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null>;
  listCashRegisterSessionsForAdmin(adminUserId: number, options?: { limit?: number }): Promise<CashRegisterSessionRecord[]>;
  getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null>;
  openCashRegisterSession(params: {
    adminUserId: number;
    cashRegisterCode: string;
    openingAmount: number;
    openingNotes: string | null;
    allowUnassigned?: boolean;
    actingAdminUserId?: number;
  }): Promise<CashRegisterSessionRecord>;
  closeCashRegisterSession(params: {
    adminUserId: number;
    sessionId?: number | null;
    closingAmount: number;
    payments: ReportedPayment[];
    closingNotes: string | null;
    allowDifferentUser?: boolean;
  }): Promise<CashRegisterClosureSummary>;
  listActiveCashRegisterSessions(): Promise<CashRegisterSessionRecord[]>;
  getCashRegisterClosureReport(sessionId: number): Promise<{
    session: CashRegisterSessionRecord;
    payments: ExpectedPayment[];
    totalInvoices: number;
  } | null>;
}
