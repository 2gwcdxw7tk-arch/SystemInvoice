import { NextRequest } from 'next/server';

import { mockCxcStore } from '@/lib/services/cxc/mock-data';

const requireCxCPermissionsMock = jest.fn(async () => ({
  session: {
    sub: '1',
    role: 'admin',
    permissions: ['customer.credit.manage'],
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

describe('API CxC – Líneas de crédito (mock mode)', () => {
  const { GET: creditLinesGET, POST: creditLinesPOST, PATCH: creditLinesPATCH } = require('@/app/api/cxc/credit-lines/route');
  const { PATCH: creditLineIdPATCH } = require('@/app/api/cxc/credit-lines/[id]/route');

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

  const buildRequest = (url: string, init?: RequestInit) => {
    const request = new Request(url, init) as unknown as NextRequest;
    const parsedUrl = new URL(url);

    (request as any).cookies = {
      get: () => ({ value: 'mock-session' }),
    };
    (request as any).nextUrl = {
      searchParams: parsedUrl.searchParams,
    };
    return request;
  };

  beforeEach(() => {
    resetMockCxcStore();
    requireCxCPermissionsMock.mockClear();
  });

  it('devuelve el overview de líneas de crédito para un cliente', async () => {
    const response = await creditLinesGET(buildRequest('http://localhost/api/cxc/credit-lines?customerCode=RET001'));
    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.overview.customer.code).toBe('RET001');
    expect(body.overview.lines.length).toBeGreaterThan(0);
    expect(body.overview.availableCredit).toBeGreaterThanOrEqual(0);
  });

  it('asigna nueva línea de crédito y sincroniza métricas del cliente', async () => {
    const payload = {
      customerCode: 'RET001',
      approvedLimit: 6000,
      blockedAmount: 250,
      reviewNotes: 'Ajuste mensual',
      reviewerAdminUserId: 99,
    };

    const response = await creditLinesPOST(
      buildRequest('http://localhost/api/cxc/credit-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(201);
    const body: any = await response.json();
    expect(body.line.approvedLimit).toBe(6000);
    expect(body.customer.creditLimit).toBe(6000);
    expect(body.customer.lastCreditReviewAt).toBeTruthy();

    const updatedCustomer = mockCxcStore.customers.find((entry) => entry.code === 'RET001');
    expect(updatedCustomer).toBeTruthy();
    expect(updatedCustomer?.creditLimit).toBe(6000);
    const outstanding = mockCxcStore.documents
      .filter((doc) => doc.customerId === updatedCustomer?.id && doc.status !== 'CANCELADO' && (doc.documentType === 'INVOICE' || doc.documentType === 'DEBIT_NOTE'))
      .reduce((acc, doc) => acc + doc.balanceAmount, 0);
    expect(updatedCustomer?.creditUsed).toBeCloseTo(outstanding, 5);
  });

  it('actualiza una línea de crédito existente y ajusta estado del cliente', async () => {
    const latestLine = mockCxcStore.creditLines[0];
    expect(latestLine).toBeTruthy();

    const response = await creditLineIdPATCH(
      buildRequest(`http://localhost/api/cxc/credit-lines/${latestLine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAUSED', blockedAmount: 400, reviewNotes: 'Revisión por atraso' }),
      }),
      { params: { id: String(latestLine.id) } },
    );

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.line.status).toBe('PAUSED');
    expect(body.customer.creditStatus).toBe('ON_HOLD');

    const storedLine = mockCxcStore.creditLines.find((entry) => entry.id === latestLine.id);
    expect(storedLine?.status).toBe('PAUSED');
    const updatedCustomer = mockCxcStore.customers.find((entry) => entry.id === storedLine?.customerId);
    expect(updatedCustomer?.creditStatus).toBe('ON_HOLD');
  });

  it('actualiza el estado de crédito del cliente de manera directa', async () => {
    const response = await creditLinesPATCH(
      buildRequest('http://localhost/api/cxc/credit-lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerCode: 'RET001', status: 'ACTIVE', creditHoldReason: null }),
      }),
    );

    expect(response.status).toBe(200);
    const body: any = await response.json();
    expect(body.customer.creditStatus).toBe('ACTIVE');
  });
});
