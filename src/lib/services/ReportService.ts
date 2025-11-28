import "server-only";

import {
  IReportRepository,
  ReportRepository,
  SalesSummaryFilters,
  SalesSummaryResult,
  WaiterPerformanceFilters,
  WaiterPerformanceRow,
  TopItemsFilters,
  TopItemRow,
  InventoryMovementsFilters,
  InventoryMovementsResult,
  PurchasesReportFilters,
  PurchasesReportRow,
  InvoiceStatusFilters,
  InvoiceStatusResult,
  CxcSummaryFilters,
  CxcSummaryResult,
  CxcDueAnalysisFilters,
  CxcDueAnalysisResult,
  CxcAgingFilters,
  CxcAgingResult,
  CxcStatementFilters,
  CxcStatementResult,
} from "@/lib/repositories/reports/ReportRepository";

function formatMoney(value: number, currency = "MXN") {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value ?? 0);
  } catch {
    return `${value?.toFixed?.(2) ?? value} ${currency}`;
  }
}

function baseHtml(title: string, body: string, styles?: string) {
  return `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;line-height:1.35;margin:24px;color:#111}
      h1{font-size:20px;margin:0 0 8px}
      h2{font-size:16px;margin:16px 0 8px}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;text-align:left}
      th{background:#f3f4f6;font-weight:600}
      tfoot td{font-weight:600}
      .meta{color:#4b5563;font-size:12px;margin-bottom:12px}
      .right{text-align:right}
      ${styles ?? ""}
    </style>
  </head>
  <body>
    ${body}
  </body>
  </html>`;
}

export class ReportService {
  constructor(private repo: IReportRepository = new ReportRepository()) {}

  // Data methods
  getSalesSummary(filters: SalesSummaryFilters): Promise<SalesSummaryResult> {
    return this.repo.getSalesSummary(filters);
  }
  getWaiterPerformance(filters: WaiterPerformanceFilters): Promise<WaiterPerformanceRow[]> {
    return this.repo.getWaiterPerformance(filters);
  }
  getTopItems(filters: TopItemsFilters): Promise<TopItemRow[]> {
    return this.repo.getTopItems(filters);
  }
  getInventoryMovements(filters: InventoryMovementsFilters): Promise<InventoryMovementsResult> {
    return this.repo.getInventoryMovements(filters);
  }
  getPurchases(filters: PurchasesReportFilters): Promise<PurchasesReportRow[]> {
    return this.repo.getPurchases(filters);
  }
  getInvoiceStatus(filters: InvoiceStatusFilters): Promise<InvoiceStatusResult> {
    return this.repo.getInvoiceStatus(filters);
  }
  getCxcSummary(filters: CxcSummaryFilters): Promise<CxcSummaryResult> {
    return this.repo.getCxcSummary(filters);
  }
  getCxcDueAnalysis(filters: CxcDueAnalysisFilters): Promise<CxcDueAnalysisResult> {
    return this.repo.getCxcDueAnalysis(filters);
  }
  getCxcAging(filters: CxcAgingFilters): Promise<CxcAgingResult> {
    return this.repo.getCxcAging(filters);
  }
  getCxcStatement(filters: CxcStatementFilters): Promise<CxcStatementResult> {
    return this.repo.getCxcStatement(filters);
  }

