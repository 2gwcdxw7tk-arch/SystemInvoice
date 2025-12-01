import "server-only";

import { env } from "@/lib/env";
import { query, withTransaction } from "@/lib/db/postgres";

type PgDatabaseError = Error & { code?: string; message?: string };

function isMissingDefaultCustomerSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const { code, message } = error as PgDatabaseError;
  if (!code) {
    return false;
  }
  if (code === "42703" || code === "42P01") {
    const normalizedMessage = (message ?? "").toLowerCase();
    return (
      normalizedMessage.includes("default_customer") ||
      normalizedMessage.includes("payment_terms")
    );
  }
  return false;
}

export type CashRegisterDefaultCustomer = {
  id: number;
  code: string;
  name: string;
  paymentTermCode: string | null;
};

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

type RegisterRowWithDefault = {
  cash_register_id: number;
  cash_register_code: string;
  cash_register_name: string;
  allow_manual_warehouse_override: boolean;
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  is_default: boolean;
  default_customer_id: number | null;
  default_customer_code: string | null;
  default_customer_name: string | null;
  default_customer_payment_term_code: string | null;
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

const normalizeCode = (value: string) => value.trim().toUpperCase();
const roundCurrency = (value: number) => Number(value.toFixed(2));

// -----------------------------
// MOCK DATA SUPPORT
// -----------------------------

type MockCashRegister = {
  id: number;
  code: string;
  name: string;
  allowManualWarehouseOverride: boolean;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  defaultCustomer: CashRegisterDefaultCustomer | null;
};

type MockSession = CashRegisterSessionRecord;

type MockSessionInvoice = {
  sessionId: number;
  invoiceId: number;
  totalAmount: number;
  payments: Array<{ method: string; amount: number }>;
};

const mockCashRegisters: MockCashRegister[] = env.useMockData
  ? [
      {
        id: 1,
        code: "CAJA-01",
        name: "Caja principal",
        allowManualWarehouseOverride: false,
        warehouseId: 1,
        warehouseCode: "PRINCIPAL",
        warehouseName: "Almacen principal",
        defaultCustomer: null,
      },
    ]
  : [];

const mockAssignments = env.useMockData ? new Map<number, CashRegisterAssignment[]>() : null;
const mockSessions = env.useMockData ? new Map<number, MockSession>() : null;
const mockSessionInvoices = env.useMockData ? ([] as MockSessionInvoice[]) : null;
let mockSessionSeq = env.useMockData ? 1 : 0;

function ensureMockAssignments(adminUserId: number): CashRegisterAssignment[] {
  if (!env.useMockData || !mockAssignments) {
    return [];
  }
  const existing = mockAssignments.get(adminUserId);
  if (existing) {
    return existing;
  }
  const assignments: CashRegisterAssignment[] = mockCashRegisters.map((register, index) => ({
    cashRegisterId: register.id,
    cashRegisterCode: register.code,
    cashRegisterName: register.name,
    allowManualWarehouseOverride: register.allowManualWarehouseOverride,
    warehouseId: register.warehouseId,
    warehouseCode: register.warehouseCode,
    warehouseName: register.warehouseName,
    isDefault: index === 0,
    defaultCustomer: register.defaultCustomer,
  }));
  mockAssignments.set(adminUserId, assignments);
  return assignments;
}

function cloneSessionRecord(session: MockSession): CashRegisterSessionRecord {
  return {
    ...session,
    cashRegister: { ...session.cashRegister },
  };
}

export function registerMockInvoiceForSession(params: {
  sessionId: number;
  invoiceId: number;
  totalAmount: number;
  payments: Array<{ method: string; amount: number }>;
}): void {
  if (!env.useMockData || !mockSessionInvoices) {
    return;
  }
  mockSessionInvoices.push({
    sessionId: params.sessionId,
    invoiceId: params.invoiceId,
    totalAmount: params.totalAmount,
    payments: params.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
  });
}

// -----------------------------
// PUBLIC API
// -----------------------------

export async function listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]> {
  if (env.useMockData) {
    return ensureMockAssignments(adminUserId);
  }
  const mapAssignment = (row: {
    cash_register_id: number;
    cash_register_code: string;
    cash_register_name: string;
    allow_manual_warehouse_override: boolean;
    warehouse_id: number;
    warehouse_code: string;
    warehouse_name: string;
    is_default: boolean;
    default_customer_id: number | null;
    default_customer_code: string | null;
    default_customer_name: string | null;
    default_customer_payment_term_code: string | null;
  }): CashRegisterAssignment => ({
    cashRegisterId: Number(row.cash_register_id),
    cashRegisterCode: row.cash_register_code,
    cashRegisterName: row.cash_register_name,
    allowManualWarehouseOverride: !!row.allow_manual_warehouse_override,
    warehouseId: Number(row.warehouse_id),
    warehouseCode: row.warehouse_code,
    warehouseName: row.warehouse_name,
    isDefault: !!row.is_default,
    defaultCustomer:
      row.default_customer_id != null
        ? {
            id: Number(row.default_customer_id),
            code: row.default_customer_code ?? "",
            name: row.default_customer_name ?? "",
            paymentTermCode: row.default_customer_payment_term_code ?? null,
          }
        : null,
  });

  try {
    const result = await query<{
      cash_register_id: number;
      cash_register_code: string;
      cash_register_name: string;
      allow_manual_warehouse_override: boolean;
      warehouse_id: number;
      warehouse_code: string;
      warehouse_name: string;
      is_default: boolean;
      default_customer_id: number | null;
      default_customer_code: string | null;
      default_customer_name: string | null;
      default_customer_payment_term_code: string | null;
    }>(
      `SELECT
         cru.cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         cr.warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default,
         cr.default_customer_id,
         dc.code AS default_customer_code,
         dc.name AS default_customer_name,
         dpt.code AS default_customer_payment_term_code
       FROM app.cash_register_users cru
       INNER JOIN app.cash_registers cr ON cr.id = cru.cash_register_id AND cr.is_active = TRUE
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id AND w.is_active = TRUE
       LEFT JOIN app.customers dc ON dc.id = cr.default_customer_id
       LEFT JOIN app.payment_terms dpt ON dpt.id = dc.payment_term_id
       WHERE cru.admin_user_id = $1
       ORDER BY cru.is_default DESC, cr.code ASC`,
      [adminUserId]
    );

    return result.rows.map(mapAssignment);
  } catch (error) {
    if (!isMissingDefaultCustomerSchema(error)) {
      throw error;
    }

    const fallback = await query<{
      cash_register_id: number;
      cash_register_code: string;
      cash_register_name: string;
      allow_manual_warehouse_override: boolean;
      warehouse_id: number;
      warehouse_code: string;
      warehouse_name: string;
      is_default: boolean;
    }>(
      `SELECT
         cru.cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         cr.warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default
       FROM app.cash_register_users cru
       INNER JOIN app.cash_registers cr ON cr.id = cru.cash_register_id AND cr.is_active = TRUE
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id AND w.is_active = TRUE
       WHERE cru.admin_user_id = $1
       ORDER BY cru.is_default DESC, cr.code ASC`,
      [adminUserId]
    );

    return fallback.rows.map((row) =>
      mapAssignment({
        ...row,
        default_customer_id: null,
        default_customer_code: null,
        default_customer_name: null,
        default_customer_payment_term_code: null,
      })
    );
  }
}

