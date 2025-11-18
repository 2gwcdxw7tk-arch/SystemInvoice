import { ReportService } from '@/lib/services/ReportService';
import type {
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
} from '@/lib/repositories/reports/ReportRepository';

describe('ReportService HTML renderers', () => {
  const service = new ReportService({} as any);

  it('renders sales summary HTML', () => {
    const filters: SalesSummaryFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const data: SalesSummaryResult = {
      totals: { invoices: 3, subtotal: 100, serviceCharge: 10, vat: 15, total: 125, averageTicket: 41.67 },
      payments: [{ method: 'CASH', amount: 80 }, { method: 'CARD', amount: 45 }],
      byDay: [{ date: '2025-01-01', invoices: 1, total: 30 }, { date: '2025-01-02', invoices: 2, total: 95 }],
    } as any;

    const html = service.renderSalesSummaryHtml(filters, data);
    expect(html).toContain('Reporte de Ventas');
    expect(html).toContain('CASH');
    expect(html).toContain('CARD');
    expect(html).toContain('Ticket promedio');
  });

  it('renders waiter performance HTML', () => {
    const filters: WaiterPerformanceFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const rows: WaiterPerformanceRow[] = [
      { waiterCode: 'W-01', waiterName: 'Juan', invoices: 5, totalSales: 500, averageTicket: 100, serviceCharge: 50, lastSaleAt: new Date().toISOString() },
    ] as any;

    const html = service.renderWaiterPerformanceHtml(filters, rows);
    expect(html).toContain('Desempeño por Mesero');
    expect(html).toContain('Juan');
    expect(html).toContain('W-01');
  });

  it('renders top items HTML', () => {
    const filters: TopItemsFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const rows: TopItemRow[] = [
      { description: 'Café', quantity: 10, averagePrice: 2.5, total: 25, firstSaleAt: '2025-01-01', lastSaleAt: '2025-01-31' },
    ] as any;

    const html = service.renderTopItemsHtml(filters, rows);
    expect(html).toContain('Artículos Top');
    expect(html).toContain('Café');
  });

  it('renders inventory movements HTML', () => {
    const filters: InventoryMovementsFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const data: InventoryMovementsResult = {
      summary: [
        {
          transactionType: 'VENTA',
          entriesRetail: 0,
          exitsRetail: 10,
          netRetail: -10,
          entriesStorage: 0,
          exitsStorage: 0,
          netStorage: 0,
        },
      ],
      totals: { netRetail: -10, netStorage: 0 },
    } as any;

    const html = service.renderInventoryMovementsHtml(filters, data);
    expect(html).toContain('Movimientos de Inventario');
    expect(html).toContain('VENTA');
  });

  it('renders purchases HTML', () => {
    const filters: PurchasesReportFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const rows: PurchasesReportRow[] = [
      { supplierName: 'Proveedor X', purchases: 3, totalAmount: 100, pendingAmount: 0, partialAmount: 0, paidAmount: 100, averageTicket: 33.33, lastPurchaseAt: new Date().toISOString() },
    ] as any;

    const html = service.renderPurchasesHtml(filters, rows);
    expect(html).toContain('Compras');
    expect(html).toContain('Proveedor X');
  });

  it('renders invoice status HTML', () => {
    const filters: InvoiceStatusFilters = { from: '2025-01-01', to: '2025-01-31' } as any;
    const data: InvoiceStatusResult = {
      summary: [{ status: 'PAGADA', invoices: 2, totalAmount: 100, paidAmount: 100, balance: 0 }],
      topPending: [
        {
          invoiceNumber: 'INV-001',
          customerName: 'Cliente A',
          waiterCode: 'W-01',
          createdAt: new Date().toISOString(),
          totalAmount: 50,
          paidAmount: 20,
          balance: 30,
          status: 'PENDIENTE',
        },
      ],
    } as any;

    const html = service.renderInvoiceStatusHtml(filters, data);
    expect(html).toContain('Estado de Facturación');
    expect(html).toContain('INV-001');
    expect(html).toContain('PENDIENTE');
  });
});
