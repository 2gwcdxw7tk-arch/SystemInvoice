import "server-only";

import { env } from "@/lib/env";
import { query, withTransaction } from "@/lib/db/postgres";

// Tipos para la factura y pagos
export interface InvoicePaymentInput {
  method: string; // CASH | CARD | TRANSFER | OTHER
  amount: number;
  reference: string | null;
}

export interface InvoiceInsertInput {
  invoice_number: string;
  table_code: string | null;
  waiter_code: string | null;
  subtotal: number;
  service_charge: number;
  vat_amount: number;
  vat_rate: number;
  total_amount: number;
  currency_code: string;
  notes?: string | null;
  customer_name?: string | null;
  customer_tax_id?: string | null;
  items?: Array<{ description: string; quantity: number; unit_price: number }>; // opcional
  payments: InvoicePaymentInput[];
}

export interface InvoiceInsertResult {
  id: number;
  invoice_number: string;
}

// Memoria para modo MOCK_DATA
const mockInvoices: InvoiceInsertResult[] = [];
const mockPayments: { invoice_id: number; payment: InvoicePaymentInput }[] = [];
const mockItems: { invoice_id: number; line_number: number; description: string; quantity: number; unit_price: number; line_total: number }[] = [];

export async function insertInvoice(data: InvoiceInsertInput): Promise<InvoiceInsertResult> {
  if (env.useMockData) {
    // Simula persistencia en memoria
    const id = mockInvoices.length + 1;
    const record: InvoiceInsertResult = { id, invoice_number: data.invoice_number };
    mockInvoices.push(record);
    if (data.items && data.items.length > 0) {
      data.items.forEach((it, idx) => {
        mockItems.push({ invoice_id: id, line_number: idx + 1, description: it.description, quantity: it.quantity, unit_price: it.unit_price, line_total: Math.round(it.quantity * it.unit_price * 100) / 100 });
      });
    }
    data.payments.forEach(p => mockPayments.push({ invoice_id: id, payment: p }));
    return record;
  }

  const insertResult = await withTransaction(async (client) => {
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO app.invoices (
         invoice_number, table_code, waiter_code, subtotal, service_charge, vat_amount, vat_rate, total_amount, currency_code, notes, customer_name, customer_tax_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       )
       RETURNING id`,
      [
        data.invoice_number,
        data.table_code,
        data.waiter_code,
        data.subtotal,
        data.service_charge,
        data.vat_amount,
        data.vat_rate,
        data.total_amount,
        data.currency_code,
        data.notes ?? null,
        data.customer_name ?? null,
        data.customer_tax_id ?? null,
      ]
    );

    const invoiceId = Number(inserted.rows[0]?.id);
    if (!invoiceId || Number.isNaN(invoiceId)) {
      throw new Error("No se pudo obtener el ID de la factura");
    }

    if (data.payments.length > 0) {
      for (const payment of data.payments) {
        await client.query(
          `INSERT INTO app.invoice_payments (invoice_id, payment_method, amount, reference)
           VALUES ($1, $2, $3, $4)`,
          [invoiceId, payment.method, payment.amount, payment.reference ?? null]
        );
      }
    }

    if (data.items && data.items.length > 0) {
      let line = 1;
      for (const item of data.items) {
        const lineTotal = Math.round(item.quantity * item.unit_price * 100) / 100;
        await client.query(
          `INSERT INTO app.invoice_items (invoice_id, line_number, description, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [invoiceId, line++, item.description, item.quantity, item.unit_price, lineTotal]
        );
      }
    }

    return { id: invoiceId, invoice_number: data.invoice_number } as InvoiceInsertResult;
  });

  return insertResult;
}

export async function getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
  if (env.useMockData) {
    return mockInvoices.find(m => m.invoice_number === invoiceNumber) ?? null;
  }
  const result = await query<{ id: number; invoice_number: string }>(
    "SELECT id, invoice_number FROM app.invoices WHERE invoice_number = $1",
    [invoiceNumber]
  );
  const row = result.rows[0];
  return row ? { id: Number(row.id), invoice_number: row.invoice_number } : null;
}