type SessionDbRow = {
  id: number;
  status: string;
  admin_user_id: number;
  opening_amount: string | number;
  opening_at: Date;
  opening_notes: string | null;
  closing_amount: string | number | null;
  closing_at: Date | null;
  closing_notes: string | null;
  closing_user_id: number | null;
  totals_snapshot: unknown;
  cash_register_id: number;
  cash_register_code: string;
  cash_register_name: string;
  allow_manual_warehouse_override: boolean;
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  is_default: boolean | null;
  default_customer_id: number | null;
  default_customer_code: string | null;
  default_customer_name: string | null;
  default_customer_payment_term_code: string | null;
};

function mapSessionRow(row: SessionDbRow): CashRegisterSessionRecord {
  return {
    id: Number(row.id),
    status: row.status as CashRegisterSessionRecord["status"],
    adminUserId: Number(row.admin_user_id),
    openingAmount: Number(row.opening_amount),
    openingAt: new Date(row.opening_at).toISOString(),
    openingNotes: row.opening_notes,
    closingAmount: row.closing_amount != null ? Number(row.closing_amount) : null,
    closingAt: row.closing_at ? new Date(row.closing_at).toISOString() : null,
    closingNotes: row.closing_notes,
    closingUserId: row.closing_user_id != null ? Number(row.closing_user_id) : null,
    totalsSnapshot: row.totals_snapshot ?? null,
    cashRegister: {
      cashRegisterId: Number(row.cash_register_id),
      cashRegisterCode: row.cash_register_code,
      cashRegisterName: row.cash_register_name,
      allowManualWarehouseOverride: !!row.allow_manual_warehouse_override,
      warehouseId: Number(row.warehouse_id),
      warehouseCode: row.warehouse_code,
      warehouseName: row.warehouse_name,
      isDefault: !!row.is_default,
      defaultCustomer:
        row.default_customer_id != null
          ? {
              id: Number(row.default_customer_id),
              code: row.default_customer_code ?? "",
              name: row.default_customer_name ?? "",
              paymentTermCode: row.default_customer_payment_term_code ?? null,
            }
          : null,
    },
  };
}

