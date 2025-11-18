import { GET as OrdersGET } from '@/app/api/orders/route';
import { PATCH as OrderPATCH } from '@/app/api/orders/[orderId]/route';
import { POST as ItemsPOST } from '@/app/api/orders/[orderId]/items/route';
import { PATCH as ItemPATCH, DELETE as ItemDELETE } from '@/app/api/orders/[orderId]/items/[itemId]/route';

jest.mock('@/lib/services/orders/OrderService', () => {
  class OrderService {
    listOpenOrders = jest.fn(async () => ([{ id: 1, tableId: 'T1', status: 'OPEN' }]))
    cancelOrder = jest.fn(async () => {})
    updateOrderNotes = jest.fn(async () => {})
    updateOrderGuests = jest.fn(async () => {})
    addOrderItem = jest.fn(async () => {})
    updateOrderItem = jest.fn(async () => {})
    removeOrderItem = jest.fn(async () => {})
    syncWaiterOrderForTable = jest.fn(async () => {})
  }
  return { OrderService };
});

describe('Orders API', () => {
  it('GET /api/orders retorna pedidos abiertos', async () => {
    const res = await OrdersGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.orders)).toBe(true);
  });

  it('PATCH /api/orders/[id] acepta cambios', async () => {
    const req = new Request('http://localhost/api/orders/1', { method: 'PATCH', body: JSON.stringify({ notes: 'Algo', guests: 2 }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await OrderPATCH(req, { params: Promise.resolve({ orderId: '1' }) });
    expect(res.status).toBe(200);
  });

  it('POST /api/orders/[id]/items agrega item', async () => {
    const req = new Request('http://localhost/api/orders/1/items', { method: 'POST', body: JSON.stringify({ article_code: 'A-1', description: 'Item', quantity: 1, unit_price: 10 }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await ItemsPOST(req, { params: Promise.resolve({ orderId: '1' }) });
    expect([200,201]).toContain(res.status);
  });

  it('PATCH /api/orders/[id]/items/[itemId] actualiza', async () => {
    const req = new Request('http://localhost/api/orders/1/items/1', { method: 'PATCH', body: JSON.stringify({ quantity: 2 }) });
    // @ts-expect-error NextRequest compatible shape
    const res = await ItemPATCH(req, { params: Promise.resolve({ orderId: '1', itemId: '1' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE /api/orders/[id]/items/[itemId] elimina', async () => {
    // @ts-expect-error NextRequest compatible shape
    const res = await ItemDELETE(new Request('http://localhost/api/orders/1/items/1', { method: 'DELETE' }), { params: Promise.resolve({ orderId: '1', itemId: '1' }) });
    expect(res.status).toBe(200);
  });
});
