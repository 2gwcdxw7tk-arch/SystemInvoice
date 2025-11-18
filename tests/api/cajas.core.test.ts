import { GET as CajasGET, POST as CajasPOST } from '@/app/api/cajas/route';
import { PATCH as CajaPATCH } from '@/app/api/cajas/[code]/route';
import { POST as AperturasPOST } from '@/app/api/cajas/aperturas/route';
import { POST as CierresPOST } from '@/app/api/cajas/cierres/route';
import { GET as SesionActivaGET } from '@/app/api/cajas/sesion-activa/route';
import { GET as AsignacionesGET, POST as AsignacionesPOST } from '@/app/api/cajas/asignaciones/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin', sub: '10', roles: ['ADMINISTRADOR','FACTURADOR'], permissions: ['cash.register.open','cash.register.close','cash.report.view','admin.users.manage'] }),
  createReportAccessToken: async () => 'tok',
}));

jest.mock('@/lib/services/CashRegisterService', () => ({
  cashRegisterService: {
    listCashRegisters: jest.fn(async () => ([{ id: 1, code: 'CR-01', name: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm', allowManualWarehouseOverride: false, isActive: true, warehouseId: 1 }])),
    createCashRegister: jest.fn(async (p: any) => ({ id: 2, code: p.code, name: p.name })),
    updateCashRegister: jest.fn(async (code: string, p: any) => ({ id: 1, code, name: p.name ?? 'Principal' })),
    listCashRegisterAssignments: jest.fn(async () => ([{ adminUserId: 10, assignments: [{ cashRegisterId: 1, isDefault: true }] }])),
    listActiveCashRegisterSessions: jest.fn(async () => ([])),
    listCashRegistersForAdmin: jest.fn(async () => ([{ cashRegisterId: 1, cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', allowManualWarehouseOverride: false, warehouseId: 1, warehouseCode: 'ALM', warehouseName: 'Alm', isDefault: true }])),
    getActiveCashRegisterSessionByAdmin: jest.fn(async () => ({ id: 99, status: 'OPEN', openingAmount: 100, openingAt: new Date().toISOString(), openingNotes: null, cashRegister: { cashRegisterId: 1, cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm' }, adminUserId: 10 })),
    listRecentCashRegisterSessions: jest.fn(async () => ([{ id: 98, status: 'CLOSED', openingAmount: 50, openingAt: new Date().toISOString(), closingAmount: 60, closingAt: new Date().toISOString(), cashRegister: { cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm' } }])),
    openCashRegisterSession: jest.fn(async (p: any) => ({ id: 100, status: 'OPEN', openingAmount: p.openingAmount, openingAt: new Date().toISOString(), openingNotes: p.openingNotes ?? null, cashRegister: { cashRegisterId: 1, cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm' } })),
    closeCashRegisterSession: jest.fn(async () => ({ sessionId: 100, closingByAdminId: 10, openingAmount: 100, closingAmount: 120, expectedTotalAmount: 120, reportedTotalAmount: 120, differenceTotalAmount: 0, payments: [], cashRegister: { cashRegisterCode: 'CR-01', cashRegisterName: 'Principal', warehouseCode: 'ALM', warehouseName: 'Alm' } })),
    assignCashRegisterToAdmin: jest.fn(async () => {}),
    unassignCashRegisterFromAdmin: jest.fn(async () => {}),
    setDefaultCashRegisterForAdmin: jest.fn(async () => {}),
  }
}));

jest.mock('@/lib/services/AdminUserService', () => ({
  adminUserService: {
    listAdminDirectory: jest.fn(async () => ([{ id: 10, username: 'admin', displayName: 'Admin', roles: ['ADMINISTRADOR'], isActive: true }])),
  }
}));

function makeReq(url: string) { return { url, nextUrl: new URL(url) } as any; }
function makeReqWithCookies(url: string) { return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'x' }) } } as any; }

describe('Cajas API core', () => {
  it('GET /api/cajas', async () => {
    const res = await CajasGET(makeReq('http://localhost/api/cajas'));
    expect(res.status).toBe(200);
  });

  it('POST /api/cajas', async () => {
    const req = new Request('http://localhost/api/cajas', { method: 'POST', body: JSON.stringify({ code: 'CR-02', name: 'Secundaria', warehouse_code: 'ALM' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await CajasPOST(req);
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/cajas/[code]', async () => {
    const req = new Request('http://localhost/api/cajas/CR-01', { method: 'PATCH', body: JSON.stringify({ name: 'Principal X' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await CajaPATCH(req, { params: Promise.resolve({ code: 'CR-01' }) });
    expect(res.status).toBe(200);
  });
});

describe('Cajas operaciones', () => {
  it('GET /api/cajas/sesion-activa', async () => {
    const res = await SesionActivaGET(makeReqWithCookies('http://localhost/api/cajas/sesion-activa'));
    expect(res.status).toBe(200);
  });

  it('POST /api/cajas/aperturas', async () => {
    const req = { ...makeReqWithCookies('http://localhost/api/cajas/aperturas'), json: async () => ({ cash_register_code: 'CR-01', opening_amount: 100 }) } as any;
    const res = await AperturasPOST(req);
    expect([200,201]).toContain(res.status);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.report_url).toBe('string');
  });

  it('POST /api/cajas/cierres', async () => {
    const req = { ...makeReqWithCookies('http://localhost/api/cajas/cierres'), json: async () => ({ closing_amount: 120, payments: [{ method: 'CASH', reported_amount: 120, transaction_count: 1 }] }) } as any;
    const res = await CierresPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe('Cajas asignaciones', () => {
  it('GET /api/cajas/asignaciones', async () => {
    const res = await AsignacionesGET(makeReq('http://localhost/api/cajas/asignaciones'));
    expect(res.status).toBe(200);
  });

  it('POST /api/cajas/asignaciones (assign)', async () => {
    const req = new Request('http://localhost/api/cajas/asignaciones', { method: 'POST', body: JSON.stringify({ admin_user_id: 10, cash_register_code: 'CR-01', action: 'assign' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await AsignacionesPOST(req);
    expect(res.status).toBe(200);
  });
});
