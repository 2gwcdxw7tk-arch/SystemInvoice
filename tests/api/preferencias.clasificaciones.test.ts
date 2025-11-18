import { GET as ClasifGET, POST as ClasifPOST } from '@/app/api/preferencias/clasificaciones/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/ArticleClassificationService', () => ({
  ArticleClassificationService: jest.fn(() => ({
    list: jest.fn(async () => ([{ id: 1, code: 'A', name: 'Cat A', level: 1 }])),
    create: jest.fn(async (p: any) => ({ id: 2, code: p.code, name: p.name })),
    update: jest.fn(async (id: number, p: any) => ({ id, name: p.name ?? 'Cat A', isActive: p.isActive ?? true })),
  })),
}));

function makeReq(url: string) { return { url, nextUrl: new URL(url) } as any; }

describe('Preferencias Clasificaciones API', () => {
  it('GET /api/preferencias/clasificaciones', async () => {
    const res = await ClasifGET(makeReq('http://localhost/api/preferencias/clasificaciones'));
    expect(res.status).toBe(200);
  });

  it('POST /api/preferencias/clasificaciones crea', async () => {
    const req = new Request('http://localhost/api/preferencias/clasificaciones', { method: 'POST', body: JSON.stringify({ code: 'B', name: 'Cat B' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await ClasifPOST(req);
    expect([200,201]).toContain(res.status);
  });

  it('POST /api/preferencias/clasificaciones actualiza', async () => {
    const req = new Request('http://localhost/api/preferencias/clasificaciones', { method: 'POST', body: JSON.stringify({ id: 1, name: 'Cat A2' }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await ClasifPOST(req);
    expect(res.status).toBe(200);
  });
});
