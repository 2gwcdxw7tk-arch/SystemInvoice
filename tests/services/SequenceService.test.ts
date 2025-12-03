import type { ISequenceRepository, SequenceDefinitionRecord } from '@/lib/repositories/sequences/ISequenceRepository';
import { SequenceService } from '@/lib/services/SequenceService';
import { cashRegisterService } from '@/lib/services/CashRegisterService';

jest.mock('@/lib/services/CashRegisterService', () => ({
  cashRegisterService: {
    getCashRegisterById: jest.fn(),
    recordInvoiceSequenceUsage: jest.fn(),
  },
}));

function createRepositoryMock(): jest.Mocked<ISequenceRepository> {
  return {
    listDefinitions: jest.fn(),
    getDefinitionByCode: jest.fn(),
    getDefinitionById: jest.fn(),
    createDefinition: jest.fn(),
    updateDefinition: jest.fn(),
    getCounterValue: jest.fn(),
    incrementCounter: jest.fn(),
    listInventoryAssignments: jest.fn(),
    setInventoryAssignment: jest.fn(),
  } as unknown as jest.Mocked<ISequenceRepository>;
}

const definition: SequenceDefinitionRecord = {
  id: 10,
  code: 'FAC-01',
  name: 'Factura POS',
  scope: 'INVOICE',
  prefix: 'FAC-',
  suffix: '',
  padding: 6,
  startValue: 1,
  step: 1,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: null,
};

const inventoryDefinition: SequenceDefinitionRecord = {
  ...definition,
  id: 20,
  code: 'TRF-01',
  name: 'Traslados',
  scope: 'INVENTORY',
  prefix: 'TRF-',
};

const register = {
  id: 5,
  code: 'CAJA-01',
  name: 'Caja 01',
  warehouseId: 1,
  warehouseCode: 'PRINCIPAL',
  warehouseName: 'Principal',
  allowManualWarehouseOverride: false,
  isActive: true,
  notes: null,
  invoiceSequenceDefinitionId: definition.id,
  invoiceSequenceCode: definition.code,
  invoiceSequenceName: definition.name,
  defaultCustomer: null,
};

describe('SequenceService invoice counters', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('usa el contador global al generar folios', async () => {
    const repository = createRepositoryMock();
    repository.getDefinitionById.mockResolvedValue(definition);
    repository.incrementCounter.mockResolvedValue(BigInt(42));

    const service = new SequenceService(repository);

    const mockedCashRegister = cashRegisterService as jest.Mocked<typeof cashRegisterService>;
    mockedCashRegister.getCashRegisterById.mockResolvedValue(register as any);

    const folio = await service.generateInvoiceNumber({
      cashRegisterId: register.id,
      cashRegisterCode: register.code,
      sessionId: 123,
    });

    expect(repository.incrementCounter).toHaveBeenCalledWith(definition, 'GLOBAL', '');
    expect(folio).toBe('FAC-000042');
    expect(mockedCashRegister.recordInvoiceSequenceUsage).toHaveBeenCalledWith(123, 'FAC-000042');
  });

  it('previsualiza el siguiente folio usando el contador global', async () => {
    const repository = createRepositoryMock();
    repository.getDefinitionById.mockResolvedValue(definition);
    repository.getCounterValue.mockResolvedValue(BigInt(99));

    const service = new SequenceService(repository);

    const preview = await service.previewNextForCashRegister(register as any);

    expect(repository.getCounterValue).toHaveBeenCalledWith(definition.id, 'GLOBAL', '');
    expect(preview).toBe('FAC-000100');
  });

    it('comparte el contador global cuando varios movimientos de inventario usan la misma definición', async () => {
      const repository = createRepositoryMock();
      repository.listInventoryAssignments.mockResolvedValue([
        {
          transactionType: 'TRANSFER',
          sequenceDefinitionId: inventoryDefinition.id,
          sequenceCode: inventoryDefinition.code,
          sequenceName: inventoryDefinition.name,
        },
      ]);
      repository.getDefinitionById.mockResolvedValue(inventoryDefinition);
      repository.incrementCounter.mockResolvedValue(BigInt(7));

      const service = new SequenceService(repository);
      const code = await service.generateInventoryCode('TRANSFER');

      expect(repository.incrementCounter).toHaveBeenCalledWith(inventoryDefinition, 'GLOBAL', '');
      expect(code).toBe('TRF-000007');
    });

    it('muestra la previsualización de inventario usando el contador global', async () => {
      const repository = createRepositoryMock();
      repository.listInventoryAssignments.mockResolvedValue([
        {
          transactionType: 'PURCHASE',
          sequenceDefinitionId: inventoryDefinition.id,
          sequenceCode: inventoryDefinition.code,
          sequenceName: inventoryDefinition.name,
        },
      ]);
      repository.getDefinitionById.mockResolvedValue(inventoryDefinition);
      repository.getCounterValue.mockResolvedValue(BigInt(12));

      const service = new SequenceService(repository);
      const assignments = await service.listInventoryAssignments();
      const purchaseAssignment = assignments.find((item) => item.transactionType === 'PURCHASE');

      expect(repository.getCounterValue).toHaveBeenCalledWith(inventoryDefinition.id, 'GLOBAL', '');
      expect(purchaseAssignment?.nextPreview).toBe('TRF-000013');
    });
});
