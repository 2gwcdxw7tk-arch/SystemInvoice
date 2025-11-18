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
}

export const reportService = new ReportService();
