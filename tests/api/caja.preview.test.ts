import { GET as CierrePreviewGET } from '@/app/api/cajas/cierres/[sessionId]/preparacion/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin', sub: '10', roles: ['ADMINISTRADOR','FACTURADOR'], permissions: ['cash.report.view'] }),
}));

jest.mock('@/lib/services/CashRegisterService', () => ({
  cashRegisterService: {
    getCashRegisterClosureReport: jest.fn(async () => ({
      sessionId: 123,
      cashRegister: { cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm' },
      openedByAdminId: 10,
      openingAmount: 100,
      openingAt: new Date().toISOString(),
      closingByAdminId: 10,
      closingAmount: 120,
      closingAt: null,
      closingNotes: null,
      expectedTotalAmount: 120,
      reportedTotalAmount: 120,
      differenceTotalAmount: 0,
      totalInvoices: 5,
      payments: [
        { method: 'CASH', expectedAmount: 120, reportedAmount: 120, differenceAmount: 0, transactionCount: 5 },
      ],
      openingDenominations: null,
      closingDenominations: null,
    }))
  }
}));

jest.mock('@/lib/services/AdminUserService', () => ({
  adminUserService: {
    getAdminDirectoryEntry: jest.fn(async () => ({ id: 10, username: 'admin', displayName: 'Admin' })),
  }
}));

function makeReqWithCookies(url: string) { return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'x' }) } } as any; }

describe('Preview cierre caja', () => {
  it('GET /api/cajas/cierres/[sessionId]/preparacion retorna preview', async () => {
    const res = await CierrePreviewGET(makeReqWithCookies('http://localhost/api/cajas/cierres/123/preparacion'), { params: Promise.resolve({ sessionId: '123' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.preview.expectedTotalAmount).toBe(120);
    expect(Array.isArray(body.preview.payments)).toBe(true);
  });
});
