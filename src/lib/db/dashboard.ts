import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";
import { getSalesSummaryReport, getTopItemsReport, getWaiterPerformanceReport } from "@/lib/db/reports";
import { getStockSummary } from "@/lib/db/inventory";
import { listTableAdminSnapshots } from "@/lib/db/tables";

export interface DashboardSummaryData {
  totalSales: number;
  invoices: number;
  cfdi: number;
  simplified: number;
  openingTime: string | null;
  openedBy: string | null;
  closingTime: string | null;
  closingSupervisor: string | null;
  cashOnHand: number | null;
}

export interface DashboardTableStatus {
  occupied: number;
  available: number;
  reserved: number;
  total: number;
}

export interface DashboardProductRow {
  name: string;
  category: string | null;
  units: number;
  revenue: number;
}

export interface DashboardLowInventoryRow {
  articleCode: string;
  articleName: string;
  warehouseName: string;
  availableRetail: number;
  availableStorage: number;
  unit: string | null;
}

export interface DashboardWaiterRow {
  waiter: string;
  tickets: number;
  revenue: number;
  avgTicket: number;
}

export interface DashboardSnapshot {
  summary: DashboardSummaryData;
  tableStatus: DashboardTableStatus;
  topProducts: DashboardProductRow[];
  lowInventory: DashboardLowInventoryRow[];
  waiterSales: DashboardWaiterRow[];
}

function formatTime(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(11, 16);
}

function coalesceName(displayName: string | null | undefined, username: string | null | undefined): string | null {
  if (displayName && displayName.trim().length > 0) return displayName.trim();
  if (username && username.trim().length > 0) return username.trim();
  return null;
}

export async function getDashboardSnapshot(forDate: string): Promise<DashboardSnapshot> {
  if (env.useMockData) {
    throw new Error("getDashboardSnapshot no está disponible en modo mock");
  }

  const summaryResult = await getSalesSummaryReport({ from: forDate, to: forDate });
  const [invoiceTypeCounts, sessionRows, topItems, waiterRows, stockRows, tables] = await Promise.all([
    query<{ cfdi: number; simplified: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE TRIM(COALESCE(customer_tax_id, '')) <> '') AS cfdi,
         COUNT(*) FILTER (WHERE TRIM(COALESCE(customer_tax_id, '')) = '') AS simplified
       FROM app.invoices
       WHERE invoice_date::date = $1`,
      [forDate]
    ).then((result) => result.rows[0] ?? { cfdi: 0, simplified: 0 }),
    query<{
      opening_at: Date;
      closing_at: Date | null;
      closing_amount: number | null;
      opening_display_name: string | null;
      opening_username: string | null;
      closing_display_name: string | null;
      closing_username: string | null;
    }>(
      `SELECT
         s.opening_at,
         s.closing_at,
         s.closing_amount,
         opener.display_name AS opening_display_name,
         opener.username AS opening_username,
         closer.display_name AS closing_display_name,
         closer.username AS closing_username
       FROM app.cash_register_sessions s
       LEFT JOIN app.admin_users opener ON opener.id = s.admin_user_id
       LEFT JOIN app.admin_users closer ON closer.id = s.closing_user_id
       WHERE s.opening_at::date = $1
       ORDER BY s.opening_at ASC`,
      [forDate]
    ).then((result) => result.rows),
    getTopItemsReport({ from: forDate, to: forDate, limit: 10 }),
    getWaiterPerformanceReport({ from: forDate, to: forDate }),
    getStockSummary(),
    listTableAdminSnapshots(),
  ]);

  const firstSession = sessionRows[0] ?? null;
  const lastSessionWithClosure = [...sessionRows].reverse().find((row) => row.closing_at !== null) ?? null;

  const summary: DashboardSummaryData = {
    totalSales: Number(summaryResult.totals.total.toFixed(2)),
    invoices: summaryResult.totals.invoices,
    cfdi: Number(invoiceTypeCounts.cfdi ?? 0),
    simplified: Number(invoiceTypeCounts.simplified ?? 0),
    openingTime: formatTime(firstSession?.opening_at),
    openedBy: coalesceName(firstSession?.opening_display_name, firstSession?.opening_username),
    closingTime: formatTime(lastSessionWithClosure?.closing_at),
    closingSupervisor: coalesceName(lastSessionWithClosure?.closing_display_name, lastSessionWithClosure?.closing_username),
    cashOnHand: lastSessionWithClosure?.closing_amount != null ? Number(lastSessionWithClosure.closing_amount) : null,
  };

  const tableStatus = tables.reduce<DashboardTableStatus>(
    (acc, table) => {
      if (!table.is_active) return acc;
      acc.total += 1;
      if (table.reservation) {
        acc.reserved += 1;
      } else if (table.order_status === "libre") {
        acc.available += 1;
      } else {
        acc.occupied += 1;
      }
      return acc;
    },
    { occupied: 0, available: 0, reserved: 0, total: 0 }
  );

  const topProducts: DashboardProductRow[] = topItems.map((item) => ({
    name: item.description,
    category: null,
    units: Number(item.quantity ?? 0),
    revenue: Number(item.total ?? 0),
  }));

  const lowInventory: DashboardLowInventoryRow[] = stockRows
    .slice()
    .sort((a, b) => a.available_retail - b.available_retail)
    .slice(0, 8)
    .map((row) => ({
      articleCode: row.article_code,
      articleName: row.article_name,
      warehouseName: row.warehouse_name,
      availableRetail: Number(row.available_retail ?? 0),
      availableStorage: Number(row.available_storage ?? 0),
      unit: row.retail_unit ?? row.storage_unit ?? null,
    }));

  const waiterSales: DashboardWaiterRow[] = waiterRows.map((row) => ({
    waiter: row.waiterName,
    tickets: row.invoices,
    revenue: Number(row.totalSales ?? 0),
    avgTicket: Number(row.averageTicket ?? 0),
  }));

  return {
    summary,
    tableStatus,
    topProducts,
    lowInventory,
    waiterSales,
  };
}
