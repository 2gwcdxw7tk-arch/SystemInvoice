import { GET as ComprasGET } from '@/app/api/reportes/compras/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 })
}));

jest.mock('@/lib/services/ReportService', () => {
  const actual = jest.requireActual('@/lib/services/ReportService');
  return {
    ...actual,
    reportService: {
      getPurchases: jest.fn(async () => ([{
        supplierName: 'Proveedor Demo',
        purchases: 3,
        totalAmount: 900,
        pendingAmount: 100,
        partialAmount: 200,
        paidAmount: 600,
        averageTicket: 300,
        lastPurchaseAt: new Date().toISOString(),
      }])),
      renderPurchasesHtml: jest.fn(() => '<html><body>Reporte Compras</body></html>'),
    },
  };
});

describe('GET /api/reportes/compras', () => {
  const baseUrl = 'http://localhost/api/reportes/compras';

  it('JSON ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&status=PENDIENTE`;
    // @ts-expect-error NextRequest compatible
    const res = await ComprasGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('HTML ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&format=html`;
    // @ts-expect-error NextRequest compatible
    const res = await ComprasGET(new Request(url));
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '').toLowerCase()).toContain('text/html');
  });
});
