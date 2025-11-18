import { GET as UnidadesGET } from '@/app/api/unidades/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/UnitService', () => ({
  unitService: { listUnits: jest.fn(async () => ([{ code: 'UN', name: 'Unidad' }])) },
}));

describe('GET /api/unidades', () => {
  const baseUrl = 'http://localhost/api/unidades';

  it('retorna unidades con status 200', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await UnidadesGET(new Request(baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });
});
