import { GET as MovimientosGET } from '@/app/api/reportes/inventario/movimientos/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 })
}));

jest.mock('@/lib/services/ReportService', () => {
  const actual = jest.requireActual('@/lib/services/ReportService');
  return {
    ...actual,
    reportService: {
      getInventoryMovements: jest.fn(async () => ({
        summary: [
          { transactionType: 'PURCHASE', entriesRetail: 10, exitsRetail: 0, netRetail: 10, entriesStorage: 1, exitsStorage: 0, netStorage: 1 },
          { transactionType: 'CONSUMPTION', entriesRetail: 0, exitsRetail: 4, netRetail: -4, entriesStorage: 0, exitsStorage: 0.4, netStorage: -0.4 },
        ],
        totals: { netRetail: 6, netStorage: 0.6 }
      })),
      renderInventoryMovementsHtml: jest.fn(() => '<html><body>Movimientos Inventario</body></html>'),
    },
  };
});

describe('GET /api/reportes/inventario/movimientos', () => {
  const baseUrl = 'http://localhost/api/reportes/inventario/movimientos';

  it('JSON ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17`;
    // @ts-expect-error NextRequest compatible
    const res = await MovimientosGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report?.summary?.length).toBeGreaterThan(0);
  });

  it('HTML ok', async () => {
    const url = `${baseUrl}?from=2025-11-01&to=2025-11-17&format=html`;
    // @ts-expect-error NextRequest compatible
    const res = await MovimientosGET(new Request(url));
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '').toLowerCase()).toContain('text/html');
  });
});
