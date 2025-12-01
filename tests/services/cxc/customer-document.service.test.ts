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

const { customerDocumentService } = require('@/lib/services/cxc/CustomerDocumentService');

describe('CustomerDocumentService – sincronización de crédito (mock mode)', () => {
  const snapshot = JSON.parse(JSON.stringify(mockCxcStore));

  const resetMockCxcStore = () => {
    const copyArray = (target: any[], source: any[]) => {
      target.splice(0, target.length, ...source.map((item: any) => ({ ...item })));
    };

    copyArray(mockCxcStore.documents, snapshot.documents);
    copyArray(mockCxcStore.customers, snapshot.customers);
    copyArray(mockCxcStore.paymentTerms, snapshot.paymentTerms);
    copyArray(mockCxcStore.applications, snapshot.applications);
    copyArray(mockCxcStore.creditLines, snapshot.creditLines);
    copyArray(mockCxcStore.collectionLogs, snapshot.collectionLogs ?? []);
    copyArray(mockCxcStore.disputes, snapshot.disputes ?? []);
    Object.assign(mockCxcStore.sequences, JSON.parse(JSON.stringify(snapshot.sequences)));
  };

  const computeOutstanding = (customerId: number) => {
    const total = mockCxcStore.documents
      .filter(
        (doc) =>
          doc.customerId === customerId &&
          doc.status !== 'CANCELADO' &&
          (doc.documentType === 'INVOICE' || doc.documentType === 'DEBIT_NOTE') &&
          doc.balanceAmount > 0,
      )
      .reduce((acc, doc) => acc + doc.balanceAmount, 0);

    return Number(Math.max(0, total).toFixed(2));
  };

  beforeEach(() => {
    resetMockCxcStore();
  });

  it('sincroniza el crédito consumido cuando se actualiza el saldo del documento', async () => {
    await customerDocumentService.update(1, { balanceAmount: 400 });

    const expectedOutstanding = computeOutstanding(2);
    const customer = mockCxcStore.customers.find((entry) => entry.id === 2);
    expect(customer).toBeTruthy();
    expect(customer?.creditUsed).toBeCloseTo(expectedOutstanding, 5);
  });

  it('recalcula el crédito tras ajustar el balance a cero', async () => {
    await customerDocumentService.adjustBalance(1, -900);

    const expectedOutstanding = computeOutstanding(2);
    const customer = mockCxcStore.customers.find((entry) => entry.id === 2);
    expect(customer).toBeTruthy();
    expect(customer?.creditUsed).toBeCloseTo(expectedOutstanding, 5);
    expect(expectedOutstanding).toBe(0);
  });

  it('sincroniza el crédito cuando el documento pasa a estado CANCELADO', async () => {
    await customerDocumentService.setStatus(1, 'CANCELADO');

    const expectedOutstanding = computeOutstanding(2);
    const customer = mockCxcStore.customers.find((entry) => entry.id === 2);
    expect(customer).toBeTruthy();
    expect(customer?.creditUsed).toBeCloseTo(expectedOutstanding, 5);
    expect(expectedOutstanding).toBe(0);
  });
});
