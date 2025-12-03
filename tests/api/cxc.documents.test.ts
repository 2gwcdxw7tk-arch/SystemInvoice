import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

const requireCxCPermissionsMock = jest.fn(async () => ({
  session: {
    sub: '1',
    role: 'admin',
    permissions: ['customer.documents.manage'],
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
  Object.assign(mockCxcStore.sequences, snapshot.sequences);
};

describe('API CxC – Documentos (mock mode)', () => {
  const { GET: DocumentsGET, POST: DocumentsPOST } = require('@/app/api/cxc/documentos/route');

  beforeEach(() => {
    resetMockCxcStore();
    requireCxCPermissionsMock.mockClear();
  });

  it('lista documentos por cliente y tipo', async () => {
    const response = await DocumentsGET(buildRequest('http://localhost/api/cxc/documentos?customerId=2&types=INVOICE'));
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((doc: any) => doc.customerId === 2 && doc.documentType === 'INVOICE')).toBe(true);
  });

  it('filtra documentos por rango de fechas', async () => {
    const legacyId = mockCxcStore.sequences.document++;
    mockCxcStore.documents.push({
      ...mockCxcStore.documents[0],
      id: legacyId,
      documentNumber: `INV-OLD-${legacyId}`,
      documentDate: '2024-01-05',
      dueDate: '2024-01-20',
      createdAt: '2024-01-05T00:00:00.000Z',
      updatedAt: '2024-01-05T00:00:00.000Z',
    });

    const response = await DocumentsGET(
      buildRequest('http://localhost/api/cxc/documentos?dateFrom=2024-01-01&dateTo=2024-01-10'),
    );
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((doc: any) => doc.documentDate >= '2024-01-01' && doc.documentDate <= '2024-01-10')).toBe(true);
  });

  it('crea un documento y calcula la fecha de vencimiento según la condición de pago', async () => {
    const response = await DocumentsPOST(
      buildRequest('http://localhost/api/cxc/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: 2,
          documentType: 'INVOICE',
          documentNumber: 'INV-TEST-1',
          documentDate: '2025-01-05',
          originalAmount: 250,
          paymentTermCode: 'NETO15',
          reference: 'Pedido 500',
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body.document.documentNumber).toBe('INV-TEST-1');
    expect(body.document.reference).toBe('Pedido 500');
    expect(body.document.dueDate).toBe('2025-01-20');
    expect(mockCxcStore.documents.find((doc) => doc.documentNumber === 'INV-TEST-1')).toBeDefined();
  });
});
