import { buildClosureSummary } from "@/lib/services/cash-registers/summary";
import {
  CashRegisterAssignment,
  CashRegisterClosureSummary,
  CashRegisterSessionRecord,
  ExpectedPayment,
  ReportedPayment,
} from "@/lib/services/cash-registers/types";
import { query, withTransaction } from "@/lib/db/postgres";
import type { ICashRegisterRepository } from "./ICashRegisterRepository";

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
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
    },
  } satisfies CashRegisterSessionRecord;
}

export class CashRegisterRepository implements ICashRegisterRepository {
  async listCashRegistersForAdmin(adminUserId: number): Promise<CashRegisterAssignment[]> {
    const result = await query<{
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

    return result.rows.map((row) => ({
      cashRegisterId: Number(row.cash_register_id),
      cashRegisterCode: row.cash_register_code,
      cashRegisterName: row.cash_register_name,
      allowManualWarehouseOverride: !!row.allow_manual_warehouse_override,
      warehouseId: Number(row.warehouse_id),
      warehouseCode: row.warehouse_code,
      warehouseName: row.warehouse_name,
      isDefault: !!row.is_default,
    }));
  }

  async getActiveCashRegisterSessionByAdmin(adminUserId: number): Promise<CashRegisterSessionRecord | null> {
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
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async getCashRegisterSessionById(sessionId: number): Promise<CashRegisterSessionRecord | null> {
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
         cru.is_default
       FROM app.cash_register_sessions s
       INNER JOIN app.cash_registers cr ON cr.id = s.cash_register_id
       INNER JOIN app.warehouses w ON w.id = cr.warehouse_id
       LEFT JOIN app.cash_register_users cru ON cru.cash_register_id = cr.id AND cru.admin_user_id = s.admin_user_id
       WHERE s.id = $1
       LIMIT 1`,
      [sessionId]
    );
    const row = result.rows[0];
    return row ? mapSessionRow(row) : null;
  }

  async openCashRegisterSession(params: {
    adminUserId: number;
    cashRegisterCode: string;
    openingAmount: number;
    openingNotes: string | null;
  }): Promise<CashRegisterSessionRecord> {
    const { adminUserId, cashRegisterCode, openingAmount, openingNotes } = params;

    return withTransaction(async (client) => {
      const registerResult = await client.query<{
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
         WHERE cru.admin_user_id = $1 AND UPPER(cr.code) = $2
         LIMIT 1`,
        [adminUserId, normalizeCode(cashRegisterCode)]
      );

      const registerRow = registerResult.rows[0];
      if (!registerRow) {
        throw new Error(`No tienes permisos para operar la caja ${cashRegisterCode}`);
      }

      const openForUser = await client.query(
        "SELECT 1 FROM app.cash_register_sessions WHERE admin_user_id = $1 AND status = 'OPEN' LIMIT 1",
        [adminUserId]
      );
      if (openForUser.rowCount && openForUser.rowCount > 0) {
        throw new Error("Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.");
      }

      const openForRegister = await client.query(
        "SELECT 1 FROM app.cash_register_sessions WHERE cash_register_id = $1 AND status = 'OPEN' LIMIT 1",
        [registerRow.cash_register_id]
      );
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
         RETURNING id, status, opening_amount, opening_at, opening_notes, closing_amount, closing_at, closing_notes, closing_user_id, totals_snapshot`,
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
      });
    });
  }

  async closeCashRegisterSession(params: {
    adminUserId: number;
    sessionId?: number | null;
    closingAmount: number;
    payments: ReportedPayment[];
    closingNotes: string | null;
  }): Promise<CashRegisterClosureSummary> {
    const { adminUserId, sessionId, closingAmount, payments, closingNotes } = params;

    return withTransaction(async (client) => {
      const sessionQuery = await client.query<SessionDbRow>(
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
        [sessionId ?? null, adminUserId]
      );

      const row = sessionQuery.rows[0];
      if (!row) {
        throw new Error("No se encontró una apertura de caja activa");
      }
      if (row.status !== "OPEN") {
        throw new Error("La sesión indicada ya fue cerrada");
      }
      if (Number(row.admin_user_id) !== adminUserId) {
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

      const expectedPayments: ExpectedPayment[] = expectedPaymentsResult.rows.map((row) => ({
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

      const summary = buildClosureSummary({
        session,
        closingUserId: adminUserId,
        closingAmount,
        closingAt: new Date(),
        closingNotes,
        expectedPayments,
        reportedPayments: payments,
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
        [summary.closingAmount, summary.closingNotes, adminUserId, JSON.stringify(summary), session.id]
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
             updated_at = NOW()`,
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

  async getCashRegisterClosureReport(sessionId: number): Promise<{
    session: CashRegisterSessionRecord;
    payments: ExpectedPayment[];
    totalInvoices: number;
  } | null> {
    const session = await this.getCashRegisterSessionById(sessionId);
    if (!session) {
      return null;
    }

    const paymentsResult = await query<{
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
      [sessionId]
    );

    const payments: ExpectedPayment[] = paymentsResult.rows.map((row) => ({
      method: row.payment_method.trim().toUpperCase(),
      amount: Number(row.total_amount ?? 0),
      txCount: Number(row.tx_count ?? 0),
    }));

    const invoiceCountResult = await query<{ total_invoices: number }>(
      `SELECT COUNT(*)::int AS total_invoices
       FROM app.invoices
       WHERE cash_register_session_id = $1`,
      [sessionId]
    );

    const totalInvoices = invoiceCountResult.rows[0]?.total_invoices ?? 0;

    return { session, payments, totalInvoices };
  }
}
