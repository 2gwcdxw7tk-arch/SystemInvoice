import { env } from "@/lib/env";
import { inventoryService } from "@/lib/services/InventoryService";
import type { InvoiceConsumptionLineInput } from "@/lib/types/inventory";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import type {
  IInvoiceRepository,
  InvoiceInsertInput,
  InvoiceInsertResult,
  InvoiceItemInput,
  InvoiceItemPersistence,
  InvoicePaymentInput,
  InvoicePersistenceInput,
} from "@/lib/repositories/invoices/IInvoiceRepository";
import { InvoiceRepository } from "@/lib/repositories/invoices/InvoiceRepository";
import { OrderRepository } from "@/lib/repositories/orders/OrderRepository";
import { OrderService } from "@/lib/services/orders/OrderService";

function normalizeWarehouseCode(input?: string | null): string | null {
  return input?.trim()?.length ? input.trim().toUpperCase() : null;
}

function buildMovementLinesFromItems(items: InvoiceItemInput[] | undefined): InvoiceConsumptionLineInput[] {
  if (!items || items.length === 0) {
    return [];
  }
  return items
    .filter((item) => {
      const code = item.article_code?.trim();
      return code && code.length > 0 && item.quantity > 0;
    })
    .map((item) => ({
      article_code: item.article_code!.trim().toUpperCase(),
      quantity: item.quantity,
      unit: item.unit === "STORAGE" ? "STORAGE" : "RETAIL",
    }));
}

function normalizeItemsForPersistence(items: InvoiceItemInput[] | undefined): InvoiceItemPersistence[] {
  if (!items || items.length === 0) {
    return [];
  }
  return items.map((item) => {
    const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
    return {
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: lineTotal,
    } satisfies InvoiceItemPersistence;
  });
}

function clonePayment(payment: InvoicePaymentInput): InvoicePaymentInput {
  return {
    method: payment.method,
    amount: payment.amount,
    reference: payment.reference ?? null,
  };
}

// Mock stores (trasladados desde src/lib/db/invoices.ts)
const mockInvoices: InvoiceInsertResult[] = [];
const mockPayments: { invoice_id: number; payment: InvoicePaymentInput }[] = [];
const mockItems: { invoice_id: number; line_number: number; description: string; quantity: number; unit_price: number; line_total: number }[] = [];

export class InvoiceService {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository = new InvoiceRepository(),
    private readonly orderService: OrderService = new OrderService(new OrderRepository())
  ) {}

  async createInvoice(input: InvoiceInsertInput): Promise<InvoiceInsertResult> {
    const payments = input.payments.map(clonePayment);
    const normalizedItems = normalizeItemsForPersistence(input.items);
    const movementLines = buildMovementLinesFromItems(input.items);

    if (env.useMockData) {
      return this.createInvoiceMock({ ...input, payments, items: normalizedItems }, movementLines);
    }

    const persistencePayload: InvoicePersistenceInput = {
      ...input,
      payments,
      items: normalizedItems,
      movementLines,
    };

    const result = await this.invoiceRepository.createInvoice(persistencePayload);

    if (input.originOrderId) {
      await this.orderService.markOrderAsInvoiced(input.originOrderId, input.invoiceDate);
    }

    return result;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
    if (env.useMockData) {
      return mockInvoices.find((invoice) => invoice.invoice_number === invoiceNumber) ?? null;
    }
    return this.invoiceRepository.getInvoiceByNumber(invoiceNumber);
  }

  private async createInvoiceMock(
    input: Omit<InvoicePersistenceInput, "movementLines">,
    movementLines: InvoiceConsumptionLineInput[]
  ): Promise<InvoiceInsertResult> {
    const id = mockInvoices.length + 1;
    const record: InvoiceInsertResult = { id, invoice_number: input.invoice_number };
    mockInvoices.push(record);

    if (input.items.length > 0) {
      input.items.forEach((item, idx) => {
        mockItems.push({
          invoice_id: id,
          line_number: idx + 1,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
        });
      });
    }

    input.payments.forEach((payment) => mockPayments.push({ invoice_id: id, payment }));

    let preparedMovementLines = movementLines.slice();
    const defaultWarehouse = normalizeWarehouseCode(input.cashRegisterWarehouseCode);
    if (preparedMovementLines.length > 0 && defaultWarehouse) {
      preparedMovementLines = preparedMovementLines.map((line) => ({
        ...line,
        warehouse_code: line.warehouse_code ?? defaultWarehouse,
      }));
    }

    if (preparedMovementLines.length > 0) {
      await inventoryService.registerInvoiceMovements({
        invoiceId: id,
        invoiceNumber: input.invoice_number,
        invoiceDate: input.invoiceDate,
        tableCode: input.table_code ?? null,
        customerName: input.customer_name ?? null,
        lines: preparedMovementLines,
      });
    }

    if (input.cash_register_session_id) {
      cashRegisterService.registerInvoiceForSession({
        sessionId: input.cash_register_session_id,
        invoiceId: id,
        totalAmount: input.total_amount,
        payments: input.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
      });
    }

    if (input.originOrderId) {
      await this.orderService.markOrderAsInvoiced(input.originOrderId, input.invoiceDate);
    }

    return record;
  }
}

export const invoiceService = new InvoiceService();
