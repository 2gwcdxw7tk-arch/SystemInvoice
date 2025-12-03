import { GET as ExistenciasGET } from '@/app/api/inventario/existencias/route';
import { GET as KardexGET } from '@/app/api/inventario/kardex/route';
import { GET as DocumentoGET } from '@/app/api/inventario/documentos/[transactionCode]/route';
import { GET as DocumentosListGET } from '@/app/api/inventario/documentos/route';

jest.mock('@/lib/auth/access', () => ({
  requireAdministrator: async () => ({ userId: 1 }),
}));

const mockGetStockSummary = jest.fn(async (..._args: unknown[]) => [{ article_code: 'A-1', warehouse_code: 'ALM-01', qty: 10 }]);
const mockListKardex = jest.fn(async (..._args: unknown[]) => [{ type: 'IN', qty: 5 }, { type: 'OUT', qty: 2 }]);
const mockGetTransactionDocument = jest.fn();
const mockListTransactionHeaders = jest.fn(async (..._args: unknown[]) => [{
  transaction_code: 'CP-0001',
  transaction_type: 'PURCHASE',
  occurred_at: new Date().toISOString(),
  warehouse_code: 'WH-01',
  warehouse_name: 'Principal',
  reference: null,
  counterparty_name: null,
  status: 'PENDIENTE',
  notes: null,
  total_amount: 50,
  entries_count: 1,
  entries_in: 1,
  entries_out: 0,
}]);

jest.mock('@/lib/services/InventoryService', () => ({
  inventoryService: {
    getStockSummary: (...args: unknown[]) => mockGetStockSummary(...args),
    listKardex: (...args: unknown[]) => mockListKardex(...args),
    getTransactionDocument: (...args: unknown[]) => mockGetTransactionDocument(...args),
    listTransactionHeaders: (...args: unknown[]) => mockListTransactionHeaders(...args),
  },
}));

describe('Inventario API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('GET /inventario/documentos/:code retorna documento JSON', async () => {
    mockGetTransactionDocument.mockResolvedValue({
      transaction_code: 'CP-0001',
      transaction_type: 'PURCHASE',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      warehouse_code: 'WH-01',
      warehouse_name: 'Principal',
      reference: null,
      counterparty_name: null,
      status: 'PENDIENTE',
      notes: null,
      authorized_by: null,
      created_by: null,
      total_amount: 100,
      entries: [],
    });

    // @ts-expect-error NextRequest compatible shape
    const res = await DocumentoGET(new Request('http://localhost/api/inventario/documentos/CP-0001'), { params: { transactionCode: 'CP-0001' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.transaction_code).toBe('CP-0001');
  });

  it('GET /inventario/documentos/:code responde 404 cuando no existe', async () => {
    mockGetTransactionDocument.mockResolvedValue(null);
    // @ts-expect-error NextRequest compatible shape
    const res = await DocumentoGET(new Request('http://localhost/api/inventario/documentos/CP-9999'), { params: { transactionCode: 'CP-9999' } });
    expect(res.status).toBe(404);
  });

  it('GET /inventario/documentos/:code soporta formato HTML', async () => {
    mockGetTransactionDocument.mockResolvedValue({
      transaction_code: 'CP-0001',
      transaction_type: 'PURCHASE',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      warehouse_code: 'WH-01',
      warehouse_name: 'Principal',
      reference: null,
      counterparty_name: null,
      status: 'PENDIENTE',
      notes: null,
      authorized_by: null,
      created_by: null,
      total_amount: 100,
      entries: [],
    });

    // @ts-expect-error NextRequest compatible shape
    const res = await DocumentoGET(new Request('http://localhost/api/inventario/documentos/CP-0001?format=html'), { params: { transactionCode: 'CP-0001' } });
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('CP-0001');
  });

  it('GET /inventario/documentos retorna listado', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await DocumentosListGET(new Request('http://localhost/api/inventario/documentos?type=PURCHASE&warehouse=WH-01'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(mockListTransactionHeaders).toHaveBeenCalledWith(expect.objectContaining({ transaction_types: ['PURCHASE'], warehouse_codes: ['WH-01'] }));
  });
});
