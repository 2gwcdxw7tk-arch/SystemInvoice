import { env } from "@/lib/env";
import { toCentralClosedDate } from "@/lib/utils/date";
import { inventoryService } from "@/lib/services/InventoryService";
import { customerService } from "@/lib/services/cxc/CustomerService";
import { customerDocumentService } from "@/lib/services/cxc/CustomerDocumentService";
import { customerCreditLineService } from "@/lib/services/cxc/CustomerCreditLineService";
import { paymentTermService } from "@/lib/services/cxc/PaymentTermService";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import { sequenceService } from "@/lib/services/SequenceService";
import type { InvoiceConsumptionLineInput } from "@/lib/types/inventory";
import type { PaymentTermDTO } from "@/lib/types/cxc";
import type {
  IInvoiceRepository,
  InvoiceInsertInput,
  InvoiceInsertResult,
  InvoiceItemInput,
  InvoiceItemPersistence,
  InvoicePaymentInput,
  InvoicePersistenceInput,
  InvoiceSaleType,
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
      article_code: item.article_code ?? null,
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
type MockInvoiceRec = InvoiceInsertResult & { status: string; cancelled_at: string | null };
const mockInvoices: MockInvoiceRec[] = [];
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

    const invoiceNumber = await this.resolveInvoiceNumber(input);

    const roundCurrency = (value: number) => Math.round(value * 100) / 100;
    const totalAmount = roundCurrency(input.total_amount);
    const paymentsTotal = roundCurrency(payments.reduce((acc, payment) => acc + payment.amount, 0));
    const missingAmount = Math.max(roundCurrency(totalAmount - paymentsTotal), 0);

    const isRetailMode = env.features.retailModeEnabled;

    const resolvedCustomerId: number | null = input.customer_id ?? null;
    let resolvedCustomerCode: string | null = input.customer_code ?? null;
    let resolvedSaleType: InvoiceSaleType | null = input.sale_type ?? null;
    let resolvedPaymentTerm: PaymentTermDTO | null = null;
    let resolvedDueDate: Date | null = input.due_date ?? null;
    let outstandingAmount = 0;
    let customerDocumentPayload: InvoicePersistenceInput["customerDocument"];

    if (isRetailMode) {
      if (!resolvedCustomerId || resolvedCustomerId <= 0) {
        throw new Error("Debes seleccionar un cliente para facturar en modo retail");
      }

      const customerRecord = await customerService.getById(resolvedCustomerId);
      if (!customerRecord) {
        throw new Error("El cliente indicado no existe");
      }

      resolvedCustomerCode = customerRecord.code;
      resolvedSaleType = resolvedSaleType ?? "CONTADO";

      if (resolvedSaleType === "CONTADO" && missingAmount > 0) {
        throw new Error("No puedes guardar la factura con saldo pendiente. Registra el cobro completo antes de continuar.");
      }

      if (resolvedSaleType === "CREDITO") {
        outstandingAmount = missingAmount > 0 ? missingAmount : roundCurrency(totalAmount - paymentsTotal);
        outstandingAmount = Math.max(outstandingAmount, 0);

        if (customerRecord.creditStatus === "BLOCKED") {
          throw new Error("El cliente está bloqueado para crédito");
        }

        const overview = await customerCreditLineService.getOverview(customerRecord.code);
        if (overview.customer.creditStatus === "BLOCKED") {
          throw new Error("El cliente está bloqueado para crédito");
        }

        const creditLimit = roundCurrency(overview.customer.creditLimit);
        if (creditLimit > 0) {
          const projectedUsage = roundCurrency(overview.customer.creditUsed + outstandingAmount);
          if (outstandingAmount > 0 && projectedUsage > creditLimit + 0.0001) {
            throw new Error("El cliente no cuenta con crédito disponible para esta factura");
          }
        }

        if (outstandingAmount <= 0) {
          resolvedSaleType = "CONTADO";
        }
      } else {
        outstandingAmount = 0;
      }

      const requestedPaymentTermCode = input.payment_term_code ?? customerRecord.paymentTermCode ?? null;
      if (requestedPaymentTermCode) {
        const term = await paymentTermService.getByCode(requestedPaymentTermCode);
        if (!term) {
          throw new Error("La condición de pago indicada no existe");
        }
        resolvedPaymentTerm = term;
      } else if (customerRecord.paymentTermId) {
        const term = await paymentTermService.getById(customerRecord.paymentTermId);
        if (term) {
          resolvedPaymentTerm = term;
        }
      }

      const dueDate = paymentTermService.calculateDueDate(input.invoiceDate, resolvedPaymentTerm);
      resolvedDueDate = dueDate;

      const documentStatus = outstandingAmount > 0 ? "PENDIENTE" : "PAGADO";
      customerDocumentPayload = {
        customerId: resolvedCustomerId,
        documentType: "INVOICE",
        documentNumber: invoiceNumber,
        documentDate: input.invoiceDate,
        dueDate,
        currencyCode: input.currency_code,
        originalAmount: totalAmount,
        balanceAmount: outstandingAmount,
        status: documentStatus,
        reference: null,
        notes: input.notes ?? null,
        paymentTermId: resolvedPaymentTerm?.id ?? null,
        metadata: { saleType: resolvedSaleType ?? "CONTADO" },
      };
    } else if (missingAmount > 0) {
      throw new Error("No puedes guardar la factura con saldo pendiente. Registra el cobro completo antes de continuar.");
    }

    if (env.useMockData) {
      return this.createInvoiceMock(
        {
          ...input,
          customer_id: resolvedCustomerId,
          customer_code: resolvedCustomerCode ?? null,
          sale_type: resolvedSaleType,
          payment_term_id: resolvedPaymentTerm?.id ?? null,
          payment_term_code: resolvedPaymentTerm?.code ?? null,
          due_date: resolvedDueDate ?? null,
          invoice_number: invoiceNumber,
          payments,
          items: normalizedItems,
          customerDocument: customerDocumentPayload,
        },
        movementLines
      );
    }

    const persistencePayload: InvoicePersistenceInput = {
      ...input,
      customer_id: resolvedCustomerId,
      customer_code: resolvedCustomerCode ?? null,
      sale_type: resolvedSaleType,
      payment_term_id: resolvedPaymentTerm?.id ?? null,
      payment_term_code: resolvedPaymentTerm?.code ?? null,
      due_date: resolvedDueDate ?? null,
      invoice_number: invoiceNumber,
      payments,
      items: normalizedItems,
      movementLines,
      customerDocument: customerDocumentPayload,
    };

    const result = await this.invoiceRepository.createInvoice(persistencePayload);

    if (input.originOrderId) {
      await this.orderService.markOrderAsInvoiced(input.originOrderId, input.invoiceDate);
    }

    if (env.features.retailModeEnabled && resolvedCustomerId) {
      await customerCreditLineService.syncCustomerCreditUsageByCustomerId(resolvedCustomerId);
    }

    return result;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
    if (env.useMockData) {
      return mockInvoices.find((invoice) => invoice.invoice_number === invoiceNumber) ?? null;
    }
    return this.invoiceRepository.getInvoiceByNumber(invoiceNumber);
  }

  async getInvoiceDetailById(invoiceId: number) {
    if (env.useMockData) {
      const inv = mockInvoices.find((i) => i.id === invoiceId);
      if (!inv) return null;
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        status: inv.status,
        cancelled_at: inv.cancelled_at,
        invoice_date: new Date().toISOString(),
        table_code: null,
        waiter_code: null,
        subtotal: 0,
        service_charge: 0,
        vat_amount: 0,
        vat_rate: 0,
        total_amount: 0,
        currency_code: "NIO",
        notes: null,
        customer_name: null,
        customer_tax_id: null,
        items: mockItems.filter((m) => m.invoice_id === inv.id).map((m) => ({
          id: m.line_number,
          line_number: m.line_number,
          description: m.description,
          quantity: m.quantity,
          unit_price: m.unit_price,
          line_total: m.line_total,
          article_code: null,
        })),
        payments: mockPayments.filter((p) => p.invoice_id === inv.id).map((p, idx) => ({
          id: idx + 1,
          payment_method: p.payment.method,
          amount: p.payment.amount,
          reference: p.payment.reference ?? null,
        })),
      } as const;
    }
    return this.invoiceRepository.getInvoiceDetailById(invoiceId);
  }

  async listInvoices(params: {
    from?: string;
    to?: string;
    q?: string;
    table_code?: string;
    waiter_code?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (env.useMockData) {
      return { total: mockInvoices.length, items: mockInvoices.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        status: i.status,
        invoice_date: new Date().toISOString(),
        table_code: null,
        waiter_code: null,
        subtotal: 0,
        service_charge: 0,
        vat_amount: 0,
        total_amount: 0,
        currency_code: "NIO",
        customer_name: null,
      })) } as const;
    }
    return this.invoiceRepository.listInvoices(params);
  }

  async cancelInvoice(invoiceId: number): Promise<void> {
    if (env.useMockData) {
      const rec = mockInvoices.find((i) => i.id === invoiceId);
      if (rec && rec.status !== "ANULADA") {
        rec.status = "ANULADA";
        rec.cancelled_at = toCentralClosedDate(new Date()).toISOString();
      }
      return;
    }
    const basic = await this.invoiceRepository.getInvoiceBasicById(invoiceId);
    if (!basic) {
      throw new Error("Factura no encontrada");
    }
    // Revertir movimientos de inventario referenciados por el número de factura
    await inventoryService.reverseInvoiceMovements({ invoiceNumber: basic.invoice_number });
    // Marcar factura como ANULADA (soft-cancel)
    const cancellationDate = toCentralClosedDate(new Date());
    await this.invoiceRepository.updateInvoiceStatus(invoiceId, "ANULADA", cancellationDate);
  }

  private async createInvoiceMock(
    input: Omit<InvoicePersistenceInput, "movementLines">,
    movementLines: InvoiceConsumptionLineInput[]
  ): Promise<InvoiceInsertResult> {
    const id = mockInvoices.length + 1;
    const record: InvoiceInsertResult = { id, invoice_number: input.invoice_number };
    mockInvoices.push({ ...record, status: "FACTURADA", cancelled_at: null });

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

    // En modo mock no registramos movimientos reales de inventario

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

    if (input.customerDocument) {
      await customerDocumentService.create({
        ...input.customerDocument,
        relatedInvoiceId: id,
      });
    }

    return record;
  }

  private async resolveInvoiceNumber(input: InvoiceInsertInput): Promise<string> {
    const provided = input.invoice_number?.trim();

    if (env.useMockData) {
      return provided && provided.length > 0 ? provided : `F-MOCK-${Date.now()}`;
    }

    if (!input.cash_register_id || !input.cash_register_session_id) {
      throw new Error("Configura un consecutivo para la caja antes de facturar");
    }

    return sequenceService.generateInvoiceNumber({
      cashRegisterId: input.cash_register_id,
      cashRegisterCode: input.cash_register_code ?? "",
      sessionId: input.cash_register_session_id,
    });
  }
}

export const invoiceService = new InvoiceService();
