import { NextRequest } from 'next/server';

// Forzar modo mock en servicios
jest.mock('@/lib/env', () => ({ env: { useMockData: true } }));

// Mock de sesión/admin para rutas
jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({
    sub: '1',
    role: 'admin',
    roles: ['ADMINISTRADOR', 'FACTURADOR'],
    permissions: ['invoice.issue'],
  }),
}));

// Simular caja activa para permitir POST /api/invoices
jest.mock('@/lib/services/CashRegisterService', () => ({
  cashRegisterService: {
    getActiveCashRegisterSessionByAdmin: jest.fn().mockResolvedValue({
      id: 1,
      status: 'OPEN',
      openingAmount: 500,
      openingAt: new Date().toISOString(),
      openingNotes: null,
      cashRegister: {
        cashRegisterId: 1,
        cashRegisterCode: 'CAJA-01',
        cashRegisterName: 'Caja Principal',
        warehouseCode: 'PRINCIPAL',
        warehouseName: 'Almacén principal',
      },
    }),
    registerInvoiceForSession: jest.fn().mockResolvedValue(undefined),
  },
}));

// Evitar llamadas reales a inventario en mock
jest.mock('@/lib/services/InventoryService', () => ({
  inventoryService: {
    registerInvoiceMovements: jest.fn().mockResolvedValue(undefined),
    reverseInvoiceMovements: jest.fn().mockResolvedValue({ reversed: 0 }),
  },
}));

describe('Invoices API - list and cancel (mock mode)', () => {
  // Importar handlers después de aplicar los mocks
  const { GET: ListGET, POST: InvoicesPOST } = require('@/app/api/invoices/route');
  const { GET: DetailGET, PATCH: CancelPATCH } = require('@/app/api/invoices/[invoiceId]/route');
  it('creates, lists, shows detail and cancels an invoice', async () => {
    // 1) Crear factura
    const payload = {
      invoice_number: 'TEST-INV-1',
      invoice_date: new Date().toISOString().slice(0,10),
      table_code: 'M-01',
      waiter_code: 'W-01',
      origin_order_id: null,
      subtotal: 100,
      service_charge: 0,
      vat_amount: 15,
      vat_rate: 0.15,
      total_amount: 115,
      currency_code: 'NIO',
      items: [ { article_code: 'A-1', description: 'Prod 1', quantity: 1, unit_price: 100, unit: 'RETAIL' } ],
      payments: [ { method: 'CASH', amount: 115 } ],
    };

    const postReq = new Request('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }) as unknown as NextRequest;
    const postRes = await InvoicesPOST(postReq);
    expect(postRes.status).toBe(201);
    const postJson: any = await postRes.json();
    expect(typeof postJson.id).toBe('number');
    expect(postJson.invoice_number).toBe('TEST-INV-1');
    const id: number = postJson.id;

    // 2) Listar
    const listReq = new Request('http://localhost/api/invoices?page=1&pageSize=20', { method: 'GET' }) as unknown as NextRequest;
    const listRes = await ListGET(listReq);
    expect(listRes.status).toBe(200);
    const listJson: any = await listRes.json();
    expect(Array.isArray(listJson.items)).toBe(true);
    expect(listJson.items.some((it: any) => it.invoice_number === 'TEST-INV-1')).toBe(true);

    // 3) Detalle
    const detReq = new Request(`http://localhost/api/invoices/${id}`, { method: 'GET' }) as unknown as NextRequest;
    const detRes = await DetailGET(detReq, { params: Promise.resolve({ invoiceId: String(id) }) });
    expect(detRes.status).toBe(200);
    const detJson: any = await detRes.json();
    expect(detJson.invoice.invoice_number).toBe('TEST-INV-1');

    // 4) Anular
    const patchReq = new Request(`http://localhost/api/invoices/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ANULADA' }),
    }) as unknown as NextRequest;
    const patchRes = await CancelPATCH(patchReq, { params: Promise.resolve({ invoiceId: String(id) }) });
    expect(patchRes.status).toBe(200);
    const patchJson: any = await patchRes.json();
    expect(patchJson.success).toBe(true);

    // 5) Detalle actualizado (mock refleja estado)
    const detRes2 = await DetailGET(detReq, { params: Promise.resolve({ invoiceId: String(id) }) });
    const detJson2: any = await detRes2.json();
    expect(detJson2.invoice.status).toBe('ANULADA');
  });
});
