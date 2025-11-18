import { GET as ZonasGET, POST as ZonasPOST } from '@/app/api/preferencias/zonas/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/TableZoneService', () => ({
  TableZoneService: jest.fn(() => ({
    listZones: jest.fn(async () => ([{ id: 'Z1', name: 'Zona 1', isActive: true }])),
    createZone: jest.fn(async (p: any) => ({ id: 'Z2', name: p.name })),
    updateZone: jest.fn(async (id: string, p: any) => ({ id, name: p.name ?? 'Zona 1', isActive: p.isActive ?? true })),
  })),
}));

function makeReq(url: string) { return { url, nextUrl: new URL(url) } as any; }

describe('Preferencias Zonas API', () => {
  it('GET /api/preferencias/zonas', async () => {
    const res = await ZonasGET(makeReq('http://localhost/api/preferencias/zonas'));
    expect(res.status).toBe(200);
  });

  it('POST /api/preferencias/zonas crea/actualiza', async () => {
    const req1 = new Request('http://localhost/api/preferencias/zonas', { method: 'POST', body: JSON.stringify({ name: 'Zona X' }) });
    // @ts-expect-error NextRequest compatible shape
    const res1 = await ZonasPOST(req1);
    expect([200,201]).toContain(res1.status);

    const req2 = new Request('http://localhost/api/preferencias/zonas', { method: 'POST', body: JSON.stringify({ id: 'Z1', name: 'Zona 1A' }) });
    // @ts-expect-error NextRequest compatible shape
    const res2 = await ZonasPOST(req2);
    expect(res2.status).toBe(200);
  });
});
