import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

const requireCxCPermissionsMock = jest.fn(async () => ({
  session: {
    sub: '1',
    role: 'admin',
    permissions: ['customer.documents.apply'],
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
  Object.assign(mockCxcStore.sequences, snapshot.sequences);
};

describe('API CxC – Aplicaciones de documentos (mock mode)', () => {
  const { GET: ApplicationsGET, POST: ApplicationsPOST } = require('@/app/api/cxc/documentos/aplicaciones/route');

  beforeEach(() => {
    resetMockCxcStore();
    requireCxCPermissionsMock.mockClear();
  });

  it('aplica un recibo contra una factura y ajusta los saldos pendientes', async () => {
    const response = await ApplicationsPOST(
      buildRequest('http://localhost/api/cxc/documentos/aplicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applications: [
            {
              appliedDocumentId: 3,
              targetDocumentId: 1,
              amount: 400,
              reference: 'Pago parcial',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body.applications).toHaveLength(1);

    const invoice = mockCxcStore.documents.find((doc) => doc.id === 1);
    const receipt = mockCxcStore.documents.find((doc) => doc.id === 3);
    expect(invoice?.balanceAmount).toBeCloseTo(500, 5);
    expect(receipt?.balanceAmount).toBeCloseTo(200, 5);

    const listResponse = await ApplicationsGET(
      buildRequest('http://localhost/api/cxc/documentos/aplicaciones?appliedDocumentId=3'),
    );
    expect(listResponse.status).toBe(200);
    const listBody: any = await listResponse.json();
    expect(listBody.items.some((app: any) => app.reference === 'Pago parcial')).toBe(true);
  });

  it('rechaza aplicaciones cuyo monto excede el saldo disponible', async () => {
    const response = await ApplicationsPOST(
      buildRequest('http://localhost/api/cxc/documentos/aplicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applications: [
            {
              appliedDocumentId: 3,
              targetDocumentId: 1,
              amount: 2000,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(400);
    const invoice = mockCxcStore.documents.find((doc) => doc.id === 1);
    expect(invoice?.balanceAmount).toBe(900);
  });
});
