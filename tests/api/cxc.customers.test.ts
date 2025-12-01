import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

const requireCxCPermissionsMock = jest.fn(async () => ({
  session: {
    sub: '1',
    role: 'admin',
    permissions: ['customers.manage', 'customer.documents.manage'],
  },
}));

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

jest.mock('@/lib/auth/cxc-access', () => ({
  CXC_PERMISSIONS: {
    MENU_VIEW: 'menu.cxc.view',
    CUSTOMERS_MANAGE: 'customers.manage',
    PAYMENT_TERMS_MANAGE: 'payment-terms.manage',
    CUSTOMER_DOCUMENTS_MANAGE: 'customer.documents.manage',
    CUSTOMER_DOCUMENTS_APPLY: 'customer.documents.apply',
    CUSTOMER_CREDIT_MANAGE: 'customer.credit.manage',
    CUSTOMER_COLLECTIONS_MANAGE: 'customer.collections.manage',
    CUSTOMER_DISPUTES_MANAGE: 'customer.disputes.manage',
  },
  requireCxCPermissions: (...args: Parameters<typeof requireCxCPermissionsMock>) => requireCxCPermissionsMock(...args),
}));

const buildRequest = (url: string, init: RequestInit = {}): NextRequest => {
  const request = new Request(url, init) as unknown as NextRequest;
  (request as any).cookies = {
    get: () => ({ value: 'mock-session' }),
  };
  (request as any).nextUrl = new URL(url);
  return request;
};

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

describe('API CxC – Clientes (mock mode)', () => {
  const { GET: CustomersGET, POST: CustomersPOST } = require('@/app/api/cxc/clientes/route');
  const { GET: CustomerByCodeGET, PATCH: CustomerByCodePATCH } = require('@/app/api/cxc/clientes/[code]/route');

  beforeEach(() => {
    resetMockCxcStore();
    requireCxCPermissionsMock.mockClear();
  });

  it('lista clientes y el resumen de crédito', async () => {
    const listResponse = await CustomersGET(buildRequest('http://localhost/api/cxc/clientes'));
    expect(listResponse.status).toBe(200);
    const listBody: any = await listResponse.json();
    expect(Array.isArray(listBody.items)).toBe(true);
    expect(listBody.items.length).toBeGreaterThan(0);

    const summaryResponse = await CustomersGET(buildRequest('http://localhost/api/cxc/clientes?summary=true&limit=1'));
    expect(summaryResponse.status).toBe(200);
    const summaryBody: any = await summaryResponse.json();
    expect(Array.isArray(summaryBody.items)).toBe(true);
    expect(summaryBody.items[0]).toHaveProperty('availableCredit');
    expect(summaryBody.items[0]).toHaveProperty('creditStatus');
    expect(['ACTIVE', 'ON_HOLD', 'BLOCKED']).toContain(summaryBody.items[0].creditStatus);
    expect(summaryBody.items[0]).toHaveProperty('paymentTermCode');
    expect(summaryBody.items[0]).toHaveProperty('creditUsed');
    expect(summaryBody.items[0]).toHaveProperty('creditOnHold');

    const summaryFullResponse = await CustomersGET(buildRequest('http://localhost/api/cxc/clientes?summary=true'));
    expect(summaryFullResponse.status).toBe(200);
    const summaryFullBody: any = await summaryFullResponse.json();
    expect(summaryFullBody.items.some((item: any) => item.creditStatus === 'BLOCKED')).toBe(true);
  });

  it('crea un nuevo cliente y lo consulta por código', async () => {
    const createResponse = await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'CLI-001',
          name: 'Cliente de prueba',
          paymentTermCode: 'NETO15',
          creditLimit: 1000,
        }),
      }),
    );

    expect(createResponse.status).toBe(201);
    const createBody: any = await createResponse.json();
    expect(createBody.customer.code).toBe('CLI-001');

    const getResponse = await CustomerByCodeGET(
      buildRequest('http://localhost/api/cxc/clientes/CLI-001'),
      { params: { code: 'CLI-001' } },
    );

    expect(getResponse.status).toBe(200);
    const getBody: any = await getResponse.json();
    expect(getBody.customer.name).toBe('Cliente de prueba');
    expect(mockCxcStore.customers.find((entry) => entry.code === 'CLI-001')).toBeDefined();
  });

  it('rechaza códigos duplicados', async () => {
    const payload = {
      code: 'CLI-DEDUP',
      name: 'Cliente duplicado',
    };

    await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    const duplicated = await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(duplicated.status).toBe(409);
  });

  it('actualiza datos y estatus de crédito de un cliente', async () => {
    await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CLI-UPD', name: 'Cliente por actualizar' }),
      }),
    );

    const patchResponse = await CustomerByCodePATCH(
      buildRequest('http://localhost/api/cxc/clientes/CLI-UPD', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creditStatus: 'ON_HOLD',
          creditHoldReason: 'Revisión de cartera',
        }),
      }),
      { params: { code: 'CLI-UPD' } },
    );

    expect(patchResponse.status).toBe(200);
    const patchBody: any = await patchResponse.json();
    expect(patchBody.customer.creditStatus).toBe('ON_HOLD');
    expect(patchBody.customer.creditHoldReason).toMatch(/cartera/i);
  });

  it('rechaza condiciones de pago inconsistentes', async () => {
    const termId = mockCxcStore.paymentTerms.find((term) => term.code === 'NETO15')?.id;
    expect(termId).toBeDefined();

    const response = await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'CLI-TERM-ERR',
          name: 'Cliente con término inválido',
          paymentTermId: termId,
          paymentTermCode: 'CONTADO',
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body: any = await response.json();
    expect(body.message).toMatch(/condición de pago/i);
  });

  it('permite reasignar y limpiar condición de pago', async () => {
    await CustomersPOST(
      buildRequest('http://localhost/api/cxc/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CLI-TERM', name: 'Cliente con término', paymentTermCode: 'NETO15' }),
      }),
    );

    const patchResponse = await CustomerByCodePATCH(
      buildRequest('http://localhost/api/cxc/clientes/CLI-TERM', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentTermCode: 'NETO30' }),
      }),
      { params: { code: 'CLI-TERM' } },
    );

    expect(patchResponse.status).toBe(200);
    const patched: any = await patchResponse.json();
    expect(patched.customer.paymentTermCode).toBe('NETO30');

    const clearResponse = await CustomerByCodePATCH(
      buildRequest('http://localhost/api/cxc/clientes/CLI-TERM', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentTermId: null }),
      }),
      { params: { code: 'CLI-TERM' } },
    );

    expect(clearResponse.status).toBe(200);
    const cleared: any = await clearResponse.json();
    expect(cleared.customer.paymentTermCode).toBeNull();
    expect(cleared.customer.paymentTermId).toBeNull();
  });
});
