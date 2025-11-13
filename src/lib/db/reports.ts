import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";
import type { PurchaseStatus } from "@/lib/db/inventory";

export interface SalesSummaryFilters {
  from: string;
  to: string;
  waiterCode?: string;
  tableCode?: string;
  customer?: string;
  paymentMethod?: string;
  currency?: string;
}

export interface SalesSummaryResult {
  totals: {
    invoices: number;
    subtotal: number;
    serviceCharge: number;
    vat: number;
    total: number;
    averageTicket: number;
  };
  payments: Array<{ method: string; amount: number }>;
  byDay: Array<{ date: string; invoices: number; total: number }>;
}

export interface WaiterPerformanceFilters {
  from: string;
  to: string;
  waiterCode?: string;
}

export interface WaiterPerformanceRow {
  waiterCode: string | null;
  waiterName: string;
  invoices: number;
  totalSales: number;
  averageTicket: number;
  serviceCharge: number;
  lastSaleAt: string | null;
}

export interface TopItemsFilters {
  from: string;
  to: string;
  search?: string;
  limit?: number;
}

export interface TopItemRow {
  description: string;
  quantity: number;
  total: number;
  averagePrice: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
}

export interface InventoryMovementsFilters {
  from: string;
  to: string;
  article?: string;
  warehouse?: string;
  transactionType?: string;
}

export interface InventoryMovementsSummaryRow {
  transactionType: string;
  entriesRetail: number;
  exitsRetail: number;
  netRetail: number;
  entriesStorage: number;
  exitsStorage: number;
  netStorage: number;
}

export interface InventoryMovementsResult {
  summary: InventoryMovementsSummaryRow[];
  totals: {
    netRetail: number;
    netStorage: number;
  };
}

export interface PurchasesReportFilters {
  from: string;
  to: string;
  supplier?: string;
  status?: PurchaseStatus | "";
}

export interface PurchasesReportRow {
  supplierName: string;
  purchases: number;
  totalAmount: number;
  pendingAmount: number;
  partialAmount: number;
  paidAmount: number;
  averageTicket: number;
  lastPurchaseAt: string | null;
}

export interface InvoiceStatusFilters {
  from: string;
  to: string;
  customer?: string;
  waiterCode?: string;
}

