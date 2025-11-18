import { GET as PreciosGET } from '@/app/api/precios/route';

jest.mock('@/lib/auth/access', () => ({
  requireSession: async () => ({ session: { sub: '1', roles: ['ADMINISTRADOR'] } }),
  isAdministrator: () => true,
  isFacturador: () => false,
  hasPermission: () => false,
}));

jest.mock('@/lib/services/PriceListService', () => ({
  priceListService: {
    list: jest.fn(async () => ([{ code: 'L1', name: 'Lista 1' }])),
    getByCode: jest.fn(async (code: string) => code === 'L1' ? ({ code: 'L1', name: 'Lista 1' }) : null),
    listItems: jest.fn(async () => ([{ article_code: 'A-1', price: 100 }])),
  },
}));

function makeReq(url: string) {
  return { url, nextUrl: new URL(url) } as any;
}

describe('GET /api/precios', () => {
  const baseUrl = 'http://localhost/api/precios';

  it('lista listas de precios', async () => {
    const req = makeReq(baseUrl);
    const res = await PreciosGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.lists)).toBe(true);
  });

  it('consulta una lista por código e incluye items', async () => {
    const req = makeReq(`${baseUrl}?code=L1&include=items`);
    const res = await PreciosGET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.list?.code).toBe('L1');
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('devuelve 404 si la lista no existe', async () => {
    const req = makeReq(`${baseUrl}?code=NOPE`);
    const res = await PreciosGET(req);
    expect(res.status).toBe(404);
  });
});
