import "server-only";

import { env } from "@/lib/env";
import { query } from "@/lib/db/postgres";
import type { PurchaseStatus } from "@/lib/types/inventory";
import type { CustomerDocumentStatus, CustomerDocumentType } from "@/lib/types/cxc";

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

const CXC_DEBIT_TYPES: CustomerDocumentType[] = ["INVOICE", "DEBIT_NOTE"];
const CXC_CREDIT_TYPES: CustomerDocumentType[] = ["CREDIT_NOTE", "RECEIPT", "RETENTION", "ADJUSTMENT"];
const CXC_OPEN_STATUSES: CustomerDocumentStatus[] = ["PENDIENTE", "BORRADOR"];
const CXC_ALL_STATUSES: CustomerDocumentStatus[] = ["PENDIENTE", "PAGADO", "CANCELADO", "BORRADOR"];
const CXC_DOCUMENT_TYPE_LABELS: Record<CustomerDocumentType, string> = {
  INVOICE: "Factura",
  DEBIT_NOTE: "Nota de débito",
  CREDIT_NOTE: "Nota de crédito",
  RECEIPT: "Recibo",
  RETENTION: "Retención",
  ADJUSTMENT: "Ajuste",
};

export interface CxcSummaryFilters {
  from: string;
  to: string;
  customer?: string;
  status?: CustomerDocumentStatus[];
  documentTypes?: CustomerDocumentType[];
}

export interface CxcSummaryTotals {
  customers: number;
  documents: number;
  originalAmount: number;
  balanceAmount: number;
  overdueAmount: number;
  dueNext7Amount: number;
  dueNext30Amount: number;
}

export interface CxcSummaryStatusRow {
  status: CustomerDocumentStatus;
  documents: number;
  originalAmount: number;
  balanceAmount: number;
}

export interface CxcSummaryTopCustomerRow {
  customerId: number;
  customerCode: string;
  customerName: string;
  documents: number;
  originalAmount: number;
  balanceAmount: number;
  overdueAmount: number;
  creditLimit: number;
  creditUsed: number;
  creditOnHold: number;
  availableCredit: number;
  creditStatus: string;
}

export interface CxcSummaryResult {
  totals: CxcSummaryTotals;
  byStatus: CxcSummaryStatusRow[];
  topCustomers: CxcSummaryTopCustomerRow[];
  generatedAt: string;
}

export interface CxcDueAnalysisFilters {
  from: string;
  to: string;
  customer?: string;
  includeFuture?: boolean;
}

export interface CxcDueBucketRow {
  bucket: "OVERDUE" | "TODAY" | "DUE_7" | "DUE_30" | "DUE_60" | "FUTURE";
  label: string;
  documents: number;
  customers: number;
  originalAmount: number;
  balanceAmount: number;
}

export interface CxcDueDocumentRow {
  documentId: number;
  documentNumber: string;
  customerId: number;
  customerCode: string;
  customerName: string;
  documentType: CustomerDocumentType;
  documentDate: string;
  dueDate: string;
  daysDelta: number;
  originalAmount: number;
  balanceAmount: number;
  status: CustomerDocumentStatus;
  paymentTermCode: string | null;
}

export interface CxcDueAnalysisResult {
  buckets: CxcDueBucketRow[];
  documents: CxcDueDocumentRow[];
  generatedAt: string;
}

export interface CxcAgingFilters {
  from: string;
  to: string;
  customer?: string;
  limit?: number;
}

export interface CxcAgingRow {
  customerId: number;
  customerCode: string;
  customerName: string;
  documents: number;
  balanceAmount: number;
  bucketCurrent: number;
  bucket0To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucket91To120: number;
  bucket120Plus: number;
  creditLimit: number;
  creditStatus: string;
}

export interface CxcAgingResult {
  rows: CxcAgingRow[];
  totals: {
    balanceAmount: number;
    customers: number;
  };
  generatedAt: string;
}

export interface CxcStatementFilters {
  customerId?: number;
  customerCode?: string;
  from: string;
  to: string;
  includeApplications?: boolean;
}

export interface CxcStatementCustomerSummary {
  id: number;
  code: string;
  name: string;
  taxId: string | null;
  creditLimit: number;
  creditUsed: number;
  creditOnHold: number;
  creditStatus: string;
  availableCredit: number;
}

export interface CxcStatementEntry {
  entryId: string;
  entryType: "DOCUMENT" | "APPLICATION";
  documentType?: CustomerDocumentType;
  documentNumber?: string;
  relatedDocumentNumber?: string | null;
  relatedDocumentType?: CustomerDocumentType | null;
  description: string;
  reference: string | null;
  eventDate: string;
  dueDate: string | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  affectsBalance: boolean;
}

export interface CxcStatementResult {
  customer: CxcStatementCustomerSummary;
  openingBalance: number;
  closingBalance: number;
  entries: CxcStatementEntry[];
  generatedAt: string;
}

