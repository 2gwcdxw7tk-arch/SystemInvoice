import { GET as TablesGET } from '@/app/api/tables/route';
import { GET as TableByIdGET } from '@/app/api/tables/[tableId]/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin' }),
}));

jest.mock('@/lib/services/TableService', () => ({
  listAvailableTables: jest.fn(async () => ([{ id: 'T1', label: 'Mesa 1' }])),
  listTableAdminSnapshots: jest.fn(async () => ([{ id: 'T1', label: 'Mesa 1', zone: null }])),
  getTableAdminSnapshot: jest.fn(async (id: string) => id === 'T1' ? ({ id: 'T1', label: 'Mesa 1' }) : null),
}));

function makeReq(url: string) {
  return {
    url,
    nextUrl: new URL(url),
    cookies: { get: () => ({ value: 'dummy' }) },
  } as any;
}

describe('Tables Admin API', () => {
  it('GET /api/tables devuelve tablas (todas)', async () => {
    const res = await TablesGET(makeReq('http://localhost/api/tables'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.tables)).toBe(true);
  });

  it('GET /api/tables?available=true devuelve disponibles', async () => {
    const res = await TablesGET(makeReq('http://localhost/api/tables?available=true'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.tables)).toBe(true);
  });

  it('GET /api/tables/[tableId] devuelve mesa por id', async () => {
    const res = await TableByIdGET(makeReq('http://localhost/api/tables/T1'), { params: Promise.resolve({ tableId: 'T1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.table?.id).toBe('T1');
  });

  it('GET /api/tables/[tableId] 404 cuando no existe', async () => {
    const res = await TableByIdGET(makeReq('http://localhost/api/tables/NOPE'), { params: Promise.resolve({ tableId: 'NOPE' }) });
    expect(res.status).toBe(404);
  });
});
