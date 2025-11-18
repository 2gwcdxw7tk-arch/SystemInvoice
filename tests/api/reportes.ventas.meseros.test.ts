import { GET as WaitersGET } from '@/app/api/reportes/ventas/meseros/route';

jest.mock('@/lib/auth/access', () => ({
  requireFacturacionAccess: async () => ({ userId: 1 })
}));

jest.mock('@/lib/services/ReportService', () => {
  const actual = jest.requireActual('@/lib/services/ReportService');
  return {
    ...actual,
    reportService: {
      getWaiterPerformance: jest.fn(async () => ([{ waiterCode: 'W-01', waiterName: 'Juan', invoices: 3, totalSales: 120, averageTicket: 40, serviceCharge: 0, lastSaleAt: new Date().toISOString() }])),
      renderWaiterPerformanceHtml: jest.fn(() => '<html><body>Meseros</body></html>'),
    },
  };
});

describe('GET /api/reportes/ventas/meseros', () => {
  const baseUrl = 'http://localhost/api/reportes/ventas/meseros';

  it('returns JSON', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17`;
    // @ts-expect-error NextRequest compatible shape
    const res = await WaitersGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('returns HTML with format=html', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&format=html`;
    // @ts-expect-error NextRequest compatible shape
    const res = await WaitersGET(new Request(url));
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '')).toContain('text/html');
  });
});
