import { GET as ZonesGET, POST as ZonesPOST } from '@/app/api/tables/zones/route';
import { PATCH as ZonePATCH, DELETE as ZoneDELETE } from '@/app/api/tables/zones/[zoneId]/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'admin' }),
}));

jest.mock('@/lib/services/TableService', () => ({
  listTableZones: jest.fn(async () => ([{ id: 'Z1', name: 'Zona 1', isActive: true }])),
  createTableZone: jest.fn(async (p: any) => ({ id: 'Z2', name: p.name, isActive: true })),
  updateTableZone: jest.fn(async (id: string, p: any) => ({ id, name: p.name ?? 'Zona 1', isActive: p.is_active ?? true })),
  deleteTableZone: jest.fn(async () => {}),
}));

function makeReq(url: string) { return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'x' }) } } as any; }
function makeReqWithJson(url: string, body: any) {
  return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'x' }) }, json: async () => body } as any;
}

describe('Tables Zones (admin) API', () => {
  it('GET /api/tables/zones', async () => {
    const res = await ZonesGET(makeReq('http://localhost/api/tables/zones'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('POST /api/tables/zones crea', async () => {
    const res = await ZonesPOST(makeReqWithJson('http://localhost/api/tables/zones', { name: 'VIP' }));
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/tables/zones/[id] actualiza', async () => {
    const res = await ZonePATCH(makeReqWithJson('http://localhost/api/tables/zones/Z1', { name: 'VIP 2' }), { params: Promise.resolve({ zoneId: 'Z1' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/tables/zones/[id] elimina', async () => {
    const res = await ZoneDELETE(makeReq('http://localhost/api/tables/zones/Z1'), { params: Promise.resolve({ zoneId: 'Z1' }) });
    expect(res.status).toBe(200);
  });
});
