import { InvoiceService } from '@/lib/services/InvoiceService';
import type { IInvoiceRepository, InvoiceInsertInput, InvoiceInsertResult } from '@/lib/repositories/invoices/IInvoiceRepository';
import { OrderService } from '@/lib/services/orders/OrderService';

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

  beforeEach(() => {
    // Limpiar mocks antes de cada prueba
    jest.clearAllMocks();
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
    expect(mockInvoiceRepository.createInvoice).toHaveBeenCalledTimes(1);
    expect(mockInvoiceRepository.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_number: 'INV-001',
        payments: expect.arrayContaining([expect.objectContaining({ method: 'CASH', amount: 125 })]),
        items: expect.arrayContaining([expect.objectContaining({ description: 'Item 1', quantity: 1 })]),
        movementLines: expect.any(Array),
      })
    );
    expect(mockOrderService.markOrderAsInvoiced).toHaveBeenCalledTimes(0); // No originOrderId in this test
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
    expect(mockInvoiceRepository.createInvoice).toHaveBeenCalledTimes(1);
    expect(mockOrderService.markOrderAsInvoiced).toHaveBeenCalledTimes(1);
    expect(mockOrderService.markOrderAsInvoiced).toHaveBeenCalledWith(
      invoiceInput.originOrderId,
      invoiceInput.invoiceDate
    );
  });

  it('should retrieve an invoice by number', async () => {
    const invoiceNumber = 'INV-003';
    const expectedInvoice: InvoiceInsertResult = { id: 3, invoice_number: invoiceNumber };

    mockInvoiceRepository.getInvoiceByNumber.mockResolvedValue(expectedInvoice);

    const result = await invoiceService.getInvoiceByNumber(invoiceNumber);

    expect(result).toEqual(expectedInvoice);
    expect(mockInvoiceRepository.getInvoiceByNumber).toHaveBeenCalledTimes(1);
    expect(mockInvoiceRepository.getInvoiceByNumber).toHaveBeenCalledWith(invoiceNumber);
  });

  it('should return null if invoice not found by number', async () => {
    const invoiceNumber = 'NON-EXISTENT';

    mockInvoiceRepository.getInvoiceByNumber.mockResolvedValue(null);

    const result = await invoiceService.getInvoiceByNumber(invoiceNumber);

    expect(result).toBeNull();
    expect(mockInvoiceRepository.getInvoiceByNumber).toHaveBeenCalledTimes(1);
    expect(mockInvoiceRepository.getInvoiceByNumber).toHaveBeenCalledWith(invoiceNumber);
  });
});
