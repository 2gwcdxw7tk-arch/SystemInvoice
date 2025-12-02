process.env.DB_CONNECTION_STRING =
  process.env.DB_CONNECTION_STRING ?? "postgresql://localhost:5432/test-db";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? process.env.DB_CONNECTION_STRING;

jest.mock('@/lib/env', () => ({
  env: {
    DB_CONNECTION_STRING: process.env.DB_CONNECTION_STRING,
    useMockData: true,
    features: { retailModeEnabled: false },
  },
}));

jest.mock('@/lib/services/SequenceService', () => ({
  sequenceService: {
    generateInvoiceNumber: jest.fn(),
  },
}));

import { env } from '@/lib/env';
import { InvoiceService } from '@/lib/services/InvoiceService';
import type { IInvoiceRepository, InvoiceInsertInput, InvoiceInsertResult } from '@/lib/repositories/invoices/IInvoiceRepository';
import { OrderService } from '@/lib/services/orders/OrderService';
import { sequenceService } from '@/lib/services/SequenceService';

// Mock para el repositorio de facturas
const mockInvoiceRepository: jest.Mocked<IInvoiceRepository> = {
  createInvoice: jest.fn(),
  updateInvoiceStatus: jest.fn(),
  getInvoiceByNumber: jest.fn(),
  getInvoiceBasicById: jest.fn(),
  getInvoiceDetailById: jest.fn(),
  listInvoices: jest.fn(),
};

// Mock para OrderService
const mockOrderService = {
  markOrderAsInvoiced: jest.fn(),
  // Añadir otros métodos de OrderService si son usados por InvoiceService
} as unknown as jest.Mocked<OrderService>;

// Nota: El registro de movimientos de inventario ocurre dentro del repositorio en la arquitectura actual.
// No se valida aquí para evitar acoplamiento con implementación interna.