function buildMockNumber(seed: number, multiplier: number, precision = 2) {
  const value = (Math.sin(seed) + 1.5) * multiplier;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function roundNumber(value: unknown, precision = 2): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(precision));
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
  const subtotalAmount = roundNumber(totalsRow.subtotal);
  const serviceChargeAmount = roundNumber(totalsRow.service_charge);
  const vatAmount = roundNumber(totalsRow.vat_amount);
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
      subtotal: subtotalAmount,
      serviceCharge: serviceChargeAmount,
      vat: vatAmount,
      total: roundNumber(totalAmount),
      averageTicket: invoicesCount > 0 ? roundNumber(totalAmount / invoicesCount) : 0,
    },
    payments: paymentsResult.rows.map((row) => ({
      method: row.method,
      amount: roundNumber(row.amount),
    })),
    byDay: byDay.rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString() : new Date(row.date).toISOString(),
      invoices: Number(row.invoices ?? 0),
      total: roundNumber(row.total),
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
      totalSales: roundNumber(totalSales),
      averageTicket: invoices > 0 ? roundNumber(totalSales / invoices) : 0,
      serviceCharge: roundNumber(row.service_charge),
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
    quantity: roundNumber(row.quantity),
    total: roundNumber(row.total),
    averagePrice: roundNumber(row.average_price),
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
      entriesRetail: roundNumber(entriesRetail, 4),
      exitsRetail: roundNumber(exitsRetail, 4),
      netRetail: roundNumber(entriesRetail - exitsRetail, 4),
      entriesStorage: roundNumber(entriesStorage, 4),
      exitsStorage: roundNumber(exitsStorage, 4),
      netStorage: roundNumber(entriesStorage - exitsStorage, 4),
    } satisfies InventoryMovementsSummaryRow;
  });

  const totals = summary.reduce(
    (acc, row) => ({
      netRetail: roundNumber(acc.netRetail + row.netRetail, 4),
      netStorage: roundNumber(acc.netStorage + row.netStorage, 4),
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
      totalAmount: roundNumber(totalAmount),
      pendingAmount: roundNumber(row.pending_amount),
      partialAmount: roundNumber(row.partial_amount),
      paidAmount: roundNumber(row.paid_amount),
      averageTicket: purchases > 0 ? roundNumber(totalAmount / purchases) : 0,
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
      totalAmount: roundNumber(row.total_amount),
      paidAmount: roundNumber(row.paid_amount),
      balance: roundNumber(row.balance),
    })),
    topPending: topResult.rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      customerName: row.customer_name,
      waiterCode: row.waiter_code,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      totalAmount: roundNumber(row.total_amount),
      paidAmount: roundNumber(row.paid_amount),
      balance: roundNumber(row.balance),
      status: row.status,
    })),
  } satisfies InvoiceStatusResult;
}

const ensureIsoString = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

const dueBucketLabelMap: Record<CxcDueBucketRow["bucket"], string> = {
  OVERDUE: "Vencido",
  TODAY: "Vence hoy",
  DUE_7: "0-7 días",
  DUE_30: "8-30 días",
  DUE_60: "31-60 días",
  FUTURE: "61+ días",
};

const sanitizeCustomerFilter = (value?: string): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return `%${normalized.toUpperCase()}%`;
};

const sanitizeStatusFilter = (statuses?: CustomerDocumentStatus[]): CustomerDocumentStatus[] | null => {
  if (!statuses || statuses.length === 0) return null;
  const normalized = statuses
    .map((status) => status.toUpperCase() as CustomerDocumentStatus)
    .filter((status) => CXC_ALL_STATUSES.includes(status));
  return normalized.length > 0 ? normalized : null;
};

const sanitizeDocumentTypes = (types?: CustomerDocumentType[]): CustomerDocumentType[] | null => {
  if (!types || types.length === 0) return null;
  const allowed = [...CXC_DEBIT_TYPES, ...CXC_CREDIT_TYPES];
  const normalized = types
    .map((type) => type.toUpperCase() as CustomerDocumentType)
    .filter((type) => allowed.includes(type));
  return normalized.length > 0 ? normalized : null;
};

