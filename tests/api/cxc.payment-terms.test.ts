import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

const requireCxCPermissionsMock = jest.fn(async () => ({
  session: {
    sub: '1',
    role: 'admin',
    permissions: ['payment-terms.manage'],
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
  Object.assign(mockCxcStore.sequences, snapshot.sequences);
};

describe('API CxC – Condiciones de pago (mock mode)', () => {
  const { GET: PaymentTermsGET, POST: PaymentTermsPOST } = require('@/app/api/preferencias/terminos-pago/route');
  const { PATCH: PaymentTermPATCH, DELETE: PaymentTermDELETE } = require('@/app/api/preferencias/terminos-pago/[code]/route');

  beforeEach(() => {
    resetMockCxcStore();
    requireCxCPermissionsMock.mockClear();
  });

  it('lista las condiciones de pago activas', async () => {
    const response = await PaymentTermsGET(buildRequest('http://localhost/api/preferencias/terminos-pago'));
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0]).toHaveProperty('code');
  });

  it('crea una nueva condición de pago y la persiste en el mock store', async () => {
    const response = await PaymentTermsPOST(
      buildRequest('http://localhost/api/preferencias/terminos-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'NETO45',
          name: 'Neto 45',
          days: 45,
          graceDays: 0,
          description: 'Crédito a 45 días',
          isActive: true,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body.term.code).toBe('NETO45');
    expect(mockCxcStore.paymentTerms.find((term) => term.code === 'NETO45')).toBeDefined();
  });

  it('actualiza y elimina una condición existente', async () => {
    await PaymentTermsPOST(
      buildRequest('http://localhost/api/preferencias/terminos-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'NETO21',
          name: 'Neto 21',
          days: 21,
          graceDays: 0,
        }),
      }),
    );

    const patchResponse = await PaymentTermPATCH(
      buildRequest('http://localhost/api/preferencias/terminos-pago/NETO21', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Neto 21 actualizado', graceDays: 3 }),
      }),
      { params: { code: 'NETO21' } },
    );

    expect(patchResponse.status).toBe(200);
    const updated: any = await patchResponse.json();
    expect(updated.term.name).toContain('actualizado');
    expect(updated.term.graceDays).toBe(3);

    const deleteResponse = await PaymentTermDELETE(
      buildRequest('http://localhost/api/preferencias/terminos-pago/NETO21', { method: 'DELETE' }),
      { params: { code: 'NETO21' } },
    );

    expect(deleteResponse.status).toBe(200);
    expect(mockCxcStore.paymentTerms.find((term) => term.code === 'NETO21')).toBeUndefined();
  });

  it('rechaza códigos duplicados con estado 409', async () => {
    const payload = {
      code: 'NETO120',
      name: 'Neto 120',
      days: 120,
    };

    await PaymentTermsPOST(
      buildRequest('http://localhost/api/preferencias/terminos-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    const duplicated = await PaymentTermsPOST(
      buildRequest('http://localhost/api/preferencias/terminos-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(duplicated.status).toBe(409);
  });
});
