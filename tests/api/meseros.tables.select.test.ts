import { POST as SelectTablePOST } from '@/app/api/meseros/tables/select/route';

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({ role: 'waiter', sub: '10' }),
}));

jest.mock('@/lib/services/WaiterService', () => ({
  waiterService: {
    getWaiterById: jest.fn(async (id: number) => ({ id, code: 'W-10', fullName: 'Mesero 10' })),
  }
}));

jest.mock('@/lib/services/orders/OrderService', () => {
  class OrderService {
    syncWaiterOrderForTable = jest.fn(async () => {})
  }
  return { OrderService };
});

jest.mock('@/lib/services/TableService', () => ({
  claimWaiterTable: jest.fn(async ({ tableId, waiterId, waiterName }: any) => ({ id: tableId, label: 'Mesa X', order: { sent_items: [] } })),
  getWaiterTable: jest.fn(async (tableId: string) => ({ id: tableId, label: 'Mesa X' })),
}));

function makeReq(url: string, body: any) { return { url, nextUrl: new URL(url), cookies: { get: () => ({ value: 'x' }) }, json: async () => body } as any; }

describe('POST /api/meseros/tables/select', () => {
  it('asigna la mesa al mesero autenticado', async () => {
    const res = await SelectTablePOST(makeReq('http://localhost/api/meseros/tables/select', { table_id: 'T1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.table?.id).toBe('T1');
  });
});
