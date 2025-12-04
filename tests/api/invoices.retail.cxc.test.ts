import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

jest.mock('@/lib/env', () => {
  const actual = jest.requireActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    env: {
      ...actual.env,
      useMockData: true,
      MOCK_DATA: true,
      isProduction: false,
      features: { ...actual.env.features, isRestaurant: false, retailModeEnabled: true },
      publicFeatures: { ...actual.env.publicFeatures, isRestaurant: false, retailModeEnabled: true },
    },
  };
});

jest.mock('@/lib/auth/session', () => ({
  SESSION_COOKIE_NAME: 'facturador_session',
  parseSessionCookie: async () => ({
    sub: '1',
    role: 'admin',
    roles: ['ADMINISTRADOR', 'FACTURADOR'],
    permissions: ['invoice.issue'],
  }),
}));

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
        cashRegisterCode: 'CAJA-RETAIL',
        cashRegisterName: 'Caja Retail',
        warehouseCode: 'PRINCIPAL',
        warehouseName: 'Almacén principal',
      },
    }),
    registerInvoiceForSession: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/lib/services/InventoryService', () => ({
  inventoryService: {
    registerInvoiceMovements: jest.fn().mockResolvedValue(undefined),
    reverseInvoiceMovements: jest.fn().mockResolvedValue({ reversed: 0 }),
  },
}));