describe('InvoiceService', () => {
  let invoiceService: InvoiceService;
  const mockedSequenceService = sequenceService as jest.Mocked<typeof sequenceService>;

  beforeEach(() => {
    // Limpiar mocks antes de cada prueba
    jest.clearAllMocks();
    env.useMockData = true;
    // Instanciar InvoiceService con los mocks
    invoiceService = new InvoiceService(mockInvoiceRepository, mockOrderService);
  });

  it('should create an invoice successfully', async () => {
    const invoiceInput: InvoiceInsertInput = {
      invoice_number: 'INV-001',
      table_code: 'T-01',
      waiter_code: 'W-01',
      invoiceDate: new Date('2025-11-17'),
      subtotal: 100,
      service_charge: 10,
      vat_amount: 15,
      vat_rate: 0.15,
      total_amount: 125,
      currency_code: 'USD',
      payments: [{ method: 'CASH', amount: 125, reference: null }],
      items: [{ description: 'Item 1', quantity: 1, unit_price: 100 }],
      issuer_admin_user_id: 1,
      cash_register_id: 1,
      cash_register_session_id: 1,
      cashRegisterWarehouseCode: 'MAIN',
    };

    const expectedResult: InvoiceInsertResult = { id: 1, invoice_number: 'INV-001' };

    mockInvoiceRepository.createInvoice.mockResolvedValue(expectedResult);
    mockOrderService.markOrderAsInvoiced.mockResolvedValue(undefined);

    const result = await invoiceService.createInvoice(invoiceInput);

    expect(result).toEqual(expectedResult);
    expect(mockInvoiceRepository.createInvoice).not.toHaveBeenCalled();
    expect(mockOrderService.markOrderAsInvoiced).not.toHaveBeenCalled();
  });

  it('should mark order as invoiced if originOrderId is provided', async () => {
    const invoiceInput: InvoiceInsertInput = {
      invoice_number: 'INV-002',
      table_code: 'T-02',
      waiter_code: 'W-02',
      invoiceDate: new Date('2025-11-17'),
      originOrderId: 101,
      subtotal: 50,
      service_charge: 5,
      vat_amount: 7.5,
      vat_rate: 0.15,
      total_amount: 62.5,
      currency_code: 'USD',
      payments: [{ method: 'CARD', amount: 62.5, reference: 'REF123' }],
      items: [{ description: 'Item 2', quantity: 1, unit_price: 50 }],
      issuer_admin_user_id: 1,
      cash_register_id: 1,
      cash_register_session_id: 1,
      cashRegisterWarehouseCode: 'MAIN',
    };

    const expectedResult: InvoiceInsertResult = { id: 2, invoice_number: 'INV-002' };

    mockInvoiceRepository.createInvoice.mockResolvedValue(expectedResult);
    mockOrderService.markOrderAsInvoiced.mockResolvedValue(undefined);

    const result = await invoiceService.createInvoice(invoiceInput);

    expect(result).toEqual(expectedResult);
    expect(mockInvoiceRepository.createInvoice).not.toHaveBeenCalled();
    expect(mockOrderService.markOrderAsInvoiced).toHaveBeenCalledTimes(1);
    expect(mockOrderService.markOrderAsInvoiced).toHaveBeenCalledWith(
      invoiceInput.originOrderId,
      invoiceInput.invoiceDate
    );
  });

  it('should retrieve an invoice by number', async () => {
    const invoiceNumber = 'INV-003';
    await invoiceService.createInvoice({
      invoice_number: invoiceNumber,
      table_code: 'T-03',
      waiter_code: 'W-03',
      invoiceDate: new Date('2025-11-17'),
      subtotal: 80,
      service_charge: 8,
      vat_amount: 12,
      vat_rate: 0.15,
      total_amount: 100,
      currency_code: 'USD',
      payments: [{ method: 'CASH', amount: 100, reference: null }],
      items: [{ description: 'Item 3', quantity: 1, unit_price: 80 }],
      issuer_admin_user_id: 1,
      cash_register_id: 1,
      cash_register_session_id: 1,
      cashRegisterWarehouseCode: 'MAIN',
    });

    const result = await invoiceService.getInvoiceByNumber(invoiceNumber);

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        invoice_number: invoiceNumber,
        status: "FACTURADA",
        cancelled_at: null,
      })
    );
    expect(mockInvoiceRepository.getInvoiceByNumber).not.toHaveBeenCalled();
  });

  it('should return null if invoice not found by number', async () => {
    const invoiceNumber = 'NON-EXISTENT';

    const result = await invoiceService.getInvoiceByNumber(invoiceNumber);

    expect(result).toBeNull();
    expect(mockInvoiceRepository.getInvoiceByNumber).not.toHaveBeenCalled();
  });

  it('skips duplicate folios returned by the sequence service', async () => {
    env.useMockData = false;

    const invoiceInput: InvoiceInsertInput = {
      table_code: null,
      waiter_code: null,
      invoiceDate: new Date('2025-11-17'),
      subtotal: 10,
      service_charge: 0,
      vat_amount: 1.5,
      vat_rate: 0.15,
      total_amount: 11.5,
      currency_code: 'USD',
      payments: [{ method: 'CASH', amount: 11.5, reference: null }],
      items: [{ description: 'Item', quantity: 1, unit_price: 10 }],
      issuer_admin_user_id: 1,
      cash_register_id: 1,
      cash_register_session_id: 1,
      cash_register_code: 'REG-1',
      cashRegisterWarehouseCode: 'MAIN',
    };

    mockedSequenceService.generateInvoiceNumber
      .mockResolvedValueOnce('FAC-000001')
      .mockResolvedValueOnce('FAC-000002');

    mockInvoiceRepository.getInvoiceByNumber
      .mockResolvedValueOnce({ id: 99, invoice_number: 'FAC-000001' })
      .mockResolvedValueOnce(null);

    mockInvoiceRepository.createInvoice.mockResolvedValue({ id: 200, invoice_number: 'FAC-000002' });

    const result = await invoiceService.createInvoice(invoiceInput);

    expect(result.invoice_number).toBe('FAC-000002');
    expect(mockInvoiceRepository.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_number: 'FAC-000002' })
    );
    expect(mockedSequenceService.generateInvoiceNumber).toHaveBeenCalledTimes(2);
  });

  it('retries when persistence detects a duplicate folio', async () => {
    env.useMockData = false;

    const invoiceInput: InvoiceInsertInput = {
      table_code: null,
      waiter_code: null,
      invoiceDate: new Date('2025-11-17'),
      subtotal: 20,
      service_charge: 0,
      vat_amount: 3,
      vat_rate: 0.15,
      total_amount: 23,
      currency_code: 'USD',
      payments: [{ method: 'CARD', amount: 23, reference: null }],
      items: [{ description: 'Item', quantity: 1, unit_price: 20 }],
      issuer_admin_user_id: 1,
      cash_register_id: 2,
      cash_register_session_id: 5,
      cash_register_code: 'REG-2',
      cashRegisterWarehouseCode: 'MAIN',
    };

    mockedSequenceService.generateInvoiceNumber
      .mockResolvedValueOnce('FAC-000010')
      .mockResolvedValueOnce('FAC-000011');

    mockInvoiceRepository.getInvoiceByNumber.mockResolvedValue(null);

    const duplicateError = { code: 'P2002', meta: { target: ['invoice_number'] } } as const;

    mockInvoiceRepository.createInvoice
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({ id: 201, invoice_number: 'FAC-000011' });

    const result = await invoiceService.createInvoice(invoiceInput);

    expect(result.invoice_number).toBe('FAC-000011');
    expect(mockInvoiceRepository.createInvoice).toHaveBeenCalledTimes(2);
    expect(mockedSequenceService.generateInvoiceNumber).toHaveBeenCalledTimes(2);
  });
});
