import {
  CashRegisterAssignment,
  CashRegisterClosureSummary,
  CashRegisterSessionRecord,
  ExpectedPayment,
  ReportedPayment,
} from "@/lib/services/cash-registers/types";

export interface ICashRegisterRepository {
  listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]>;
  getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null>;
  getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null>;
  openCashRegisterSession(params: {
    adminUserId: number;
    cashRegisterCode: string;
    openingAmount: number;
    openingNotes: string | null;
  }): Promise<CashRegisterSessionRecord>;
  closeCashRegisterSession(params: {
    adminUserId: number;
    sessionId?: number | null;
    closingAmount: number;
    payments: ReportedPayment[];
    closingNotes: string | null;
  }): Promise<CashRegisterClosureSummary>;
  getCashRegisterClosureReport(sessionId: number): Promise<{
    session: CashRegisterSessionRecord;
    payments: ExpectedPayment[];
    totalInvoices: number;
  } | null>;
}
