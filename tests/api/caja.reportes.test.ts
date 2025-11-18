import { GET as AperturaReporteGET } from '@/app/api/cajas/aperturas/[sessionId]/reporte/route';
import { GET as CierreReporteGET } from '@/app/api/cajas/cierres/[sessionId]/reporte/route';

// Mocks de servicios usados por los reportes de caja
jest.mock('@/lib/services/CashRegisterService', () => ({
  cashRegisterService: {
    getCashRegisterSessionById: jest.fn(async (id: number) => id === 1 ? ({
      id: 1,
      adminUserId: 10,
      status: 'OPEN',
      openingAmount: 100,
      openingAt: new Date().toISOString(),
      openingNotes: 'Inicio de turno',
      closingAt: null,
      cashRegister: {
        cashRegisterId: 1,
        cashRegisterCode: 'CR-01',
        cashRegisterName: 'Caja Principal',
        warehouseCode: 'ALM-01',
        warehouseName: 'Principal',
      },
    }) : null),
    getCashRegisterClosureReport: jest.fn(async (id: number) => id === 2 ? ({
      sessionId: 2,
      openedByAdminId: 10,
      closingByAdminId: 10,
      openingAmount: 100,
      openingAt: new Date().toISOString(),
      closingAmount: 150,
      closingAt: new Date().toISOString(),
      expectedTotalAmount: 150,
      reportedTotalAmount: 150,
      differenceTotalAmount: 0,
      totalInvoices: 3,
      closingNotes: 'Fin de turno',
      cashRegister: {
        cashRegisterId: 1,
        cashRegisterCode: 'CR-01',
        cashRegisterName: 'Caja Principal',
        warehouseCode: 'ALM-01',
        warehouseName: 'Principal',
      },
      payments: [
        { method: 'CASH', expectedAmount: 100, reportedAmount: 100, differenceAmount: 0, transactionCount: 2 },
        { method: 'CARD', expectedAmount: 50, reportedAmount: 50, differenceAmount: 0, transactionCount: 1 },
      ],
    }) : null),
  }
}));

jest.mock('@/lib/services/AdminUserService', () => ({
  adminUserService: {
    getAdminDirectoryEntry: jest.fn(async (id: number) => ({ username: `user${id}`, displayName: `Usuario ${id}` }))
  }
}));

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ sub: '10', name: 'Usuario 10', roles: ['ADMINISTRADOR'], permissions: ['cash.report.view'] }),
  verifyReportAccessToken: async () => ({ reportType: 'opening', sessionId: 1, requesterId: 10, scope: 'admin' })
}));

describe('Reportes de Caja (HTML)', () => {
  function makeNextLikeRequest(url: string) {
    return {
      url,
      nextUrl: new URL(url),
      cookies: { get: () => ({ value: 'dummy' }) },
    } as any;
  }

  it('apertura: devuelve HTML con format=html', async () => {
    const url = 'http://localhost/api/cajas/aperturas/1/reporte?format=html';
    const req = makeNextLikeRequest(url);
    const res = await AperturaReporteGET(req, { params: Promise.resolve({ sessionId: '1' }) });
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '').toLowerCase()).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('Reporte de apertura de caja');
  });

  it('cierre: devuelve HTML con format=html', async () => {
    // Ajustar mock de token para tipo closure
    const sessionMod = require('@/lib/auth/session');
    sessionMod.verifyReportAccessToken = async () => ({ reportType: 'closure', sessionId: 2, requesterId: 10, scope: 'admin' });

    const url = 'http://localhost/api/cajas/cierres/2/reporte?format=html';
    const req = makeNextLikeRequest(url);
    const res = await CierreReporteGET(req, { params: Promise.resolve({ sessionId: '2' }) });
    expect(res.status).toBe(200);
    expect((res.headers.get('content-type') || '').toLowerCase()).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('Reporte de cierre de caja');
  });
});
