import { GET as KitsGET, POST as KitsPOST } from '@/app/api/kits/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/ArticleKitService', () => {
  class ArticleKitService {
    getKitComponents = jest.fn(async () => ([{ component_article_code: 'C-1', component_qty_retail: 2 }]))
    upsertKitComponents = jest.fn(async () => ({ count: 2 }))
  }
  return { ArticleKitService };
});

describe('Kits API', () => {
  it('GET /api/kits requiere kit_article_code y retorna componentes', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await KitsGET(new Request('http://localhost/api/kits?kit_article_code=K-1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('POST /api/kits guarda armado', async () => {
    const req = new Request('http://localhost/api/kits', { method: 'POST', body: JSON.stringify({ kit_article_code: 'K-1', components: [{ component_article_code: 'C-1', component_qty_retail: 1 }] }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await KitsPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.updated).toBe('number');
  });
});
