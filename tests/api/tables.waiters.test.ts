import { GET as WaiterTablesGET } from '@/app/api/meseros/tables/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'waiter' }),
}));

jest.mock('@/lib/services/TableService', () => ({
  listWaiterTables: jest.fn(async () => ([{ id: 'T1', label: 'Mesa 1', state: 'free' }])),
}));

function makeReq(url: string) {
  return {
    url,
    nextUrl: new URL(url),
    cookies: { get: () => ({ value: 'dummy' }) },
  } as any;
}

describe('GET /api/meseros/tables', () => {
  it('devuelve mesas del mesero autenticado', async () => {
    const res = await WaiterTablesGET(makeReq('http://localhost/api/meseros/tables'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.tables)).toBe(true);
  });
});