export async function getCxcSummaryReport(filters: CxcSummaryFilters): Promise<CxcSummaryResult> {
  if (env.useMockData) {
    const totals: CxcSummaryTotals = {
      customers: 12,
      documents: 38,
      originalAmount: 184_500.75,
      balanceAmount: 92_340.5,
      overdueAmount: 24_850.25,
      dueNext7Amount: 12_400.0,
      dueNext30Amount: 18_950.0,
    };
    const byStatus: CxcSummaryStatusRow[] = [
      { status: "PENDIENTE", documents: 24, originalAmount: 110_000, balanceAmount: 82_000 },
      { status: "BORRADOR", documents: 6, originalAmount: 6_500, balanceAmount: 6_500 },
      { status: "PAGADO", documents: 8, originalAmount: 38_000, balanceAmount: 0 },
    ];
    const topCustomers: CxcSummaryTopCustomerRow[] = Array.from({ length: 5 }, (_, index) => {
      const outstanding = 18_000 - index * 1_250;
      const overdue = index % 2 === 0 ? outstanding * 0.35 : outstanding * 0.25;
      const creditLimit = 25_000 + index * 2_500;
      const creditUsed = outstanding + index * 600;
      const creditOnHold = 1_200 + index * 150;
      const available = Math.max(0, creditLimit - creditUsed - creditOnHold);
      return {
        customerId: index + 1,
        customerCode: `CLI-${100 + index}`,
        customerName: `Cliente Demo ${index + 1}`,
        documents: 4 + index,
        originalAmount: roundNumber(outstanding * 1.1),
        balanceAmount: roundNumber(outstanding),
        overdueAmount: roundNumber(overdue),
        creditLimit: roundNumber(creditLimit),
        creditUsed: roundNumber(creditUsed),
        creditOnHold: roundNumber(creditOnHold),
        availableCredit: roundNumber(available),
        creditStatus: index === 0 ? "ACTIVE" : index === 3 ? "ON_HOLD" : "ACTIVE",
      } satisfies CxcSummaryTopCustomerRow;
    });
    return {
      totals,
      byStatus,
      topCustomers,
      generatedAt: new Date().toISOString(),
    } satisfies CxcSummaryResult;
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = [
    "cd.document_date BETWEEN $1 AND $2",
    "cd.balance_amount > 0",
    "cd.status <> 'CANCELADO'",
  ];

  const documentTypes = sanitizeDocumentTypes(filters.documentTypes) ?? CXC_DEBIT_TYPES;
  params.push(documentTypes);
  conditions.push(`cd.document_type = ANY($${params.length}::text[])`);

  const statusFilter = sanitizeStatusFilter(filters.status ?? CXC_OPEN_STATUSES);
  if (statusFilter) {
    params.push(statusFilter);
    conditions.push(`cd.status = ANY($${params.length}::text[])`);
  }

  const customerTerm = sanitizeCustomerFilter(filters.customer);
  if (customerTerm) {
    params.push(customerTerm);
    const placeholder = `$${params.length}`;
    conditions.push(`(UPPER(c.code) LIKE ${placeholder} OR UPPER(c.name) LIKE ${placeholder} OR UPPER(COALESCE(c.tax_id, '')) LIKE ${placeholder})`);
  }

  const baseQuery = `
WITH open_docs AS (
  SELECT
    cd.id,
    cd.customer_id,
    cd.document_type,
    cd.document_number,
    cd.document_date,
    cd.due_date,
    COALESCE(cd.due_date, cd.document_date) AS due_date_effective,
    cd.original_amount,
    cd.balance_amount,
    cd.status,
    c.code AS customer_code,
    c.name AS customer_name,
    c.credit_limit,
    c.credit_used,
    c.credit_on_hold,
    c.credit_status
  FROM app.customer_documents cd
  INNER JOIN app.customers c ON c.id = cd.customer_id
  WHERE ${conditions.join(" AND ")}
)
` as const;

  const totalsResult = await query<{
    customers: number;
    documents: number;
    original_amount: number;
    balance_amount: number;
    overdue_amount: number;
    due_next_7: number;
    due_next_30: number;
  }>(
    `${baseQuery}
     SELECT
       COUNT(DISTINCT customer_id) AS customers,
       COUNT(*) AS documents,
       COALESCE(SUM(original_amount), 0) AS original_amount,
       COALESCE(SUM(balance_amount), 0) AS balance_amount,
       COALESCE(SUM(CASE WHEN due_date_effective < CURRENT_DATE THEN balance_amount ELSE 0 END), 0) AS overdue_amount,
       COALESCE(SUM(CASE WHEN due_date_effective >= CURRENT_DATE AND due_date_effective <= CURRENT_DATE + INTERVAL '7 day' THEN balance_amount ELSE 0 END), 0) AS due_next_7,
       COALESCE(SUM(CASE WHEN due_date_effective > CURRENT_DATE + INTERVAL '7 day' AND due_date_effective <= CURRENT_DATE + INTERVAL '30 day' THEN balance_amount ELSE 0 END), 0) AS due_next_30
     FROM open_docs`,
    params
  );

  const statusResult = await query<{
    status: CustomerDocumentStatus;
    documents: number;
    original_amount: number;
    balance_amount: number;
  }>(
    `${baseQuery}
     SELECT
       status,
       COUNT(*) AS documents,
       COALESCE(SUM(original_amount), 0) AS original_amount,
       COALESCE(SUM(balance_amount), 0) AS balance_amount
     FROM open_docs
     GROUP BY status
     ORDER BY status`,
    params
  );

  const topResult = await query<{
    customer_id: number;
    customer_code: string;
    customer_name: string;
    documents: number;
    original_amount: number;
    balance_amount: number;
    overdue_amount: number;
    credit_limit: number;
    credit_used: number;
    credit_on_hold: number;
    credit_status: string;
  }>(
    `${baseQuery}
     SELECT
       customer_id,
       customer_code,
       customer_name,
       COUNT(*) AS documents,
       COALESCE(SUM(original_amount), 0) AS original_amount,
       COALESCE(SUM(balance_amount), 0) AS balance_amount,
       COALESCE(SUM(CASE WHEN due_date_effective < CURRENT_DATE THEN balance_amount ELSE 0 END), 0) AS overdue_amount,
       MAX(credit_limit) AS credit_limit,
       MAX(credit_used) AS credit_used,
       MAX(credit_on_hold) AS credit_on_hold,
       MAX(credit_status) AS credit_status
     FROM open_docs
     GROUP BY customer_id, customer_code, customer_name
     ORDER BY balance_amount DESC
     LIMIT 15`,
    params
  );

  const totalsRow = totalsResult.rows[0] ?? {
    customers: 0,
    documents: 0,
    original_amount: 0,
    balance_amount: 0,
    overdue_amount: 0,
    due_next_7: 0,
    due_next_30: 0,
  };

  return {
    totals: {
      customers: Number(totalsRow.customers ?? 0),
      documents: Number(totalsRow.documents ?? 0),
      originalAmount: roundNumber(totalsRow.original_amount),
      balanceAmount: roundNumber(totalsRow.balance_amount),
      overdueAmount: roundNumber(totalsRow.overdue_amount),
      dueNext7Amount: roundNumber(totalsRow.due_next_7),
      dueNext30Amount: roundNumber(totalsRow.due_next_30),
    },
    byStatus: statusResult.rows.map((row) => ({
      status: row.status,
      documents: Number(row.documents ?? 0),
      originalAmount: roundNumber(row.original_amount),
      balanceAmount: roundNumber(row.balance_amount),
    })),
    topCustomers: topResult.rows.map((row) => {
      const creditLimit = roundNumber(row.credit_limit);
      const creditUsed = roundNumber(row.credit_used);
      const creditOnHold = roundNumber(row.credit_on_hold);
      const available = Math.max(0, creditLimit - creditUsed - creditOnHold);
      return {
        customerId: Number(row.customer_id),
        customerCode: row.customer_code,
        customerName: row.customer_name,
        documents: Number(row.documents ?? 0),
        originalAmount: roundNumber(row.original_amount),
        balanceAmount: roundNumber(row.balance_amount),
        overdueAmount: roundNumber(row.overdue_amount),
        creditLimit,
        creditUsed,
        creditOnHold,
        availableCredit: roundNumber(available),
        creditStatus: row.credit_status ?? "ACTIVE",
      } satisfies CxcSummaryTopCustomerRow;
    }),
    generatedAt: new Date().toISOString(),
  } satisfies CxcSummaryResult;
}

export async function getCxcDueAnalysisReport(filters: CxcDueAnalysisFilters): Promise<CxcDueAnalysisResult> {
  if (env.useMockData) {
    const buckets: CxcDueBucketRow[] = [
      { bucket: "OVERDUE", label: dueBucketLabelMap.OVERDUE, documents: 7, customers: 5, originalAmount: 25_000, balanceAmount: 18_400 },
      { bucket: "TODAY", label: dueBucketLabelMap.TODAY, documents: 3, customers: 3, originalAmount: 8_750, balanceAmount: 8_750 },
      { bucket: "DUE_7", label: dueBucketLabelMap.DUE_7, documents: 5, customers: 4, originalAmount: 12_430, balanceAmount: 12_430 },
      { bucket: "DUE_30", label: dueBucketLabelMap.DUE_30, documents: 4, customers: 4, originalAmount: 15_590, balanceAmount: 9_200 },
      { bucket: "DUE_60", label: dueBucketLabelMap.DUE_60, documents: 2, customers: 2, originalAmount: 7_800, balanceAmount: 5_200 },
      { bucket: "FUTURE", label: dueBucketLabelMap.FUTURE, documents: 6, customers: 6, originalAmount: 32_000, balanceAmount: 32_000 },
    ];
    const documents: CxcDueDocumentRow[] = Array.from({ length: 12 }, (_, index) => ({
      documentId: 500 + index,
      documentNumber: `FAC-2025-${1200 + index}`,
      customerId: 100 + (index % 3),
      customerCode: `CLI-${100 + (index % 3)}`,
      customerName: `Cliente Demo ${(index % 3) + 1}`,
      documentType: "INVOICE",
      documentDate: new Date(Date.parse(filters.from) + index * 86_400_000).toISOString(),
      dueDate: new Date(Date.parse(filters.from) + (index + 2) * 86_400_000).toISOString(),
      daysDelta: index - 4,
      originalAmount: 2_500 + index * 320,
      balanceAmount: 2_500 + index * 320,
      status: "PENDIENTE",
      paymentTermCode: "NET30",
    }));
    return { buckets, documents, generatedAt: new Date().toISOString() } satisfies CxcDueAnalysisResult;
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = [
    "cd.document_date BETWEEN $1 AND $2",
    "cd.balance_amount > 0",
    "cd.status <> 'CANCELADO'",
  ];

  params.push(CXC_DEBIT_TYPES);
  conditions.push(`cd.document_type = ANY($${params.length}::text[])`);

  const customerTerm = sanitizeCustomerFilter(filters.customer);
  if (customerTerm) {
    params.push(customerTerm);
    const placeholder = `$${params.length}`;
    conditions.push(`(UPPER(c.code) LIKE ${placeholder} OR UPPER(c.name) LIKE ${placeholder} OR UPPER(COALESCE(c.tax_id, '')) LIKE ${placeholder})`);
  }

  if (filters.includeFuture === false) {
    conditions.push("COALESCE(cd.due_date, cd.document_date) <= CURRENT_DATE");
  }

  const baseQuery = `
WITH open_docs AS (
  SELECT
    cd.id,
    cd.customer_id,
    cd.document_type,
    cd.document_number,
    cd.document_date,
    cd.due_date,
    COALESCE(cd.due_date, cd.document_date) AS due_date_effective,
    cd.original_amount,
    cd.balance_amount,
    cd.status,
    c.code AS customer_code,
    c.name AS customer_name,
    pt.code AS payment_term_code
  FROM app.customer_documents cd
  INNER JOIN app.customers c ON c.id = cd.customer_id
  LEFT JOIN app.payment_terms pt ON pt.id = cd.payment_term_id
  WHERE ${conditions.join(" AND ")}
)
` as const;

  const bucketResult = await query<{
    bucket: CxcDueBucketRow["bucket"];
    documents: number;
    customers: number;
    original_amount: number;
    balance_amount: number;
  }>(
    `${baseQuery}
     SELECT
       bucket,
       COUNT(*) AS documents,
       COUNT(DISTINCT customer_id) AS customers,
       COALESCE(SUM(original_amount), 0) AS original_amount,
       COALESCE(SUM(balance_amount), 0) AS balance_amount
     FROM (
       SELECT *,
         CASE
           WHEN due_date_effective < CURRENT_DATE THEN 'OVERDUE'
           WHEN due_date_effective = CURRENT_DATE THEN 'TODAY'
           WHEN due_date_effective <= CURRENT_DATE + INTERVAL '7 day' THEN 'DUE_7'
           WHEN due_date_effective <= CURRENT_DATE + INTERVAL '30 day' THEN 'DUE_30'
           WHEN due_date_effective <= CURRENT_DATE + INTERVAL '60 day' THEN 'DUE_60'
           ELSE 'FUTURE'
         END AS bucket
       FROM open_docs
     ) bucketed
     GROUP BY bucket
     ORDER BY bucket`,
    params
  );

  const documentsResult = await query<{
    id: number;
    document_number: string;
    customer_id: number;
    customer_code: string;
    customer_name: string;
    document_type: CustomerDocumentType;
    document_date: Date | string;
    due_date: Date | string;
    due_date_effective: Date | string;
    original_amount: number;
    balance_amount: number;
    status: CustomerDocumentStatus;
    payment_term_code: string | null;
  }>(
    `${baseQuery}
     SELECT
       id,
       document_number,
       customer_id,
       customer_code,
       customer_name,
       document_type,
       document_date,
       due_date,
       due_date_effective,
       original_amount,
       balance_amount,
       status,
       payment_term_code
     FROM open_docs
     ORDER BY due_date_effective ASC, balance_amount DESC
     LIMIT 100`,
    params
  );

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  return {
    buckets: bucketResult.rows.map((row) => ({
      bucket: row.bucket,
      label: dueBucketLabelMap[row.bucket],
      documents: Number(row.documents ?? 0),
      customers: Number(row.customers ?? 0),
      originalAmount: roundNumber(row.original_amount),
      balanceAmount: roundNumber(row.balance_amount),
    })),
    documents: documentsResult.rows.map((row) => {
      const dueDate = ensureIsoString(row.due_date_effective);
      const dueDateValue = new Date(dueDate);
      const diffMs = todayUtc.getTime() - dueDateValue.getTime();
      const daysDelta = Math.round(diffMs / 86_400_000);
      return {
        documentId: Number(row.id),
        documentNumber: row.document_number,
        customerId: Number(row.customer_id),
        customerCode: row.customer_code,
        customerName: row.customer_name,
        documentType: row.document_type,
        documentDate: ensureIsoString(row.document_date),
        dueDate,
        daysDelta,
        originalAmount: roundNumber(row.original_amount),
        balanceAmount: roundNumber(row.balance_amount),
        status: row.status,
        paymentTermCode: row.payment_term_code,
      } satisfies CxcDueDocumentRow;
    }),
    generatedAt: new Date().toISOString(),
  } satisfies CxcDueAnalysisResult;
}

export async function getCxcAgingReport(filters: CxcAgingFilters): Promise<CxcAgingResult> {
  if (env.useMockData) {
    const rows: CxcAgingRow[] = Array.from({ length: 6 }, (_, index) => ({
      customerId: index + 1,
      customerCode: `CLI-${120 + index}`,
      customerName: `Cliente Demo ${index + 1}`,
      documents: 3 + index,
      balanceAmount: 18_000 - index * 1_500,
      bucketCurrent: 3_500 + index * 420,
      bucket0To30: 4_200 - index * 180,
      bucket31To60: 3_300 - index * 250,
      bucket61To90: 2_600 - index * 320,
      bucket91To120: 2_100 - index * 210,
      bucket120Plus: 1_500 + index * 150,
      creditLimit: 25_000 + index * 2_000,
      creditStatus: index === 4 ? "ON_HOLD" : "ACTIVE",
    }));
    const totalsBalance = rows.reduce((acc, row) => acc + row.balanceAmount, 0);
    return {
      rows,
      totals: {
        balanceAmount: roundNumber(totalsBalance),
        customers: rows.length,
      },
      generatedAt: new Date().toISOString(),
    } satisfies CxcAgingResult;
  }

  const params: unknown[] = [filters.from, filters.to];
  const conditions: string[] = [
    "cd.document_date BETWEEN $1 AND $2",
    "cd.balance_amount > 0",
    "cd.status <> 'CANCELADO'",
  ];

  params.push(CXC_DEBIT_TYPES);
  conditions.push(`cd.document_type = ANY($${params.length}::text[])`);

  const customerTerm = sanitizeCustomerFilter(filters.customer);
  if (customerTerm) {
    params.push(customerTerm);
    const placeholder = `$${params.length}`;
    conditions.push(`(UPPER(c.code) LIKE ${placeholder} OR UPPER(c.name) LIKE ${placeholder} OR UPPER(COALESCE(c.tax_id, '')) LIKE ${placeholder})`);
  }

  const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
  params.push(limit);

  const queryResult = await query<{
    customer_id: number;
    customer_code: string;
    customer_name: string;
    documents: number;
    balance_amount: number;
    bucket_current: number;
    bucket_0_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_91_120: number;
    bucket_120_plus: number;
    credit_limit: number;
    credit_status: string;
  }>(
    `WITH open_docs AS (
       SELECT
         cd.id,
         cd.customer_id,
         cd.document_type,
         cd.document_number,
         cd.document_date,
         cd.due_date,
         COALESCE(cd.due_date, cd.document_date) AS due_date_effective,
         cd.balance_amount,
         c.code AS customer_code,
         c.name AS customer_name,
         c.credit_limit,
         c.credit_status
       FROM app.customer_documents cd
       INNER JOIN app.customers c ON c.id = cd.customer_id
       WHERE ${conditions.join(" AND ")}
     ), classified AS (
       SELECT
         customer_id,
         customer_code,
         customer_name,
         balance_amount,
         credit_limit,
         credit_status,
         CASE
           WHEN due_date_effective < CURRENT_DATE - INTERVAL '120 day' THEN '120_PLUS'
           WHEN due_date_effective < CURRENT_DATE - INTERVAL '90 day' THEN '91_120'
           WHEN due_date_effective < CURRENT_DATE - INTERVAL '60 day' THEN '61_90'
           WHEN due_date_effective < CURRENT_DATE - INTERVAL '30 day' THEN '31_60'
           WHEN due_date_effective < CURRENT_DATE THEN '0_30'
           ELSE 'CURRENT'
         END AS bucket
       FROM open_docs
     )
     SELECT
       customer_id,
       customer_code,
       customer_name,
       COUNT(*) AS documents,
       COALESCE(SUM(balance_amount), 0) AS balance_amount,
       COALESCE(SUM(CASE WHEN bucket = 'CURRENT' THEN balance_amount ELSE 0 END), 0) AS bucket_current,
       COALESCE(SUM(CASE WHEN bucket = '0_30' THEN balance_amount ELSE 0 END), 0) AS bucket_0_30,
       COALESCE(SUM(CASE WHEN bucket = '31_60' THEN balance_amount ELSE 0 END), 0) AS bucket_31_60,
       COALESCE(SUM(CASE WHEN bucket = '61_90' THEN balance_amount ELSE 0 END), 0) AS bucket_61_90,
       COALESCE(SUM(CASE WHEN bucket = '91_120' THEN balance_amount ELSE 0 END), 0) AS bucket_91_120,
       COALESCE(SUM(CASE WHEN bucket = '120_PLUS' THEN balance_amount ELSE 0 END), 0) AS bucket_120_plus,
       MAX(credit_limit) AS credit_limit,
       MAX(credit_status) AS credit_status
     FROM classified
     GROUP BY customer_id, customer_code, customer_name
     ORDER BY balance_amount DESC
     LIMIT $${params.length}`,
    params
  );

  const totals = queryResult.rows.reduce(
    (acc, row) => {
      acc.balanceAmount += Number(row.balance_amount ?? 0);
      acc.customers += 1;
      return acc;
    },
    { balanceAmount: 0, customers: 0 }
  );

  return {
    rows: queryResult.rows.map((row) => ({
      customerId: Number(row.customer_id),
      customerCode: row.customer_code,
      customerName: row.customer_name,
      documents: Number(row.documents ?? 0),
      balanceAmount: roundNumber(row.balance_amount),
      bucketCurrent: roundNumber(row.bucket_current),
      bucket0To30: roundNumber(row.bucket_0_30),
      bucket31To60: roundNumber(row.bucket_31_60),
      bucket61To90: roundNumber(row.bucket_61_90),
      bucket91To120: roundNumber(row.bucket_91_120),
      bucket120Plus: roundNumber(row.bucket_120_plus),
      creditLimit: roundNumber(row.credit_limit),
      creditStatus: row.credit_status ?? "ACTIVE",
    })),
    totals: {
      balanceAmount: roundNumber(totals.balanceAmount),
      customers: totals.customers,
    },
    generatedAt: new Date().toISOString(),
  } satisfies CxcAgingResult;
}

export async function getCxcStatementReport(filters: CxcStatementFilters): Promise<CxcStatementResult> {
  if (env.useMockData) {
    const customer: CxcStatementCustomerSummary = {
      id: 1,
      code: filters.customerCode ?? "CLI-100",
      name: "Cliente Demo",
      taxId: "J03123456",
      creditLimit: 50_000,
      creditUsed: 18_500,
      creditOnHold: 2_500,
      creditStatus: "ACTIVE",
      availableCredit: 29_000,
    };
    const openingBalance = 12_000;
    let running = openingBalance;
    const entries: CxcStatementEntry[] = [
      {
        entryId: "DOC-1",
        entryType: "DOCUMENT",
        documentType: "INVOICE",
        documentNumber: "FAC-001",
        description: "Factura",
        reference: null,
        eventDate: new Date(filters.from).toISOString(),
        dueDate: new Date(filters.to).toISOString(),
        debit: 8_500,
        credit: 0,
        balanceAfter: (running += 8_500),
        affectsBalance: true,
      },
      {
        entryId: "DOC-2",
        entryType: "DOCUMENT",
        documentType: "RECEIPT",
        documentNumber: "ROC-001",
        description: "Recibo",
        reference: "Transferencia 1234",
        eventDate: new Date(Date.parse(filters.from) + 2 * 86_400_000).toISOString(),
        dueDate: null,
        debit: 0,
        credit: 5_000,
        balanceAfter: (running -= 5_000),
        affectsBalance: true,
      },
      {
        entryId: "APP-1",
        entryType: "APPLICATION",
        description: "Aplicación de recibo ROC-001 a FAC-001",
        relatedDocumentNumber: "FAC-001",
        relatedDocumentType: "INVOICE",
        reference: "Pago parcial",
        eventDate: new Date(Date.parse(filters.from) + 3 * 86_400_000).toISOString(),
        dueDate: null,
        debit: 0,
        credit: 0,
        balanceAfter: running,
        affectsBalance: false,
      },
    ];
    return {
      customer,
      openingBalance,
      closingBalance: running,
      entries,
      generatedAt: new Date().toISOString(),
    } satisfies CxcStatementResult;
  }

  if (!filters.customerCode && typeof filters.customerId !== "number") {
    throw new Error("Se requiere customerCode o customerId para generar el estado de cuenta");
  }

  const customerLookupParams: unknown[] = [];
  const customerLookupConditions: string[] = [];

  if (typeof filters.customerId === "number") {
    customerLookupParams.push(filters.customerId);
    customerLookupConditions.push(`id = $${customerLookupParams.length}`);
  }

  if (filters.customerCode) {
    customerLookupParams.push(filters.customerCode.trim().toUpperCase());
    customerLookupConditions.push(`UPPER(code) = $${customerLookupParams.length}`);
  }

  const customerRow = await query<{
    id: number;
    code: string;
    name: string;
    tax_id: string | null;
    credit_limit: number;
    credit_used: number;
    credit_on_hold: number;
    credit_status: string;
  }>(
    `SELECT id, code, name, tax_id, credit_limit, credit_used, credit_on_hold, credit_status
     FROM app.customers
     WHERE ${customerLookupConditions.join(" OR ")}
     LIMIT 1`,
    customerLookupParams
  );

  const customer = customerRow.rows[0];
  if (!customer) {
    throw new Error("Cliente no encontrado para generar el estado de cuenta");
  }

  const customerId = Number(customer.id);
  const baseCustomerSummary: CxcStatementCustomerSummary = {
    id: customerId,
    code: customer.code,
    name: customer.name,
    taxId: customer.tax_id,
    creditLimit: roundNumber(customer.credit_limit),
    creditUsed: roundNumber(customer.credit_used),
    creditOnHold: roundNumber(customer.credit_on_hold),
    creditStatus: customer.credit_status ?? "ACTIVE",
    availableCredit: roundNumber(Math.max(0, Number(customer.credit_limit ?? 0) - Number(customer.credit_used ?? 0) - Number(customer.credit_on_hold ?? 0))),
  };

  const documentsParams: unknown[] = [customerId];
  const documentConditions: string[] = ["cd.customer_id = $1", "cd.status <> 'CANCELADO'"];

  if (filters.from) {
    documentsParams.push(filters.from);
    documentConditions.push(`cd.document_date >= $${documentsParams.length}`);
  }
  if (filters.to) {
    documentsParams.push(filters.to);
    documentConditions.push(`cd.document_date <= $${documentsParams.length}`);
  }

  const documentsResult = await query<{
    id: number;
    document_type: CustomerDocumentType;
    document_number: string;
    document_date: Date | string;
    due_date: Date | string | null;
    original_amount: number;
    balance_amount: number;
    status: CustomerDocumentStatus;
    reference: string | null;
    notes: string | null;
  }>(
    `SELECT id, document_type, document_number, document_date, due_date, original_amount, balance_amount, status, reference, notes
     FROM app.customer_documents cd
     WHERE ${documentConditions.join(" AND ")}
     ORDER BY document_date ASC, id ASC`,
    documentsParams
  );

  const includeApplications = filters.includeApplications !== false;
  let applicationsRows: Array<{
    id: number;
    application_date: Date | string;
    amount: number;
    reference: string | null;
    notes: string | null;
    applied_number: string;
    applied_type: CustomerDocumentType;
    target_number: string;
    target_type: CustomerDocumentType;
  }> = [];

  if (includeApplications) {
    const appParams: unknown[] = [customerId];
    const appConditions: string[] = ["(applied.customer_id = $1 OR target.customer_id = $1)"];
    if (filters.from) {
      appParams.push(filters.from);
      appConditions.push(`app.application_date::date >= $${appParams.length}`);
    }
    if (filters.to) {
      appParams.push(filters.to);
      appConditions.push(`app.application_date::date <= $${appParams.length}`);
    }

    const appsResult = await query<{
      id: number;
      application_date: Date | string;
      amount: number;
      reference: string | null;
      notes: string | null;
      applied_number: string;
      applied_type: CustomerDocumentType;
      target_number: string;
      target_type: CustomerDocumentType;
    }>(
      `SELECT
         app.id,
         app.application_date,
         app.amount,
         app.reference,
         app.notes,
         applied.document_number AS applied_number,
         applied.document_type AS applied_type,
         target.document_number AS target_number,
         target.document_type AS target_type
       FROM app.customer_document_applications app
       INNER JOIN app.customer_documents applied ON applied.id = app.applied_document_id
       INNER JOIN app.customer_documents target ON target.id = app.target_document_id
       WHERE ${appConditions.join(" AND ")}
       ORDER BY app.application_date ASC, app.id ASC`,
      appParams
    );
    applicationsRows = appsResult.rows;
  }

  let openingBalance = 0;
  if (filters.from) {
    const openingResult = await query<{
      debit_total: number;
      credit_total: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN document_type = ANY($2::text[]) THEN original_amount ELSE 0 END), 0) AS debit_total,
         COALESCE(SUM(CASE WHEN document_type = ANY($3::text[]) THEN original_amount ELSE 0 END), 0) AS credit_total
       FROM app.customer_documents
       WHERE customer_id = $1
         AND status <> 'CANCELADO'
         AND document_date < $4`,
      [customerId, CXC_DEBIT_TYPES, CXC_CREDIT_TYPES, filters.from]
    );
    const row = openingResult.rows[0];
    openingBalance = roundNumber((row?.debit_total ?? 0) - (row?.credit_total ?? 0));
  }

  type StatementEvent = {
    sortKey: string;
    eventDate: string;
    affectsBalance: boolean;
    debit: number;
    credit: number;
    buildEntry: (balance: number) => CxcStatementEntry;
  };

  const events: StatementEvent[] = [];

  for (const doc of documentsResult.rows) {
    const eventDate = ensureIsoString(doc.document_date);
    const dueDate = doc.due_date ? ensureIsoString(doc.due_date) : null;
    const isDebit = CXC_DEBIT_TYPES.includes(doc.document_type);
    const debit = isDebit ? roundNumber(doc.original_amount) : 0;
    const credit = isDebit ? 0 : roundNumber(doc.original_amount);
    const description = CXC_DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type;
    const reference = doc.reference ?? doc.notes ?? null;
    events.push({
      sortKey: `${eventDate}-DOC-${String(doc.id).padStart(6, "0")}`,
      eventDate,
      affectsBalance: true,
      debit,
      credit,
      buildEntry: (balance) => ({
        entryId: `DOC-${doc.id}`,
        entryType: "DOCUMENT",
        documentType: doc.document_type,
        documentNumber: doc.document_number,
        description,
        reference,
        eventDate,
        dueDate,
        debit,
        credit,
        balanceAfter: roundNumber(balance),
        affectsBalance: true,
      }),
    });
  }

  for (const app of applicationsRows) {
    const eventDate = ensureIsoString(app.application_date);
    const description = `Aplicación de ${app.applied_number} a ${app.target_number}`;
    events.push({
      sortKey: `${eventDate}-APP-${String(app.id).padStart(6, "0")}`,
      eventDate,
      affectsBalance: false,
      debit: 0,
      credit: 0,
      buildEntry: (balance) => ({
        entryId: `APP-${app.id}`,
        entryType: "APPLICATION",
        description,
        relatedDocumentNumber: app.target_number,
        relatedDocumentType: app.target_type,
        reference: app.reference ?? app.notes ?? null,
        eventDate,
        dueDate: null,
        debit: 0,
        credit: 0,
        balanceAfter: roundNumber(balance),
        affectsBalance: false,
      }),
    });
  }

  events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));

  let runningBalance = openingBalance;
  const entries: CxcStatementEntry[] = [];
  for (const event of events) {
    if (event.affectsBalance) {
      runningBalance = roundNumber(runningBalance + event.debit - event.credit);
    }
    entries.push(event.buildEntry(runningBalance));
  }

  return {
    customer: baseCustomerSummary,
    openingBalance,
    closingBalance: runningBalance,
    entries,
    generatedAt: new Date().toISOString(),
  } satisfies CxcStatementResult;
}
