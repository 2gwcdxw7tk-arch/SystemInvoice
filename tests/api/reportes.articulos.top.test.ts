import { GET as TopGET } from '@/app/api/reportes/articulos/top/route';

jest.mock('@/lib/auth/access', () => ({
  requireFacturacionAccess: async () => ({ userId: 1 })
}));

jest.mock('@/lib/services/ReportService', () => {
  const actual = jest.requireActual('@/lib/services/ReportService');
  return {
    ...actual,
    reportService: {
      getTopItems: jest.fn(async () => ([{ description: 'Item A', quantity: 5, total: 500, averagePrice: 100, firstSaleAt: new Date().toISOString(), lastSaleAt: new Date().toISOString() }])),
      renderTopItemsHtml: jest.fn(() => '<html><body>Top Artículos</body></html>'),
    },
  };
});

describe('GET /api/reportes/articulos/top', () => {
  const baseUrl = 'http://localhost/api/reportes/articulos/top';

  it('JSON ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&limit=10`;
    // @ts-expect-error NextRequest compatible
    const res = await TopGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('HTML ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&format=html`;
    // @ts-expect-error NextRequest compatible
    const res = await TopGET(new Request(url));
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '').toLowerCase()).toContain('text/html');
  });
});