async function fetchSessionByAdminFromDb(adminUserId: number): Promise<CashRegisterSessionRecord | null> {
  try {
    const result = await query<SessionDbRow>(
      `SELECT
         s.id,
         s.status,
         s.admin_user_id,
         s.opening_amount,
         s.opening_at,
         s.opening_notes,
         s.closing_amount,
         s.closing_at,
         s.closing_notes,
         s.closing_user_id,
         s.totals_snapshot,
         cr.id AS cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         w.id AS warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default,
         cr.default_customer_id,
         dc.code AS default_customer_code,
         dc.name AS default_customer_name,
         dpt.code AS default_customer_payment_term_code
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       LEFT JOIN app.customers dc ON dc.id = cr.default_customer_id
       LEFT JOIN app.payment_terms dpt ON dpt.id = dc.payment_term_id
       WHERE s.admin_user_id = $1 AND s.status = 'OPEN'
       ORDER BY s.opening_at DESC
       LIMIT 1`,
      [adminUserId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return mapSessionRow(row);
  } catch (error) {
    if (!isMissingDefaultCustomerSchema(error)) {
      throw error;
    }

    const fallback = await query<Omit<SessionDbRow, "default_customer_id" | "default_customer_code" | "default_customer_name" | "default_customer_payment_term_code">>(
      `SELECT
         s.id,
         s.status,
         s.admin_user_id,
         s.opening_amount,
         s.opening_at,
         s.opening_notes,
         s.closing_amount,
         s.closing_at,
         s.closing_notes,
         s.closing_user_id,
         s.totals_snapshot,
         cr.id AS cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         w.id AS warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       WHERE s.admin_user_id = $1 AND s.status = 'OPEN'
       ORDER BY s.opening_at DESC
       LIMIT 1`,
      [adminUserId]
    );

    const row = fallback.rows[0];
    if (!row) {
      return null;
    }
    return mapSessionRow({
      ...row,
      default_customer_id: null,
      default_customer_code: null,
      default_customer_name: null,
      default_customer_payment_term_code: null,
    } as SessionDbRow);
  }
}

export async function getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null> {
  if (env.useMockData && mockSessions) {
    for (const session of mockSessions.values()) {
      if (session.adminUserId === adminUserId && session.status === "OPEN") {
        return cloneSessionRecord(session);
      }
    }
    return null;
  }

  return fetchSessionByAdminFromDb(adminUserId);
}

export async function getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null> {
  if (env.useMockData && mockSessions) {
    const session = mockSessions.get(sessionId);
    return session ? cloneSessionRecord(session) : null;
  }
  try {
    const result = await query<SessionDbRow>(
      `SELECT
         s.id,
         s.status,
         s.admin_user_id,
         s.opening_amount,
         s.opening_at,
         s.opening_notes,
         s.closing_amount,
         s.closing_at,
         s.closing_notes,
         s.closing_user_id,
         s.totals_snapshot,
         cr.id AS cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         w.id AS warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default,
         cr.default_customer_id,
         dc.code AS default_customer_code,
         dc.name AS default_customer_name,
         dpt.code AS default_customer_payment_term_code
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       LEFT JOIN app.customers dc ON dc.id = cr.default_customer_id
       LEFT JOIN app.payment_terms dpt ON dpt.id = dc.payment_term_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );

    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  } catch (error) {
    if (!isMissingDefaultCustomerSchema(error)) {
      throw error;
    }

    const fallback = await query<Omit<SessionDbRow, "default_customer_id" | "default_customer_code" | "default_customer_name" | "default_customer_payment_term_code">>(
      `SELECT
         s.id,
         s.status,
         s.admin_user_id,
         s.opening_amount,
         s.opening_at,
         s.opening_notes,
         s.closing_amount,
         s.closing_at,
         s.closing_notes,
         s.closing_user_id,
         s.totals_snapshot,
         cr.id AS cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         w.id AS warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );

    const row = fallback.rows[0];
    if (!row) {
      return null;
    }
    return mapSessionRow({
      ...row,
      default_customer_id: null,
      default_customer_code: null,
      default_customer_name: null,
      default_customer_payment_term_code: null,
    } as SessionDbRow);
  }
}

function buildSummary(params: {
  session: CashRegisterSessionRecord;
  closingUserId: number;
  closingAmount: number;
  closingAt: Date;
  closingNotes: string | null;
  expectedPayments: Array<{ method: string; amount: number; txCount: number }>;
  reportedPayments: Array<{ method: string; reportedAmount: number; txCount: number }>;
  totalInvoices: number;
}): CashRegisterClosureSummary {
  const expectedMap = new Map<string, { amount: number; txCount: number }>();
  for (const payment of params.expectedPayments) {
    const key = payment.method.toUpperCase();
    expectedMap.set(key, {
      amount: roundCurrency(payment.amount),
      txCount: payment.txCount,
    });
  }

  const reportedMap = new Map<string, { amount: number; txCount: number }>();
  for (const payment of params.reportedPayments) {
    const key = payment.method.toUpperCase();
    const base = reportedMap.get(key) ?? { amount: 0, txCount: 0 };
    reportedMap.set(key, {
      amount: roundCurrency(base.amount + payment.reportedAmount),
      txCount: base.txCount + payment.txCount,
    });
  }

  const breakdown: CashRegisterPaymentBreakdown[] = [];
  const allKeys = new Set<string>([...expectedMap.keys(), ...reportedMap.keys()]);
  for (const key of allKeys) {
    const expected = expectedMap.get(key) ?? { amount: 0, txCount: 0 };
    const reported = reportedMap.get(key) ?? { amount: 0, txCount: 0 };
    const difference = roundCurrency(reported.amount - expected.amount);
    breakdown.push({
      method: key,
      expectedAmount: expected.amount,
      reportedAmount: reported.amount,
      differenceAmount: difference,
      transactionCount: Math.max(expected.txCount, reported.txCount),
    });
  }

  breakdown.sort((a, b) => a.method.localeCompare(b.method));

  const expectedTotal = breakdown.reduce((acc, cur) => acc + cur.expectedAmount, 0);
  const reportedTotal = breakdown.reduce((acc, cur) => acc + cur.reportedAmount, 0);

  return {
    sessionId: params.session.id,
    cashRegister: params.session.cashRegister,
    openedByAdminId: params.session.adminUserId,
    openingAmount: params.session.openingAmount,
    openingAt: params.session.openingAt,
    closingByAdminId: params.closingUserId,
    closingAmount: roundCurrency(params.closingAmount),
    closingAt: params.closingAt.toISOString(),
    closingNotes: params.closingNotes,
    expectedTotalAmount: roundCurrency(expectedTotal),
    reportedTotalAmount: roundCurrency(reportedTotal),
    differenceTotalAmount: roundCurrency(reportedTotal - expectedTotal),
    totalInvoices: params.totalInvoices,
    payments: breakdown,
  };
}

export async function openCashRegisterSession(input: OpenCashRegisterSessionInput): Promise<CashRegisterSessionRecord> {
  const { adminUserId, openingAmount } = input;
  const openingNotes = input.openingNotes?.trim()?.slice(0, 400) ?? null;
  const cashRegisterCode = normalizeCode(input.cashRegisterCode);
  if (!(openingAmount >= 0)) {
    throw new Error("El monto de apertura debe ser positivo o cero");
  }

  if (env.useMockData && mockSessions) {
    const assignments = ensureMockAssignments(adminUserId);
    const target = assignments.find((assignment) => assignment.cashRegisterCode === cashRegisterCode);
    if (!target) {
      throw new Error(`No tienes permisos para operar la caja ${cashRegisterCode}`);
    }
    const hasOpen = [...mockSessions.values()].some(
      (session) => session.status === "OPEN" && (session.adminUserId === adminUserId || session.cashRegister.cashRegisterId === target.cashRegisterId)
    );
    if (hasOpen) {
      throw new Error("Ya existe una apertura activa para el usuario o la caja seleccionada");
    }
    const id = mockSessionSeq++;
    const nowIso = new Date().toISOString();
    const newSession: MockSession = {
      id,
      status: "OPEN",
      adminUserId,
      openingAmount: Number(openingAmount.toFixed(2)),
      openingAt: nowIso,
      openingNotes,
      closingAmount: null,
      closingAt: null,
      closingNotes: null,
      cashRegister: { ...target },
      closingUserId: null,
      totalsSnapshot: null,
    };
    mockSessions.set(id, newSession);
    return cloneSessionRecord(newSession);
  }

  return withTransaction(async (client) => {
    const fetchRegister = async (): Promise<RegisterRowWithDefault | null> => {
      try {
        const result = await client.query<RegisterRowWithDefault>(
          `SELECT
             cru.cash_register_id,
             cr.code AS cash_register_code,
             cr.name AS cash_register_name,
             cr.allow_manual_warehouse_override,
             cr.warehouse_id,
             w.code AS warehouse_code,
             w.name AS warehouse_name,
             cru.is_default,
             cr.default_customer_id,
             dc.code AS default_customer_code,
             dc.name AS default_customer_name,
             dpt.code AS default_customer_payment_term_code
           FROM app.cash_register_users cru
           INNER JOIN app.cash_registers cr ON cr.id = cru.cash_register_id AND cr.is_active = TRUE
           INNER JOIN app.warehouses w ON w.id = cr.warehouse_id AND w.is_active = TRUE
           LEFT JOIN app.customers dc ON dc.id = cr.default_customer_id
           LEFT JOIN app.payment_terms dpt ON dpt.id = dc.payment_term_id
           WHERE cru.admin_user_id = $1 AND UPPER(cr.code) = $2
           LIMIT 1`,
          [adminUserId, cashRegisterCode]
        );

        return result.rows[0] ?? null;
      } catch (error) {
        if (!isMissingDefaultCustomerSchema(error)) {
          throw error;
        }

        const fallback = await client.query<Omit<RegisterRowWithDefault, "default_customer_id" | "default_customer_code" | "default_customer_name" | "default_customer_payment_term_code">>(
          `SELECT
             cru.cash_register_id,
             cr.code AS cash_register_code,
             cr.name AS cash_register_name,
             cr.allow_manual_warehouse_override,
             cr.warehouse_id,
             w.code AS warehouse_code,
             w.name AS warehouse_name,
             cru.is_default
           FROM app.cash_register_users cru
           INNER JOIN app.cash_registers cr ON cr.id = cru.cash_register_id AND cr.is_active = TRUE
           INNER JOIN app.warehouses w ON w.id = cr.warehouse_id AND w.is_active = TRUE
           WHERE cru.admin_user_id = $1 AND UPPER(cr.code) = $2
           LIMIT 1`,
          [adminUserId, cashRegisterCode]
        );

        const row = fallback.rows[0];
        if (!row) {
          return null;
        }
        return {
          ...row,
          default_customer_id: null,
          default_customer_code: null,
          default_customer_name: null,
          default_customer_payment_term_code: null,
        } satisfies RegisterRowWithDefault;
      }
    };

    const registerRow = await fetchRegister();
    if (!registerRow) {
      throw new Error(`No tienes permisos para operar la caja ${cashRegisterCode}`);
    }

    const openForUser = await client.query("SELECT 1 FROM app.cash_register_sessions WHERE admin_user_id = $1 AND status = 'OPEN' LIMIT 1", [adminUserId]);
    if (openForUser.rowCount && openForUser.rowCount > 0) {
      throw new Error("Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.");
    }

    const openForRegister = await client.query("SELECT 1 FROM app.cash_register_sessions WHERE cash_register_id = $1 AND status = 'OPEN' LIMIT 1", [registerRow.cash_register_id]);
    if (openForRegister.rowCount && openForRegister.rowCount > 0) {
      throw new Error("La caja seleccionada ya cuenta con una apertura activa.");
    }

    const insertResult = await client.query(
      `INSERT INTO app.cash_register_sessions (
         cash_register_id,
         admin_user_id,
         opening_amount,
         opening_notes
       ) VALUES ($1, $2, $3, $4)
       RETURNING id, status, opening_amount, opening_at, opening_notes, closing_amount, closing_at, closing_notes, closing_user_id, totals_snapshot` ,
      [registerRow.cash_register_id, adminUserId, openingAmount, openingNotes]
    );

    const sessionRow = insertResult.rows[0];
    return mapSessionRow({
      id: Number(sessionRow.id),
      status: String(sessionRow.status),
      admin_user_id: adminUserId,
      opening_amount: Number(sessionRow.opening_amount ?? 0),
      opening_at: sessionRow.opening_at,
      opening_notes: sessionRow.opening_notes ?? null,
      closing_amount: sessionRow.closing_amount ?? null,
      closing_at: sessionRow.closing_at ?? null,
      closing_notes: sessionRow.closing_notes ?? null,
      closing_user_id: sessionRow.closing_user_id ?? null,
      totals_snapshot: sessionRow.totals_snapshot ?? null,
      cash_register_id: registerRow.cash_register_id,
      cash_register_code: registerRow.cash_register_code,
      cash_register_name: registerRow.cash_register_name,
      allow_manual_warehouse_override: registerRow.allow_manual_warehouse_override,
      warehouse_id: registerRow.warehouse_id,
      warehouse_code: registerRow.warehouse_code,
      warehouse_name: registerRow.warehouse_name,
      is_default: registerRow.is_default,
      default_customer_id: registerRow.default_customer_id,
      default_customer_code: registerRow.default_customer_code,
      default_customer_name: registerRow.default_customer_name,
      default_customer_payment_term_code: registerRow.default_customer_payment_term_code,
    });
  });
}

export async function closeCashRegisterSession(input: CloseCashRegisterSessionInput): Promise<CashRegisterClosureSummary> {
  const closingAmount = Number(input.closingAmount);
  if (!(closingAmount >= 0)) {
    throw new Error("El monto de cierre debe ser positivo o cero");
  }
  const normalizedPayments = input.payments.map((payment) => ({
    method: payment.method.trim().toUpperCase(),
    reportedAmount: Number(payment.reportedAmount || 0),
    txCount: payment.transactionCount != null ? Math.max(0, payment.transactionCount) : 0,
  }));

  if (env.useMockData && mockSessions && mockSessionInvoices) {
    const session = (() => {
      if (input.sessionId != null) {
        return mockSessions.get(input.sessionId) ?? null;
      }
      for (const value of mockSessions.values()) {
        if (value.adminUserId === input.adminUserId && value.status === "OPEN") {
          return value;
        }
      }
      return null;
    })();
    if (!session) {
      throw new Error("No se encontró una apertura de caja activa");
    }
    if (session.status !== "OPEN") {
      throw new Error("La sesión indicada ya fue cerrada");
    }

    const invoices = mockSessionInvoices.filter((item) => item.sessionId === session.id);
    const expectedPayments = new Map<string, { amount: number; txCount: number }>();
    for (const invoice of invoices) {
      for (const payment of invoice.payments) {
        const key = payment.method.trim().toUpperCase();
        const prev = expectedPayments.get(key) ?? { amount: 0, txCount: 0 };
        expectedPayments.set(key, {
          amount: prev.amount + payment.amount,
          txCount: prev.txCount + 1,
        });
      }
    }

    const expectedList = Array.from(expectedPayments.entries()).map(([method, data]) => ({
      method,
      amount: Number(data.amount.toFixed(2)),
      txCount: data.txCount,
    }));

    const summary = buildSummary({
      session,
      closingUserId: input.adminUserId,
      closingAmount,
      closingAt: new Date(),
      closingNotes: input.closingNotes?.trim()?.slice(0, 400) ?? null,
      expectedPayments: expectedList,
      reportedPayments: normalizedPayments,
      totalInvoices: invoices.length,
    });

    const updatedSession: MockSession = {
      ...session,
      status: "CLOSED",
      closingAmount: summary.closingAmount,
      closingAt: summary.closingAt,
      closingNotes: summary.closingNotes,
      closingUserId: input.adminUserId,
      totalsSnapshot: summary,
    };
    mockSessions.set(session.id, updatedSession);
    return summary;
  }

  return withTransaction(async (client) => {
    const sessionRow = await client.query(
      `SELECT
         s.id,
         s.status,
         s.admin_user_id,
         s.opening_amount,
         s.opening_at,
         s.opening_notes,
         s.closing_amount,
         s.closing_at,
         s.closing_notes,
         s.closing_user_id,
         s.totals_snapshot,
         cr.id AS cash_register_id,
         cr.code AS cash_register_code,
         cr.name AS cash_register_name,
         cr.allow_manual_warehouse_override,
         w.id AS warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         cru.is_default
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       WHERE s.id = COALESCE($1, (
         SELECT id FROM app.cash_register_sessions WHERE admin_user_id = $2 AND status = 'OPEN' ORDER BY opening_at DESC LIMIT 1
       ))
       LIMIT 1`,
      [input.sessionId ?? null, input.adminUserId]
    );

    const row = sessionRow.rows[0];
    if (!row) {
      throw new Error("No se encontró una apertura de caja activa");
    }
    if (row.status !== "OPEN") {
      throw new Error("La sesión indicada ya fue cerrada");
    }
    if (Number(row.admin_user_id) !== input.adminUserId) {
      throw new Error("Solo el usuario que abrió la caja puede cerrarla");
    }

    const session = mapSessionRow(row);

    const expectedPaymentsResult = await client.query<{
      payment_method: string;
      tx_count: number;
      total_amount: number;
    }>(
      `WITH invoices AS (
         SELECT id
         FROM app.invoices
         WHERE cash_register_session_id = $1
       )
       SELECT
         p.payment_method,
         COUNT(*)::int AS tx_count,
         COALESCE(SUM(p.amount), 0) AS total_amount
       FROM app.invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       GROUP BY p.payment_method`,
      [session.id]
    );

    const expectedPayments = expectedPaymentsResult.rows.map((row) => ({
      method: row.payment_method.trim().toUpperCase(),
      amount: Number(row.total_amount ?? 0),
      txCount: Number(row.tx_count ?? 0),
    }));

    const invoiceCountResult = await client.query<{ total_invoices: number }>(
      `SELECT COUNT(*)::int AS total_invoices
       FROM app.invoices
       WHERE cash_register_session_id = $1`,
      [session.id]
    );

    const totalInvoices = invoiceCountResult.rows[0]?.total_invoices ?? 0;

    const summary = buildSummary({
      session,
      closingUserId: input.adminUserId,
      closingAmount,
      closingAt: new Date(),
      closingNotes: input.closingNotes?.trim()?.slice(0, 400) ?? null,
      expectedPayments,
      reportedPayments: normalizedPayments,
      totalInvoices,
    });

    await client.query(
      `UPDATE app.cash_register_sessions
       SET closing_amount = $1,
           closing_at = NOW(),
           closing_notes = $2,
           closing_user_id = $3,
           status = 'CLOSED',
           totals_snapshot = $4
       WHERE id = $5`,
      [summary.closingAmount, summary.closingNotes, input.adminUserId, JSON.stringify(summary), session.id]
    );

    for (const payment of summary.payments) {
      await client.query(
        `INSERT INTO app.cash_register_session_payments (
           session_id,
           payment_method,
           expected_amount,
           reported_amount,
           difference_amount,
           transaction_count
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (session_id, payment_method)
         DO UPDATE SET
           expected_amount = EXCLUDED.expected_amount,
           reported_amount = EXCLUDED.reported_amount,
           difference_amount = EXCLUDED.difference_amount,
           transaction_count = EXCLUDED.transaction_count,
           updated_at = NOW()` ,
        [
          summary.sessionId,
          payment.method,
          payment.expectedAmount,
          payment.reportedAmount,
          payment.differenceAmount,
          payment.transactionCount,
        ]
      );
    }

    return summary;
  });
}

export async function getCashRegisterClosureReport(sessionId: number): Promise<CashRegisterReport | null> {
  const session = await getCashRegisterSessionById(sessionId);
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
      };
    }
  }

  if (env.useMockData && mockSessionInvoices && mockSessions) {
    const invoices = mockSessionInvoices.filter((item) => item.sessionId === session.id);
    const expectedPayments = new Map<string, { amount: number; txCount: number }>();
    for (const invoice of invoices) {
      for (const payment of invoice.payments) {
        const key = payment.method.trim().toUpperCase();
        const prev = expectedPayments.get(key) ?? { amount: 0, txCount: 0 };
        expectedPayments.set(key, {
          amount: prev.amount + payment.amount,
          txCount: prev.txCount + 1,
        });
      }
    }

    const expectedList = Array.from(expectedPayments.entries()).map(([method, data]) => ({
      method,
      amount: roundCurrency(data.amount),
      txCount: data.txCount,
    }));

    return buildSummary({
      session,
      closingUserId: session.closingUserId ?? session.adminUserId,
      closingAmount: session.closingAmount ?? 0,
      closingAt: session.closingAt ? new Date(session.closingAt) : new Date(),
      closingNotes: session.closingNotes,
      expectedPayments: expectedList,
      reportedPayments: expectedList.map((item) => ({ method: item.method, reportedAmount: item.amount, txCount: item.txCount })),
      totalInvoices: invoices.length,
    });
  }

  if (env.useMockData) {
    return null;
  }

  const expectedPaymentsResult = await query<{
    payment_method: string;
    tx_count: number;
    total_amount: number;
  }>(
    `WITH invoices AS (
       SELECT id
       FROM app.invoices
       WHERE cash_register_session_id = $1
     )
     SELECT
       p.payment_method,
       COUNT(*)::int AS tx_count,
       COALESCE(SUM(p.amount), 0) AS total_amount
     FROM app.invoice_payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     GROUP BY p.payment_method`,
    [session.id]
  );

  const paymentList = expectedPaymentsResult.rows.map((row) => ({
    method: row.payment_method.trim().toUpperCase(),
    amount: Number(row.total_amount ?? 0),
    txCount: Number(row.tx_count ?? 0),
  }));

  const invoiceCountResult = await query<{ total_invoices: number }>(
    `SELECT COUNT(*)::int AS total_invoices
       FROM app.invoices
       WHERE cash_register_session_id = $1`,
    [session.id]
  );

  const totalInvoices = invoiceCountResult.rows[0]?.total_invoices ?? 0;

  return buildSummary({
    session,
    closingUserId: session.closingUserId ?? session.adminUserId,
    closingAmount: session.closingAmount ?? 0,
    closingAt: session.closingAt ? new Date(session.closingAt) : new Date(),
    closingNotes: session.closingNotes,
    expectedPayments: paymentList,
    reportedPayments: paymentList.map((payment) => ({
      method: payment.method,
      reportedAmount: payment.amount,
      txCount: payment.txCount,
    })),
    totalInvoices,
  });
}