describe('Invoices API – retail CxC integration (mock mode)', () => {
  const { POST: InvoicesPOST } = require('@/app/api/invoices/route');
  const { PATCH: CancelPATCH } = require('@/app/api/invoices/[invoiceId]/route');
  const snapshot = JSON.parse(JSON.stringify(mockCxcStore));

  const resetMockCxcStore = () => {
    const copyArray = (target: any[], source: any[]) => {
      target.splice(0, target.length, ...source.map((item) => ({ ...item })));
    };

    copyArray(mockCxcStore.paymentTerms, snapshot.paymentTerms);
    copyArray(mockCxcStore.customers, snapshot.customers);
    copyArray(mockCxcStore.documents, snapshot.documents);
    copyArray(mockCxcStore.applications, snapshot.applications);
    copyArray(mockCxcStore.creditLines, snapshot.creditLines);
    copyArray(mockCxcStore.collectionLogs, snapshot.collectionLogs);
    copyArray(mockCxcStore.disputes, snapshot.disputes);
    Object.assign(mockCxcStore.sequences, snapshot.sequences);
  };

  beforeEach(() => {
    resetMockCxcStore();
  });
  const buildNextRequest = (url: string, init?: RequestInit) => {
    const request = new Request(url, init) as unknown as NextRequest;
    (request as any).cookies = {
      get: () => ({ value: 'mock-session' }),
    };
    return request;
  };

  it('emite factura a crédito y genera documento CxC con saldo pendiente', async () => {
    const { paymentTermService } = await import('@/lib/services/cxc/PaymentTermService');
    const initialDocuments = mockCxcStore.documents.length;

    const payload = {
      invoice_number: 'RET-INV-1',
      invoice_date: new Date().toISOString().slice(0, 10),
      table_code: null,
      waiter_code: null,
      origin_order_id: null,
      subtotal: 100,
      service_charge: 0,
      vat_amount: 15,
      vat_rate: 0.15,
      total_amount: 115,
      currency_code: 'NIO',
      items: [
        { article_code: 'A-RET-1', description: 'Producto retail', quantity: 1, unit_price: 100, unit: 'RETAIL' },
      ],
      payments: [],
      customer_id: 2,
      customer_code: 'RET001',
      sale_type: 'CREDITO' as const,
      payment_term_code: 'NETO15',
    };

    const request = buildNextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await InvoicesPOST(request);
    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(typeof body.id).toBe('number');
    expect(body.invoice_number).toBe('RET-INV-1');

    expect(mockCxcStore.documents.length).toBe(initialDocuments + 1);
    const createdDocument = mockCxcStore.documents[mockCxcStore.documents.length - 1];
    expect(createdDocument.documentType).toBe('INVOICE');
    expect(createdDocument.originalAmount).toBe(115);
    expect(createdDocument.balanceAmount).toBe(115);
    expect(createdDocument.status).toBe('PENDIENTE');
    expect(createdDocument.relatedInvoiceId).toBe(body.id);
    expect(createdDocument.paymentTermCode).toBe('NETO15');

    const term = await paymentTermService.getByCode('NETO15');
    if (!term) {
      throw new Error('La condición de pago NETO15 debe existir en modo mock');
    }
    const expectedDue = paymentTermService
      .calculateDueDate(payload.invoice_date, term)
      .toISOString()
      .slice(0, 10);
    expect(createdDocument.dueDate).toBe(expectedDue);

    const updatedCustomer = mockCxcStore.customers.find((entry) => entry.id === payload.customer_id);
    expect(updatedCustomer).toBeTruthy();
    const outstandingTotal = mockCxcStore.documents
      .filter((doc) => doc.customerId === payload.customer_id && doc.status !== 'CANCELADO' && (doc.documentType === 'INVOICE' || doc.documentType === 'DEBIT_NOTE'))
      .reduce((acc, doc) => acc + doc.balanceAmount, 0);
    expect(updatedCustomer?.creditUsed).toBeCloseTo(outstandingTotal, 5);
  });

  it('rechaza la emisión sin seleccionar cliente en modo retail', async () => {
    const payload = {
      invoice_number: 'RET-INV-2',
      invoice_date: new Date().toISOString().slice(0, 10),
      table_code: null,
      waiter_code: null,
      origin_order_id: null,
      subtotal: 50,
      service_charge: 0,
      vat_amount: 7.5,
      vat_rate: 0.15,
      total_amount: 57.5,
      currency_code: 'NIO',
      items: [
        { article_code: 'A-RET-1', description: 'Producto retail', quantity: 1, unit_price: 50, unit: 'RETAIL' },
      ],
      payments: [],
      customer_id: null,
      customer_code: null,
      sale_type: 'CREDITO' as const,
      payment_term_code: 'NETO15',
    };

    const request = buildNextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await InvoicesPOST(request);
    expect(response.status).toBe(400);
    const body: any = await response.json();
    expect(body.message).toMatch(/Debes seleccionar un cliente/i);
  });

  it('anula la factura a crédito y su documento CxC cuando no tiene aplicaciones', async () => {
    const payload = {
      invoice_number: 'RET-INV-CANCEL-OK',
      invoice_date: new Date().toISOString().slice(0, 10),
      table_code: null,
      waiter_code: null,
      origin_order_id: null,
      subtotal: 300,
      service_charge: 0,
      vat_amount: 45,
      vat_rate: 0.15,
      total_amount: 345,
      currency_code: 'NIO',
      items: [{ article_code: 'A-RET-2', description: 'Producto crédito', quantity: 3, unit_price: 100, unit: 'RETAIL' }],
      payments: [],
      customer_id: 2,
      customer_code: 'RET001',
      sale_type: 'CREDITO' as const,
      payment_term_code: 'NETO15',
    };

    const postReq = buildNextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const postRes = await InvoicesPOST(postReq);
    expect(postRes.status).toBe(201);
    const postBody: any = await postRes.json();
    const invoiceId: number = postBody.id;

    const linkedDocumentBefore = mockCxcStore.documents.find((doc) => doc.relatedInvoiceId === invoiceId);
    expect(linkedDocumentBefore).toBeTruthy();
    expect(linkedDocumentBefore?.status).toBe('PENDIENTE');

    const patchReq = buildNextRequest(`http://localhost/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ANULADA' }),
    });
    const patchRes = await CancelPATCH(patchReq, { params: Promise.resolve({ invoiceId: String(invoiceId) }) });
    expect(patchRes.status).toBe(200);
    const patchBody: any = await patchRes.json();
    expect(patchBody.success).toBe(true);

    const linkedDocumentAfter = mockCxcStore.documents.find((doc) => doc.relatedInvoiceId === invoiceId);
    expect(linkedDocumentAfter?.status).toBe('CANCELADO');
    expect(linkedDocumentAfter?.balanceAmount).toBe(0);
  });

  it('impide anular la factura a crédito cuando su documento CxC tiene aplicaciones activas', async () => {
    const payload = {
      invoice_number: 'RET-INV-CANCEL-BLOCK',
      invoice_date: new Date().toISOString().slice(0, 10),
      table_code: null,
      waiter_code: null,
      origin_order_id: null,
      subtotal: 150,
      service_charge: 0,
      vat_amount: 22.5,
      vat_rate: 0.15,
      total_amount: 172.5,
      currency_code: 'NIO',
      items: [{ article_code: 'A-RET-3', description: 'Producto crédito 2', quantity: 1, unit_price: 150, unit: 'RETAIL' }],
      payments: [],
      customer_id: 2,
      customer_code: 'RET001',
      sale_type: 'CREDITO' as const,
      payment_term_code: 'NETO15',
    };

    const postReq = buildNextRequest('http://localhost/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const postRes = await InvoicesPOST(postReq);
    expect(postRes.status).toBe(201);
    const postBody: any = await postRes.json();
    const invoiceId: number = postBody.id;

    const targetDocument = mockCxcStore.documents.find((doc) => doc.relatedInvoiceId === invoiceId);
    expect(targetDocument).toBeTruthy();

    const receiptDocumentId = mockCxcStore.sequences.document++;
    const now = new Date().toISOString();
    mockCxcStore.documents.push({
      id: receiptDocumentId,
      customerId: targetDocument!.customerId,
      customerCode: targetDocument!.customerCode,
      customerName: targetDocument!.customerName,
      documentType: 'RECEIPT',
      documentNumber: `REC-${receiptDocumentId}`,
      documentDate: targetDocument!.documentDate,
      dueDate: targetDocument!.documentDate,
      currencyCode: targetDocument!.currencyCode,
      originalAmount: 50,
      balanceAmount: 0,
      status: 'PAGADO',
      reference: null,
      notes: null,
      metadata: null,
      paymentTermId: null,
      paymentTermCode: null,
      relatedInvoiceId: null,
      createdAt: now,
      updatedAt: now,
    });

    const applicationId = mockCxcStore.sequences.application++;
    mockCxcStore.applications.push({
      id: applicationId,
      appliedDocumentId: receiptDocumentId,
      targetDocumentId: targetDocument!.id,
      amount: 50,
      applicationDate: now,
      reference: null,
      notes: null,
      createdAt: now,
    });

    const patchReq = buildNextRequest(`http://localhost/api/invoices/${invoiceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ANULADA' }),
    });
    const patchRes = await CancelPATCH(patchReq, { params: Promise.resolve({ invoiceId: String(invoiceId) }) });
    expect(patchRes.status).toBe(409);
    const patchBody: any = await patchRes.json();
    expect(patchBody.message).toMatch(/Desaplica los pagos/i);
    expect(patchBody.success).toBe(false);

    const targetDocumentAfter = mockCxcStore.documents.find((doc) => doc.relatedInvoiceId === invoiceId);
    expect(targetDocumentAfter?.status).toBe('PENDIENTE');
  });
});
