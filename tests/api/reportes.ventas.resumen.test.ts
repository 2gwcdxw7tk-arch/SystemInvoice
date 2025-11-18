import { GET as SalesSummaryGET } from '@/app/api/reportes/ventas/resumen/route';

// Mock de acceso (evitar permisos reales)
jest.mock('@/lib/auth/access', () => ({
  requireFacturacionAccess: async () => ({ userId: 1 })
}));

// Mock servicio de reportes
jest.mock('@/lib/services/ReportService', () => {
  const actual = jest.requireActual('@/lib/services/ReportService');
  return {
    ...actual,
    reportService: {
      getSalesSummary: jest.fn(async () => ({
        totals: { invoices: 2, subtotal: 100, serviceCharge: 0, vat: 16, total: 116, averageTicket: 58 },
        payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 56 }],
        byDay: [{ date: '2025-11-16', invoices: 1, total: 50 }, { date: '2025-11-17', invoices: 1, total: 66 }],
      })),
      renderSalesSummaryHtml: jest.fn((filters, data) => `<!doctype html><html><body><h1>Reporte de Ventas</h1></body></html>`),
    },
  };
});

describe('GET /api/reportes/ventas/resumen', () => {
  const baseUrl = 'http://localhost/api/reportes/ventas/resumen';

  it('returns JSON with success', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17`;
    const req = new Request(url);
    // @ts-expect-error NextRequest compatible shape
    const res = await SalesSummaryGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report?.totals?.total).toBeDefined();
  });

  it('returns HTML when format=html', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&format=html`;
    const req = new Request(url);
    // @ts-expect-error NextRequest compatible shape
    const res = await SalesSummaryGET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<html');
    expect(text).toContain('Reporte de Ventas');
    expect(res.headers.get('content-type') || '').toContain('text/html');
  });

  it('400 when missing params', async () => {
    const req = new Request(baseUrl);
    // @ts-expect-error NextRequest compatible shape
    const res = await SalesSummaryGET(req);
    expect(res.status).toBe(400);
  });
});