export interface InvoiceStatusRow {
  status: "PAGADA" | "PENDIENTE" | "PARCIAL";
  invoices: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

export interface InvoiceStatusDetailRow {
  invoiceNumber: string;
  customerName: string | null;
  waiterCode: string | null;
  createdAt: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: "PAGADA" | "PENDIENTE" | "PARCIAL";
}

export interface InvoiceStatusResult {
  summary: InvoiceStatusRow[];
  topPending: InvoiceStatusDetailRow[];
}

function buildMockNumber(seed: number, multiplier: number, precision = 2) {
  const value = (Math.sin(seed) + 1.5) * multiplier;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export async function getSalesSummaryReport(filters: SalesSummaryFilters): Promise<SalesSummaryResult> {
  if (env.useMockData) {
    const base = buildMockNumber(new Date(filters.from).getTime(), 4200);
    const invoices = Math.max(Math.round(base / 150), 4);
    const subtotal = base * 0.82;
    const serviceCharge = base * 0.08;
    const vat = base * 0.1;
    const total = subtotal + serviceCharge + vat;
    const days = 7;
    const byDay = Array.from({ length: days }, (_, index) => {
      const daily = buildMockNumber(index + total, 580);
      return {
        date: new Date(Date.parse(filters.from) + index * 86_400_000).toISOString(),
        invoices: Math.max(Math.round(daily / 120), 1),
        total: daily,
      };
    });
    return {
      totals: {
        invoices,
        subtotal: Number(subtotal.toFixed(2)),
        serviceCharge: Number(serviceCharge.toFixed(2)),
        vat: Number(vat.toFixed(2)),
        total: Number(total.toFixed(2)),
        averageTicket: Number((total / invoices).toFixed(2)),
      },
      payments: [
        { method: "CASH", amount: Number((total * 0.45).toFixed(2)) },
        { method: "CARD", amount: Number((total * 0.4).toFixed(2)) },
        { method: "TRANSFER", amount: Number((total * 0.1).toFixed(2)) },
        { method: "OTHER", amount: Number((total * 0.05).toFixed(2)) },
      ],
      byDay,
    };
  }
  const buildWhere = (options?: { includePaymentMethod?: boolean }) => {
    const params: unknown[] = [filters.from, filters.to];
    const conditions: string[] = ["i.created_at::date BETWEEN $1 AND $2"];
    const pushCondition = (value: unknown, clauseFactory: (placeholder: string) => string) => {
      params.push(value);
      const placeholder = `$${params.length}`;
      conditions.push(clauseFactory(placeholder));
    };

    if (filters.waiterCode) {
      pushCondition(filters.waiterCode.toUpperCase(), (placeholder) => `UPPER(i.waiter_code) = ${placeholder}`);
    }
    if (filters.tableCode) {
      pushCondition(filters.tableCode.toUpperCase(), (placeholder) => `UPPER(i.table_code) = ${placeholder}`);
    }
    if (filters.customer) {
      pushCondition(`%${filters.customer.toUpperCase()}%`, (placeholder) => `(
        UPPER(i.customer_name) LIKE ${placeholder}
        OR UPPER(i.customer_tax_id) LIKE ${placeholder}
      )`);
    }
    if (filters.currency) {
      pushCondition(filters.currency.toUpperCase(), (placeholder) => `UPPER(i.currency_code) = ${placeholder}`);
    }
    if (options?.includePaymentMethod && filters.paymentMethod) {
      pushCondition(filters.paymentMethod.toUpperCase(), (placeholder) => `UPPER(p.payment_method) = ${placeholder}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  };

  const { whereClause, params } = buildWhere();
  const totalsQuery = await query<{
    invoices: number;
    subtotal: number;
    service_charge: number;
    vat_amount: number;
    total_amount: number;
  }>(
    `SELECT
       COUNT(*) AS invoices,
       COALESCE(SUM(i.subtotal), 0) AS subtotal,
       COALESCE(SUM(i.service_charge), 0) AS service_charge,
       COALESCE(SUM(i.vat_amount), 0) AS vat_amount,
       COALESCE(SUM(i.total_amount), 0) AS total_amount
     FROM app.invoices i
     ${whereClause}`,
    params
  );

  const totalsRow = totalsQuery.rows[0] ?? { invoices: 0, subtotal: 0, service_charge: 0, vat_amount: 0, total_amount: 0 };
  const invoicesCount = Number(totalsRow.invoices ?? 0);
  const totalAmount = Number(totalsRow.total_amount ?? 0);

  const { whereClause: paymentsWhereClause, params: paymentParams } = buildWhere({ includePaymentMethod: true });
  const paymentsResult = await query<{ method: string; amount: number }>(
    `SELECT
       p.payment_method AS method,
       COALESCE(SUM(p.amount), 0) AS amount
     FROM app.invoice_payments p
     INNER JOIN app.invoices i ON i.id = p.invoice_id
     ${paymentsWhereClause}
     GROUP BY p.payment_method
     ORDER BY amount DESC`,
    paymentParams
  );

  const { whereClause: dayWhereClause, params: dayParams } = buildWhere();
  const byDay = await query<{ date: Date | string; invoices: number; total: number }>(
    `SELECT
       i.created_at::date AS date,
       COUNT(*) AS invoices,
       COALESCE(SUM(i.total_amount), 0) AS total
     FROM app.invoices i
     ${dayWhereClause}
     GROUP BY i.created_at::date
     ORDER BY i.created_at::date`,
    dayParams
  );

  return {
    totals: {
      invoices: invoicesCount,
      subtotal: Number((totalsRow.subtotal ?? 0).toFixed(2)),
      serviceCharge: Number((totalsRow.service_charge ?? 0).toFixed(2)),
      vat: Number((totalsRow.vat_amount ?? 0).toFixed(2)),
      total: Number(totalAmount.toFixed(2)),
      averageTicket: invoicesCount > 0 ? Number((totalAmount / invoicesCount).toFixed(2)) : 0,
    },
    payments: paymentsResult.rows.map((row) => ({
      method: row.method,
      amount: Number((row.amount ?? 0).toFixed(2)),
    })),
    byDay: byDay.rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString(),
      invoices: Number(row.invoices ?? 0),
      total: Number((row.total ?? 0).toFixed(2)),
    })),
  } satisfies SalesSummaryResult;
}

export async function getWaiterPerformanceReport(filters: WaiterPerformanceFilters): Promise<WaiterPerformanceRow[]> {
  if (env.useMockData) {
    return Array.from({ length: 4 }, (_, index) => {
      const base = buildMockNumber(index + Date.parse(filters.from), 1500);
      const invoices = Math.max(Math.round(base / 120), 1);
      return {
        waiterCode: `MOCK-${index + 1}`,
        waiterName: `Mesero Demo ${index + 1}`,
        invoices,
        totalSales: Number(base.toFixed(2)),
        averageTicket: Number((base / invoices).toFixed(2)),
        serviceCharge: Number((base * 0.1).toFixed(2)),
        lastSaleAt: new Date(Date.parse(filters.to) - index * 43_200_000).toISOString(),
      } satisfies WaiterPerformanceRow;
    });
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = ["i.created_at::date BETWEEN $1 AND $2"];
  if (filters.waiterCode) {
    params.push(filters.waiterCode.toUpperCase());
    conditions.push(`UPPER(i.waiter_code) = $${params.length}`);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query<{
    waiter_code: string | null;
    waiter_name: string | null;
    invoices: number;
    total_sales: number;
    service_charge: number;
    last_sale_at: Date | string | null;
  }>(
    `SELECT
       COALESCE(w.code, i.waiter_code) AS waiter_code,
       COALESCE(w.full_name, i.waiter_code, 'Sin asignar') AS waiter_name,
       COUNT(*) AS invoices,
       COALESCE(SUM(i.total_amount), 0) AS total_sales,
       COALESCE(SUM(i.service_charge), 0) AS service_charge,
       MAX(i.created_at) AS last_sale_at
     FROM app.invoices i
     LEFT JOIN app.waiters w ON w.code = i.waiter_code
     ${whereClause}
     GROUP BY COALESCE(w.code, i.waiter_code), COALESCE(w.full_name, i.waiter_code, 'Sin asignar')
     ORDER BY total_sales DESC`,
    params
  );
  return result.rows.map((row) => {
    const invoices = Number(row.invoices ?? 0);
    const totalSales = Number(row.total_sales ?? 0);
    return {
      waiterCode: row.waiter_code,
      waiterName: row.waiter_name ?? "Sin asignar",
      invoices,
      totalSales: Number(totalSales.toFixed(2)),
      averageTicket: invoices > 0 ? Number((totalSales / invoices).toFixed(2)) : 0,
      serviceCharge: Number((row.service_charge ?? 0).toFixed(2)),
      lastSaleAt: row.last_sale_at ? (row.last_sale_at instanceof Date ? row.last_sale_at.toISOString() : new Date(row.last_sale_at).toISOString()) : null,
    } satisfies WaiterPerformanceRow;
  });
}

export async function getTopItemsReport(filters: TopItemsFilters): Promise<TopItemRow[]> {
  if (env.useMockData) {
    return Array.from({ length: filters.limit ?? 10 }, (_, index) => {
      const quantity = buildMockNumber(index + 2, 45, 0);
      const total = buildMockNumber(index + 3, 1800);
      return {
        description: `Artículo destacado ${index + 1}`,
        quantity: Math.max(Math.round(quantity), 1),
        total: Number(total.toFixed(2)),
        averagePrice: Number((total / Math.max(Math.round(quantity), 1)).toFixed(2)),
        firstSaleAt: new Date(Date.parse(filters.from) + index * 86_400_000).toISOString(),
        lastSaleAt: new Date(Date.parse(filters.to) - index * 43_200_000).toISOString(),
      } satisfies TopItemRow;
    });
  }

  const limit = Math.max(Math.min(filters.limit ?? 15, 100), 1);
  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = ["inv.created_at::date BETWEEN $1 AND $2"];
  const addCondition = (value: unknown, clauseFactory: (placeholder: string) => string) => {
    params.push(value);
    const placeholder = `$${params.length}`;
    conditions.push(clauseFactory(placeholder));
  };

  if (filters.search) {
    addCondition(`%${filters.search.toUpperCase()}%`, (placeholder) => `UPPER(item.description) LIKE ${placeholder}`);
  }

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query<{
    description: string;
    quantity: number;
    total: number;
    average_price: number;
    first_sale_at: Date | string | null;
    last_sale_at: Date | string | null;
  }>(
    `SELECT
       item.description,
       COALESCE(SUM(inv.quantity), 0) AS quantity,
       COALESCE(SUM(inv.total_amount), 0) AS total,
       CASE WHEN SUM(inv.quantity) > 0 THEN COALESCE(SUM(inv.total_amount), 0) / SUM(inv.quantity) ELSE 0 END AS average_price,
       MIN(inv.created_at) AS first_sale_at,
       MAX(inv.created_at) AS last_sale_at
     FROM app.invoice_items item
     INNER JOIN app.invoice_items_movements inv ON inv.item_id = item.id
     ${whereClause}
     GROUP BY item.description
     ORDER BY total DESC
     LIMIT ${limitPlaceholder}`,
    params
  );

  return result.rows.map((row) => ({
    description: row.description,
    quantity: Number((row.quantity ?? 0).toFixed(2)),
    total: Number((row.total ?? 0).toFixed(2)),
    averagePrice: Number((row.average_price ?? 0).toFixed(2)),
    firstSaleAt: row.first_sale_at ? (row.first_sale_at instanceof Date ? row.first_sale_at.toISOString() : new Date(row.first_sale_at).toISOString()) : null,
    lastSaleAt: row.last_sale_at ? (row.last_sale_at instanceof Date ? row.last_sale_at.toISOString() : new Date(row.last_sale_at).toISOString()) : null,
  } satisfies TopItemRow));
}

export async function getInventoryMovementsReport(filters: InventoryMovementsFilters): Promise<InventoryMovementsResult> {
  if (env.useMockData) {
    const summary = ["PURCHASE", "CONSUMPTION", "TRANSFER"].map((type, index) => {
      const entries = buildMockNumber(index + 5, 320);
      const exits = buildMockNumber(index + 8, 280);
      return {
        transactionType: type,
        entriesRetail: Number(entries.toFixed(2)),
        exitsRetail: Number(exits.toFixed(2)),
        netRetail: Number((entries - exits).toFixed(2)),
        entriesStorage: Number((entries / 12).toFixed(2)),
        exitsStorage: Number((exits / 12).toFixed(2)),
        netStorage: Number(((entries - exits) / 12).toFixed(2)),
      } satisfies InventoryMovementsSummaryRow;
    });
    return {
      summary,
      totals: summary.reduce(
        (acc, row) => ({
          netRetail: Number((acc.netRetail + row.netRetail).toFixed(2)),
          netStorage: Number((acc.netStorage + row.netStorage).toFixed(2)),
        }),
        { netRetail: 0, netStorage: 0 }
      ),
    } satisfies InventoryMovementsResult;
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = ["t.transaction_type = 'PURCHASE'", "t.occurred_at::date BETWEEN $1 AND $2"];
  const addCondition = (value: unknown, clauseFactory: (placeholder: string) => string) => {
    params.push(value);
    const placeholder = `$${params.length}`;
    conditions.push(clauseFactory(placeholder));
  };

  if (filters.article) {
    addCondition(`%${filters.article.toUpperCase()}%`, (placeholder) => `(
      UPPER(a.article_code) LIKE ${placeholder}
      OR UPPER(a.name) LIKE ${placeholder}
    )`);
  }
  if (filters.warehouse) {
    addCondition(filters.warehouse.toUpperCase(), (placeholder) => `UPPER(w.code) = ${placeholder}`);
  }
  if (filters.transactionType) {
    addCondition(filters.transactionType.toUpperCase(), (placeholder) => `UPPER(t.transaction_type) = ${placeholder}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query<{
    transaction_type: string;
    entries_retail: number;
    exits_retail: number;
    entries_storage: number;
    exits_storage: number;
  }>(
    `SELECT
       t.transaction_type,
       COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.quantity_retail ELSE 0 END), 0) AS entries_retail,
       COALESCE(SUM(CASE WHEN m.direction = 'OUT' THEN m.quantity_retail ELSE 0 END), 0) AS exits_retail,
       COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.quantity_retail / NULLIF(a.conversion_factor, 0) ELSE 0 END), 0) AS entries_storage,
       COALESCE(SUM(CASE WHEN m.direction = 'OUT' THEN m.quantity_retail / NULLIF(a.conversion_factor, 0) ELSE 0 END), 0) AS exits_storage
     FROM app.inventory_movements m
     INNER JOIN app.inventory_transactions t ON t.id = m.transaction_id
     INNER JOIN app.articles a ON a.id = m.article_id
     INNER JOIN app.warehouses w ON w.id = m.warehouse_id
     ${whereClause}
     GROUP BY t.transaction_type
     ORDER BY t.transaction_type`,
    params
  );

  const summary = result.rows.map((row) => {
    const entriesRetail = Number(row.entries_retail ?? 0);
    const exitsRetail = Number(row.exits_retail ?? 0);
    const entriesStorage = Number(row.entries_storage ?? 0);
    const exitsStorage = Number(row.exits_storage ?? 0);
    return {
      transactionType: row.transaction_type,
      entriesRetail: Number(entriesRetail.toFixed(4)),
      exitsRetail: Number(exitsRetail.toFixed(4)),
      netRetail: Number((entriesRetail - exitsRetail).toFixed(4)),
      entriesStorage: Number(entriesStorage.toFixed(4)),
      exitsStorage: Number(exitsStorage.toFixed(4)),
      netStorage: Number((entriesStorage - exitsStorage).toFixed(4)),
    } satisfies InventoryMovementsSummaryRow;
  });

  const totals = summary.reduce(
    (acc, row) => ({
      netRetail: Number((acc.netRetail + row.netRetail).toFixed(4)),
      netStorage: Number((acc.netStorage + row.netStorage).toFixed(4)),
    }),
    { netRetail: 0, netStorage: 0 }
  );

  return { summary, totals } satisfies InventoryMovementsResult;
}

export async function getPurchasesReport(filters: PurchasesReportFilters): Promise<PurchasesReportRow[]> {
  if (env.useMockData) {
    return Array.from({ length: 5 }, (_, index) => {
      const pending = buildMockNumber(index + 10, 900);
      const paid = buildMockNumber(index + 11, 1400);
      const partial = buildMockNumber(index + 12, 400);
      const total = pending + paid + partial;
      const purchases = Math.max(Math.round(total / 600), 1);
      return {
        supplierName: `Proveedor Demo ${index + 1}`,
        purchases,
        totalAmount: Number(total.toFixed(2)),
        pendingAmount: Number(pending.toFixed(2)),
        partialAmount: Number(partial.toFixed(2)),
        paidAmount: Number(paid.toFixed(2)),
        averageTicket: Number((total / purchases).toFixed(2)),
        lastPurchaseAt: new Date(Date.parse(filters.to) - index * 72_000_00).toISOString(),
      } satisfies PurchasesReportRow;
    });
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = ["t.occurred_at::date BETWEEN $1 AND $2"];

  if (filters.supplier) {
    params.push(`%${filters.supplier.toUpperCase()}%`);
    conditions.push(`UPPER(t.counterparty_name) LIKE $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query<{
    supplier_name: string | null;
    purchases: number;
    total_amount: number;
    pending_amount: number;
    partial_amount: number;
    paid_amount: number;
    last_purchase_at: Date | string | null;
  }>(
    `SELECT
       COALESCE(t.counterparty_name, 'Sin proveedor') AS supplier_name,
       COUNT(*) AS purchases,
       COALESCE(SUM(t.total_amount), 0) AS total_amount,
       COALESCE(SUM(CASE WHEN t.status = 'PENDIENTE' THEN t.total_amount ELSE 0 END), 0) AS pending_amount,
       COALESCE(SUM(CASE WHEN t.status = 'PARCIAL' THEN t.total_amount ELSE 0 END), 0) AS partial_amount,
       COALESCE(SUM(CASE WHEN t.status = 'PAGADA' THEN t.total_amount ELSE 0 END), 0) AS paid_amount,
       MAX(t.occurred_at) AS last_purchase_at
     FROM app.inventory_transactions t
     ${whereClause}
     GROUP BY COALESCE(t.counterparty_name, 'Sin proveedor')
     ORDER BY total_amount DESC`,
    params
  );

  return result.rows.map((row) => {
    const purchases = Number(row.purchases ?? 0);
    const totalAmount = Number(row.total_amount ?? 0);
    return {
      supplierName: row.supplier_name || "Sin proveedor",
      purchases,
      totalAmount: Number(totalAmount.toFixed(2)),
      pendingAmount: Number((row.pending_amount ?? 0).toFixed(2)),
      partialAmount: Number((row.partial_amount ?? 0).toFixed(2)),
      paidAmount: Number((row.paid_amount ?? 0).toFixed(2)),
      averageTicket: purchases > 0 ? Number((totalAmount / purchases).toFixed(2)) : 0,
      lastPurchaseAt: row.last_purchase_at ? (row.last_purchase_at instanceof Date ? row.last_purchase_at.toISOString() : new Date(row.last_purchase_at).toISOString()) : null,
    } satisfies PurchasesReportRow;
  });
}

export async function getInvoiceStatusReport(filters: InvoiceStatusFilters): Promise<InvoiceStatusResult> {
  if (env.useMockData) {
    const summary: InvoiceStatusRow[] = [
      { status: "PAGADA", invoices: 24, totalAmount: 18450.5, paidAmount: 18450.5, balance: 0 },
      { status: "PARCIAL", invoices: 6, totalAmount: 3500.75, paidAmount: 2100.5, balance: 1400.25 },
      { status: "PENDIENTE", invoices: 4, totalAmount: 2200.0, paidAmount: 0, balance: 2200.0 },
    ];
    const topPending: InvoiceStatusDetailRow[] = Array.from({ length: 5 }, (_, index) => ({
      invoiceNumber: `MOCK-${index + 1001}`,
      customerName: `Cliente Demo ${index + 1}`,
      waiterCode: `MES-${index + 1}`,
      createdAt: new Date(Date.parse(filters.from) + index * 54_000_00).toISOString(),
      totalAmount: 450 + index * 75,
      paidAmount: index % 2 === 0 ? 200 : 0,
      balance: index % 2 === 0 ? 250 + index * 10 : 450 + index * 75,
      status: index % 2 === 0 ? "PARCIAL" : "PENDIENTE",
    }));
    return { summary, topPending } satisfies InvoiceStatusResult;
  }

  const buildWhere = () => {
    const params: unknown[] = [filters.from, filters.to];
    const conditions: string[] = ["i.created_at::date BETWEEN $1 AND $2"];
    const addCondition = (value: unknown, clauseFactory: (placeholder: string) => string) => {
      params.push(value);
      const placeholder = `$${params.length}`;
      conditions.push(clauseFactory(placeholder));
    };

    if (filters.customer) {
      addCondition(`%${filters.customer.toUpperCase()}%`, (placeholder) => `(
        UPPER(i.customer_name) LIKE ${placeholder}
        OR UPPER(i.customer_tax_id) LIKE ${placeholder}
      )`);
    }
    if (filters.waiterCode) {
      addCondition(filters.waiterCode.toUpperCase(), (placeholder) => `UPPER(i.waiter_code) = ${placeholder}`);
    }

    return {
      whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  };

  const { whereClause, params } = buildWhere();
  const summaryResult = await query<{
    status: "PAGADA" | "PARCIAL" | "PENDIENTE";
    invoices: number;
    total_amount: number;
    paid_amount: number;
    balance: number;
  }>(
    `WITH invoice_totals AS (
       SELECT
         i.id,
         i.invoice_number,
         i.customer_name,
         i.waiter_code,
         i.created_at,
         i.total_amount,
         COALESCE(SUM(p.amount), 0) AS paid_amount
       FROM app.invoices i
       LEFT JOIN app.invoice_payments p ON p.invoice_id = i.id
       ${whereClause}
       GROUP BY i.id, i.invoice_number, i.customer_name, i.waiter_code, i.created_at, i.total_amount
     )
     SELECT
       CASE
         WHEN paid_amount >= total_amount THEN 'PAGADA'
         WHEN paid_amount = 0 THEN 'PENDIENTE'
         ELSE 'PARCIAL'
       END AS status,
       COUNT(*) AS invoices,
       COALESCE(SUM(total_amount), 0) AS total_amount,
       COALESCE(SUM(paid_amount), 0) AS paid_amount,
       COALESCE(SUM(total_amount - paid_amount), 0) AS balance
     FROM invoice_totals
     GROUP BY CASE
       WHEN paid_amount >= total_amount THEN 'PAGADA'
       WHEN paid_amount = 0 THEN 'PENDIENTE'
       ELSE 'PARCIAL'
     END`,
    params
  );

  const { whereClause: topWhereClause, params: topParams } = buildWhere();
  const topResult = await query<{
    invoice_number: string;
    customer_name: string | null;
    waiter_code: string | null;
    created_at: Date | string;
    total_amount: number;
    paid_amount: number;
    balance: number;
    status: "PAGADA" | "PARCIAL" | "PENDIENTE";
  }>(
    `WITH invoice_totals AS (
       SELECT
         i.id,
         i.invoice_number,
         i.customer_name,
         i.waiter_code,
         i.created_at,
         i.total_amount,
         COALESCE(SUM(p.amount), 0) AS paid_amount
       FROM app.invoices i
       LEFT JOIN app.invoice_payments p ON p.invoice_id = i.id
       ${topWhereClause}
       GROUP BY i.id, i.invoice_number, i.customer_name, i.waiter_code, i.created_at, i.total_amount
     )
     SELECT
       invoice_number,
       customer_name,
       waiter_code,
       created_at,
       total_amount,
       paid_amount,
       total_amount - paid_amount AS balance,
       CASE
         WHEN paid_amount >= total_amount THEN 'PAGADA'
         WHEN paid_amount = 0 THEN 'PENDIENTE'
         ELSE 'PARCIAL'
       END AS status
     FROM invoice_totals
     WHERE total_amount - paid_amount > 0
     ORDER BY balance DESC, created_at ASC
     LIMIT 15`,
    topParams
  );

  return {
    summary: summaryResult.rows.map((row) => ({
      status: row.status,
      invoices: Number(row.invoices ?? 0),
      totalAmount: Number((row.total_amount ?? 0).toFixed(2)),
      paidAmount: Number((row.paid_amount ?? 0).toFixed(2)),
      balance: Number((row.balance ?? 0).toFixed(2)),
    })),
    topPending: topResult.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      customerName: row.customer_name,
      waiterCode: row.waiter_code,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      totalAmount: Number((row.total_amount ?? 0).toFixed(2)),
      paidAmount: Number((row.paid_amount ?? 0).toFixed(2)),
      balance: Number((row.balance ?? 0).toFixed(2)),
      status: row.status,
    })),
  } satisfies InvoiceStatusResult;
}
