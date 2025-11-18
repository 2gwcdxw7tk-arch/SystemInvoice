import { GET as ExistenciasGET } from '@/app/api/inventario/existencias/route';
import { GET as KardexGET } from '@/app/api/inventario/kardex/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

jest.mock('@/lib/services/InventoryService', () => ({
  inventoryService: {
    getStockSummary: jest.fn(async () => ([{ article_code: 'A-1', warehouse_code: 'ALM-01', qty: 10 }])),
    listKardex: jest.fn(async () => ([{ type: 'IN', qty: 5 }, { type: 'OUT', qty: 2 }]))
  },
}));

describe('Inventario API', () => {
  it('GET /inventario/existencias retorna items', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await ExistenciasGET(new Request('http://localhost/api/inventario/existencias?warehouse_code=ALM-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('GET /inventario/kardex retorna items', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await KardexGET(new Request('http://localhost/api/inventario/kardex?article=A-1&from=2025-01-01&to=2025-12-31'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });
});