  // HTML renderers
  renderSalesSummaryHtml(filters: SalesSummaryFilters, data: SalesSummaryResult): string {
    const title = `Reporte de Ventas (${filters.from} a ${filters.to})`;
    const paymentsRows = data.payments
      .map((p) => `<tr><td>${p.method}</td><td class="right">${formatMoney(p.amount)}</td></tr>`) //
      .join("");
    const byDayRows = data.byDay
      .map(
        (d) => `<tr><td>${new Date(d.date).toLocaleDateString("es-MX")}</td><td class="right">${d.invoices}</td><td class="right">${formatMoney(d.total)}</td></tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <h2>Totales</h2>
      <table>
        <tbody>
          <tr><td>Facturas</td><td class="right">${data.totals.invoices}</td></tr>
          <tr><td>Subtotal</td><td class="right">${formatMoney(data.totals.subtotal)}</td></tr>
          <tr><td>Servicio</td><td class="right">${formatMoney(data.totals.serviceCharge)}</td></tr>
          <tr><td>IVA</td><td class="right">${formatMoney(data.totals.vat)}</td></tr>
          <tr><td>Total</td><td class="right">${formatMoney(data.totals.total)}</td></tr>
          <tr><td>Ticket promedio</td><td class="right">${formatMoney(data.totals.averageTicket)}</td></tr>
        </tbody>
      </table>
      <h2>Pagos</h2>
      <table><thead><tr><th>Método</th><th class="right">Monto</th></tr></thead><tbody>${paymentsRows}</tbody></table>
      <h2>Por día</h2>
      <table><thead><tr><th>Fecha</th><th class="right">Facturas</th><th class="right">Total</th></tr></thead><tbody>${byDayRows}</tbody></table>
    `;
    return baseHtml(title, body);
  }

  renderWaiterPerformanceHtml(filters: WaiterPerformanceFilters, rows: WaiterPerformanceRow[]): string {
    const title = `Desempeño por Mesero (${filters.from} a ${filters.to})`;
    const bodyRows = rows
      .map(
        (r) => `<tr>
          <td>${r.waiterCode ?? "-"}</td>
          <td>${r.waiterName}</td>
          <td class="right">${r.invoices}</td>
          <td class="right">${formatMoney(r.totalSales)}</td>
          <td class="right">${formatMoney(r.averageTicket)}</td>
          <td class="right">${formatMoney(r.serviceCharge)}</td>
          <td>${r.lastSaleAt ? new Date(r.lastSaleAt).toLocaleString("es-MX") : "-"}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <table>
        <thead><tr>
          <th>Código</th><th>Mesero</th><th class="right">Facturas</th><th class="right">Ventas</th><th class="right">Ticket Prom.</th><th class="right">Servicio</th><th>Últ. venta</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderTopItemsHtml(filters: TopItemsFilters, rows: TopItemRow[]): string {
    const title = `Artículos Top (${filters.from} a ${filters.to})`;
    const bodyRows = rows
      .map(
        (r, idx) => `<tr>
          <td>${idx + 1}</td>
          <td>${r.description}</td>
          <td class="right">${r.quantity}</td>
          <td class="right">${formatMoney(r.averagePrice)}</td>
          <td class="right">${formatMoney(r.total)}</td>
          <td>${r.firstSaleAt ? new Date(r.firstSaleAt).toLocaleDateString("es-MX") : "-"}</td>
          <td>${r.lastSaleAt ? new Date(r.lastSaleAt).toLocaleDateString("es-MX") : "-"}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <table>
        <thead><tr>
          <th>#</th><th>Artículo</th><th class="right">Cantidad</th><th class="right">Precio Prom.</th><th class="right">Total</th><th>Primera venta</th><th>Última venta</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderInventoryMovementsHtml(filters: InventoryMovementsFilters, data: InventoryMovementsResult): string {
    const title = `Movimientos de Inventario (${filters.from} a ${filters.to})`;
    const rows = data.summary
      .map(
        (r) => `<tr>
          <td>${r.transactionType}</td>
          <td class="right">${r.entriesRetail}</td>
          <td class="right">${r.exitsRetail}</td>
          <td class="right">${r.netRetail}</td>
          <td class="right">${r.entriesStorage}</td>
          <td class="right">${r.exitsStorage}</td>
          <td class="right">${r.netStorage}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <table>
        <thead><tr>
          <th>Tipo</th><th class="right">Entradas (det.)</th><th class="right">Salidas (det.)</th><th class="right">Neto (det.)</th>
          <th class="right">Entradas (alm.)</th><th class="right">Salidas (alm.)</th><th class="right">Neto (alm.)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">Totales Neto</td>
          <td class="right">${data.totals.netRetail}</td>
          <td colspan="2"></td>
          <td class="right">${data.totals.netStorage}</td>
        </tr></tfoot>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderPurchasesHtml(filters: PurchasesReportFilters, rows: PurchasesReportRow[]): string {
    const title = `Compras (${filters.from} a ${filters.to})`;
    const bodyRows = rows
      .map(
        (r) => `<tr>
          <td>${r.supplierName}</td>
          <td class="right">${r.purchases}</td>
          <td class="right">${formatMoney(r.totalAmount)}</td>
          <td class="right">${formatMoney(r.pendingAmount)}</td>
          <td class="right">${formatMoney(r.partialAmount)}</td>
          <td class="right">${formatMoney(r.paidAmount)}</td>
          <td class="right">${formatMoney(r.averageTicket)}</td>
          <td>${r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toLocaleString("es-MX") : "-"}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <table>
        <thead><tr>
          <th>Proveedor</th><th class="right">Compras</th><th class="right">Total</th><th class="right">Pendiente</th><th class="right">Parcial</th><th class="right">Pagado</th><th class="right">Ticket Prom.</th><th>Últ. compra</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderInvoiceStatusHtml(filters: InvoiceStatusFilters, data: InvoiceStatusResult): string {
    const title = `Estado de Facturación (${filters.from} a ${filters.to})`;
    const summaryRows = data.summary
      .map(
        (s) => `<tr>
          <td>${s.status}</td>
          <td class="right">${s.invoices}</td>
          <td class="right">${formatMoney(s.totalAmount)}</td>
          <td class="right">${formatMoney(s.paidAmount)}</td>
          <td class="right">${formatMoney(s.balance)}</td>
        </tr>`
      )
      .join("");
    const pendingRows = data.topPending
      .map(
        (r) => `<tr>
          <td>${r.invoiceNumber}</td>
          <td>${r.customerName ?? "-"}</td>
          <td>${r.waiterCode ?? "-"}</td>
          <td>${new Date(r.createdAt).toLocaleString("es-MX")}</td>
          <td class="right">${formatMoney(r.totalAmount)}</td>
          <td class="right">${formatMoney(r.paidAmount)}</td>
          <td class="right">${formatMoney(r.balance)}</td>
          <td>${r.status}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date().toLocaleString("es-MX")}</div>
      <h2>Resumen</h2>
      <table>
        <thead><tr>
          <th>Estatus</th><th class="right">Facturas</th><th class="right">Total</th><th class="right">Pagado</th><th class="right">Saldo</th>
        </tr></thead>
        <tbody>${summaryRows}</tbody>
      </table>
      <h2>Pendientes principales</h2>
      <table>
        <thead><tr>
          <th>Folio</th><th>Cliente</th><th>Mesero</th><th>Fecha</th><th class="right">Total</th><th class="right">Pagado</th><th class="right">Saldo</th><th>Estatus</th>
        </tr></thead>
        <tbody>${pendingRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderCxcSummaryHtml(filters: CxcSummaryFilters, data: CxcSummaryResult): string {
    const title = `CxC - Resumen (${filters.from} a ${filters.to})`;
    const statusRows = data.byStatus
      .map(
        (row) => `<tr>
          <td>${row.status}</td>
          <td class="right">${row.documents}</td>
          <td class="right">${formatMoney(row.originalAmount)}</td>
          <td class="right">${formatMoney(row.balanceAmount)}</td>
        </tr>`
      )
      .join("");
    const topRows = data.topCustomers
      .map(
        (row, index) => `<tr>
          <td>${index + 1}</td>
          <td>${row.customerCode}</td>
          <td>${row.customerName}</td>
          <td class="right">${row.documents}</td>
          <td class="right">${formatMoney(row.originalAmount)}</td>
          <td class="right">${formatMoney(row.balanceAmount)}</td>
          <td class="right">${formatMoney(row.overdueAmount)}</td>
          <td class="right">${formatMoney(row.availableCredit)}</td>
          <td>${row.creditStatus}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date(data.generatedAt).toLocaleString("es-MX")}</div>
      <h2>Totales</h2>
      <table>
        <tbody>
          <tr><td>Clientes</td><td class="right">${data.totals.customers}</td></tr>
          <tr><td>Documentos</td><td class="right">${data.totals.documents}</td></tr>
          <tr><td>Monto original</td><td class="right">${formatMoney(data.totals.originalAmount)}</td></tr>
          <tr><td>Saldo</td><td class="right">${formatMoney(data.totals.balanceAmount)}</td></tr>
          <tr><td>Vencido</td><td class="right">${formatMoney(data.totals.overdueAmount)}</td></tr>
          <tr><td>Vence en 7 días</td><td class="right">${formatMoney(data.totals.dueNext7Amount)}</td></tr>
          <tr><td>Vence en 30 días</td><td class="right">${formatMoney(data.totals.dueNext30Amount)}</td></tr>
        </tbody>
      </table>
      <h2>Por estatus</h2>
      <table>
        <thead><tr>
          <th>Estatus</th><th class="right">Documentos</th><th class="right">Monto original</th><th class="right">Saldo</th>
        </tr></thead>
        <tbody>${statusRows}</tbody>
      </table>
      <h2>Top clientes por saldo</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Código</th><th>Cliente</th><th class="right">Documentos</th><th class="right">Monto original</th><th class="right">Saldo</th><th class="right">Vencido</th><th class="right">Crédito disp.</th><th>Estatus crédito</th>
        </tr></thead>
        <tbody>${topRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderCxcDueAnalysisHtml(filters: CxcDueAnalysisFilters, data: CxcDueAnalysisResult): string {
    const title = `CxC - Análisis de Vencimientos (${filters.from} a ${filters.to})`;
    const bucketRows = data.buckets
      .map(
        (bucket) => `<tr>
          <td>${bucket.label}</td>
          <td class="right">${bucket.documents}</td>
          <td class="right">${bucket.customers}</td>
          <td class="right">${formatMoney(bucket.originalAmount)}</td>
          <td class="right">${formatMoney(bucket.balanceAmount)}</td>
        </tr>`
      )
      .join("");
    const documentRows = data.documents
      .map(
        (doc) => `<tr>
          <td>${doc.documentNumber}</td>
          <td>${doc.customerCode}</td>
          <td>${doc.customerName}</td>
          <td>${doc.documentType}</td>
          <td>${new Date(doc.documentDate).toLocaleDateString("es-MX")}</td>
          <td>${new Date(doc.dueDate).toLocaleDateString("es-MX")}</td>
          <td class="right">${doc.daysDelta}</td>
          <td class="right">${formatMoney(doc.originalAmount)}</td>
          <td class="right">${formatMoney(doc.balanceAmount)}</td>
          <td>${doc.status}</td>
          <td>${doc.paymentTermCode ?? "-"}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date(data.generatedAt).toLocaleString("es-MX")}</div>
      <h2>Resumen por bucket</h2>
      <table>
        <thead><tr>
          <th>Rango</th><th class="right">Documentos</th><th class="right">Clientes</th><th class="right">Monto original</th><th class="right">Saldo</th>
        </tr></thead>
        <tbody>${bucketRows}</tbody>
      </table>
      <h2>Documentos destacados</h2>
      <table>
        <thead><tr>
          <th>Documento</th><th>Cliente</th><th>Nombre</th><th>Tipo</th><th>Fecha</th><th>Vencimiento</th><th class="right">Días vencido</th><th class="right">Monto</th><th class="right">Saldo</th><th>Estatus</th><th>Término</th>
        </tr></thead>
        <tbody>${documentRows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderCxcAgingHtml(filters: CxcAgingFilters, data: CxcAgingResult): string {
    const title = `CxC - Antigüedad de saldos (${filters.from} a ${filters.to})`;
    const rows = data.rows
      .map(
        (row, index) => `<tr>
          <td>${index + 1}</td>
          <td>${row.customerCode}</td>
          <td>${row.customerName}</td>
          <td class="right">${row.documents}</td>
          <td class="right">${formatMoney(row.balanceAmount)}</td>
          <td class="right">${formatMoney(row.bucketCurrent)}</td>
          <td class="right">${formatMoney(row.bucket0To30)}</td>
          <td class="right">${formatMoney(row.bucket31To60)}</td>
          <td class="right">${formatMoney(row.bucket61To90)}</td>
          <td class="right">${formatMoney(row.bucket91To120)}</td>
          <td class="right">${formatMoney(row.bucket120Plus)}</td>
          <td class="right">${formatMoney(row.creditLimit)}</td>
          <td>${row.creditStatus}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date(data.generatedAt).toLocaleString("es-MX")}</div>
      <h2>Resumen</h2>
      <table>
        <tbody>
          <tr><td>Clientes</td><td class="right">${data.totals.customers}</td></tr>
          <tr><td>Saldo total</td><td class="right">${formatMoney(data.totals.balanceAmount)}</td></tr>
        </tbody>
      </table>
      <h2>Detalle</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Código</th><th>Cliente</th><th class="right">Docs</th><th class="right">Saldo</th><th class="right">Vigente</th><th class="right">0-30</th><th class="right">31-60</th><th class="right">61-90</th><th class="right">91-120</th><th class="right">120+</th><th class="right">Límite crédito</th><th>Estatus crédito</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }

  renderCxcStatementHtml(filters: CxcStatementFilters, data: CxcStatementResult): string {
    const title = `CxC - Estado de cuenta (${filters.from} a ${filters.to})`;
    const entries = data.entries
      .map(
        (entry) => `<tr>
          <td>${entry.eventDate ? new Date(entry.eventDate).toLocaleString("es-MX") : "-"}</td>
          <td>${entry.entryType}</td>
          <td>${entry.documentNumber ?? entry.relatedDocumentNumber ?? "-"}</td>
          <td>${entry.description}</td>
          <td>${entry.dueDate ? new Date(entry.dueDate).toLocaleDateString("es-MX") : "-"}</td>
          <td class="right">${formatMoney(entry.debit)}</td>
          <td class="right">${formatMoney(entry.credit)}</td>
          <td class="right">${formatMoney(entry.balanceAfter)}</td>
        </tr>`
      )
      .join("");
    const body = `
      <h1>${title}</h1>
      <div class="meta">Generado: ${new Date(data.generatedAt).toLocaleString("es-MX")}</div>
      <h2>Cliente</h2>
      <table>
        <tbody>
          <tr><td>Código</td><td>${data.customer.code}</td></tr>
          <tr><td>Nombre</td><td>${data.customer.name}</td></tr>
          <tr><td>Identificación</td><td>${data.customer.taxId ?? "-"}</td></tr>
          <tr><td>Límite de crédito</td><td class="right">${formatMoney(data.customer.creditLimit)}</td></tr>
          <tr><td>Disponible</td><td class="right">${formatMoney(data.customer.availableCredit)}</td></tr>
          <tr><td>Estatus crédito</td><td>${data.customer.creditStatus}</td></tr>
        </tbody>
      </table>
      <h2>Resumen</h2>
      <table>
        <tbody>
          <tr><td>Saldo inicial</td><td class="right">${formatMoney(data.openingBalance)}</td></tr>
          <tr><td>Saldo final</td><td class="right">${formatMoney(data.closingBalance)}</td></tr>
        </tbody>
      </table>
      <h2>Movimientos</h2>
      <table>
        <thead><tr>
          <th>Fecha</th><th>Tipo</th><th>Documento</th><th>Descripción</th><th>Vencimiento</th><th class="right">Débito</th><th class="right">Crédito</th><th class="right">Saldo</th>
        </tr></thead>
        <tbody>${entries}</tbody>
      </table>
    `;
    return baseHtml(title, body);
  }
}

export const reportService = new ReportService();
