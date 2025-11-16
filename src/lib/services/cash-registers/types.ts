export type CashRegisterAssignment = {
  cashRegisterId: number;
  cashRegisterCode: string;
  cashRegisterName: string;
  allowManualWarehouseOverride: boolean;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  isDefault: boolean;
};

export type CashRegisterRecord = {
  id: number;
  code: string;
  name: string;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  allowManualWarehouseOverride: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type CashRegisterSessionRecord = {
  id: number;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  adminUserId: number;
  openingAmount: number;
  openingAt: string;
  openingNotes: string | null;
  closingAmount: number | null;
  closingAt: string | null;
  closingNotes: string | null;
  cashRegister: CashRegisterAssignment;
  closingUserId: number | null;
  totalsSnapshot: unknown;
};

export type CashRegisterPaymentBreakdown = {
  method: string;
  expectedAmount: number;
  reportedAmount: number;
  differenceAmount: number;
  transactionCount: number;
};

export type CashRegisterClosureSummary = {
  sessionId: number;
  cashRegister: CashRegisterAssignment;
  openedByAdminId: number;
  openingAmount: number;
  openingAt: string;
  closingByAdminId: number;
  closingAmount: number;
  closingAt: string;
  closingNotes: string | null;
  expectedTotalAmount: number;
  reportedTotalAmount: number;
  differenceTotalAmount: number;
  totalInvoices: number;
  payments: CashRegisterPaymentBreakdown[];
};

export type CashRegisterReport = CashRegisterClosureSummary & {
  issuerName?: string | null;
};

export type CashRegisterAssignmentGroup = {
  adminUserId: number;
  assignments: CashRegisterAssignment[];
  defaultCashRegisterId: number | null;
};

export interface CreateCashRegisterInput {
  code: string;
  name: string;
  warehouseCode: string;
  allowManualWarehouseOverride?: boolean;
  notes?: string | null;
}

export interface UpdateCashRegisterInput {
  name?: string;
  warehouseCode?: string;
  allowManualWarehouseOverride?: boolean;
  isActive?: boolean;
  notes?: string | null;
}

export interface OpenCashRegisterSessionInput {
  adminUserId: number;
  cashRegisterCode: string;
  openingAmount: number;
  openingNotes?: string | null;
}

export interface CloseCashRegisterSessionInput {
  adminUserId: number;
  sessionId?: number;
  closingAmount: number;
  payments: Array<{ method: string; reportedAmount: number; transactionCount?: number }>;
  closingNotes?: string | null;
}

export type ExpectedPayment = {
  method: string;
  amount: number;
  txCount: number;
};

export type ReportedPayment = {
  method: string;
  reportedAmount: number;
  txCount: number;
};
