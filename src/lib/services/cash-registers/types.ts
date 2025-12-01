export type CashRegisterAssignment = {
  cashRegisterId: number;
  cashRegisterCode: string;
  cashRegisterName: string;
  allowManualWarehouseOverride: boolean;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  isDefault: boolean;
  defaultCustomer: CashRegisterDefaultCustomer | null;
};

export type CashRegisterDefaultCustomer = {
  id: number;
  code: string;
  name: string;
  paymentTermCode: string | null;
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
  invoiceSequenceDefinitionId: number | null;
  invoiceSequenceCode: string | null;
  invoiceSequenceName: string | null;
  defaultCustomer: CashRegisterDefaultCustomer | null;
};

export type CashRegisterSessionRecord = {
  id: number;
  /** Identificador original en texto para preservar precisión cuando proviene de columnas BigInt. */
  idRaw?: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  adminUserId: number;
  openingAmount: number;
  openingAt: string;
  openingNotes: string | null;
  openingDenominations?: CashDenominationLine[] | null;
  closingAmount: number | null;
  closingAt: string | null;
  closingNotes: string | null;
  closingDenominations?: CashDenominationLine[] | null;
  cashRegister: CashRegisterAssignment;
  closingUserId: number | null;
  totalsSnapshot: unknown;
  invoiceSequenceStart?: string | null;
  invoiceSequenceEnd?: string | null;
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
  sessionIdRaw?: string;
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
  openingDenominations?: CashDenominationLine[] | null;
  closingDenominations?: CashDenominationLine[] | null;
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
  defaultCustomerCode?: string | null;
}

export interface UpdateCashRegisterInput {
  name?: string;
  warehouseCode?: string;
  allowManualWarehouseOverride?: boolean;
  isActive?: boolean;
  notes?: string | null;
  invoiceSequenceDefinitionId?: number | null;
  defaultCustomerCode?: string | null;
}

export interface AssignInvoiceSequenceInput {
  cashRegisterCode: string;
  sequenceDefinitionId: number | null;
}

export interface OpenCashRegisterSessionInput {
  adminUserId: number;
  cashRegisterCode: string;
  openingAmount: number;
  openingNotes?: string | null;
  actingAdminUserId?: number;
  allowUnassigned?: boolean;
  openingDenominations?: CashDenominationLine[];
}

export interface CloseCashRegisterSessionInput {
  adminUserId: number;
  sessionId?: number;
  closingAmount: number;
  payments: Array<{ method: string; reportedAmount: number; transactionCount?: number }>;
  closingNotes?: string | null;
  allowDifferentUser?: boolean;
  closingDenominations?: CashDenominationLine[];
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

export type DenominationKind = "COIN" | "BILL" | "OTHER";
export type CashDenominationLine = {
  currency: string; // ISO 4217 code (e.g., NIO, USD)
  value: number;    // Face value per unit
  qty: number;      // Quantity counted
  kind?: DenominationKind;
};
