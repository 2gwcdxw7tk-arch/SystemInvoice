import type { InvoiceConsumptionLineInput } from "@/lib/types/inventory";

export type InvoiceUnit = "RETAIL" | "STORAGE";

export interface InvoiceItemInput {
  article_code?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  unit?: InvoiceUnit;
}

export interface InvoicePaymentInput {
  method: string;
  amount: number;
  reference: string | null;
}

export interface InvoiceInsertInput {
  invoice_number: string;
  table_code: string | null;
  waiter_code: string | null;
  invoiceDate: Date;
  originOrderId?: number | null;
  subtotal: number;
  service_charge: number;
  vat_amount: number;
  vat_rate: number;
  total_amount: number;
  currency_code: string;
  notes?: string | null;
  customer_name?: string | null;
  customer_tax_id?: string | null;
  payments: InvoicePaymentInput[];
  items?: InvoiceItemInput[];
  issuer_admin_user_id?: number | null;
  cash_register_id?: number | null;
  cash_register_session_id?: number | null;
  cashRegisterWarehouseCode?: string | null;
}

export interface InvoiceItemPersistence {
  article_code?: string | null; // Added article_code
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoicePersistenceInput extends Omit<InvoiceInsertInput, "items" | "payments"> {
  items: InvoiceItemPersistence[];
  payments: InvoicePaymentInput[];
  movementLines: InvoiceConsumptionLineInput[];
}

export interface InvoiceInsertResult {
  id: number;
  invoice_number: string;
}

export interface IInvoiceRepository {
  createInvoice(data: InvoicePersistenceInput): Promise<InvoiceInsertResult>;
  updateInvoiceStatus(invoiceId: number, status: string, cancelledAt?: Date | null): Promise<void>;
  getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null>;
  getInvoiceBasicById(invoiceId: number): Promise<{ id: number; invoice_number: string } | null>;
  getInvoiceDetailById(invoiceId: number): Promise<{
    id: number;
    invoice_number: string;
    status: string;
    cancelled_at: string | null;
    invoice_date: string;
    table_code: string | null;
    waiter_code: string | null;
    subtotal: number;
    service_charge: number;
    vat_amount: number;
    vat_rate: number;
    total_amount: number;
    currency_code: string;
    notes: string | null;
    customer_name: string | null;
    customer_tax_id: string | null;
    items: Array<{ id: number; line_number: number; description: string; quantity: number; unit_price: number; line_total: number; article_code: string | null }>;
    payments: Array<{ id: number; payment_method: string; amount: number; reference: string | null }>;
  } | null>;
  listInvoices(params: {
    from?: string;
    to?: string;
    q?: string;
    table_code?: string;
    waiter_code?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ total: number; items: Array<{
    id: number;
    invoice_number: string;
    status: string;
    invoice_date: string;
    table_code: string | null;
    waiter_code: string | null;
    subtotal: number;
    service_charge: number;
    vat_amount: number;
    total_amount: number;
    currency_code: string;
    customer_name: string | null;
  }> }>;
}
