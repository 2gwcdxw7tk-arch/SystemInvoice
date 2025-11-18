import { GET as ArticulosGET } from '@/app/api/articulos/route';

jest.mock('@/lib/auth/access', () => ({
  requireSession: async () => ({ session: { sub: '1', roles: ['ADMINISTRADOR'] } }),
}));

jest.mock('@/lib/services/ArticleService', () => {
  const getArticleByCode = jest.fn(async (code: string) =>
    code === 'A-1' ? ({ id: 1, article_code: 'A-1', name: 'Articulo 1' }) : null
  );
  const getArticles = jest.fn(async () => ([{ article_code: 'A-1' }, { article_code: 'A-2' }]));
  const ArticleService = jest.fn(() => ({ getArticleByCode, getArticles }));
  return { ArticleService };
});

jest.mock('@/lib/services/UnitService', () => ({
  unitService: { listUnits: jest.fn(async () => ([{ code: 'UN', name: 'Unidad' }])) },
}));

describe('GET /api/articulos', () => {
  const baseUrl = 'http://localhost/api/articulos';

  it('lista artículos con filtros básicos', async () => {
    const url = `${baseUrl}?price_list_code=L1&unit=RETAIL`;
    // @ts-expect-error NextRequest compatible shape
    const res = await ArticulosGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('incluye unidades cuando include_units=1', async () => {
    const url = `${baseUrl}?price_list_code=L1&unit=RETAIL&include_units=1`;
    // @ts-expect-error NextRequest compatible shape
    const res = await ArticulosGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.units)).toBe(true);
  });

  it('consulta por código y devuelve item', async () => {
    const url = `${baseUrl}?article_code=A-1`;
    // @ts-expect-error NextRequest compatible shape
    const res = await ArticulosGET(new Request(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item?.article_code).toBe('A-1');
  });

  it('devuelve 404 si no existe el artículo', async () => {
    const url = `${baseUrl}?article_code=NO-EXISTE`;
    // @ts-expect-error NextRequest compatible shape
    const res = await ArticulosGET(new Request(url));
    expect(res.status).toBe(404);
  });
});
