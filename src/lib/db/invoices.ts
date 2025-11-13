import "server-only";

import { env } from "@/lib/env";
import { getPool, sql } from "@/lib/db/mssql";

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

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    const request = new sql.Request(tx);
    request.input("invoice_number", sql.NVarChar(40), data.invoice_number);
    request.input("table_code", sql.NVarChar(40), data.table_code);
    request.input("waiter_code", sql.NVarChar(50), data.waiter_code);
  request.input("subtotal", sql.Decimal(18,2), data.subtotal);
    request.input("service_charge", sql.Decimal(18,2), data.service_charge);
    request.input("vat_amount", sql.Decimal(18,2), data.vat_amount);
    request.input("vat_rate", sql.Decimal(9,4), data.vat_rate);
    request.input("total_amount", sql.Decimal(18,2), data.total_amount);
    request.input("currency_code", sql.NVarChar(3), data.currency_code);
    request.input("notes", sql.NVarChar(300), data.notes ?? null);
  request.input("customer_name", sql.NVarChar(150), data.customer_name ?? null);
  request.input("customer_tax_id", sql.NVarChar(40), data.customer_tax_id ?? null);

    const insertInvoiceResult = await request.query<{ id: number }>(`
      INSERT INTO app.invoices (
        invoice_number, table_code, waiter_code, subtotal, service_charge, vat_amount, vat_rate, total_amount, currency_code, notes, customer_name, customer_tax_id
      ) VALUES (
        @invoice_number, @table_code, @waiter_code, @subtotal, @service_charge, @vat_amount, @vat_rate, @total_amount, @currency_code, @notes, @customer_name, @customer_tax_id
      );
      SELECT SCOPE_IDENTITY() AS id;`);

    const invoiceId = Number(insertInvoiceResult.recordset[0]?.id);
    if (!invoiceId || Number.isNaN(invoiceId)) throw new Error("No se pudo obtener el ID de la factura");

    if (data.payments.length > 0) {
      for (const p of data.payments) {
        const payReq = new sql.Request(tx);
        payReq.input("invoice_id", sql.BigInt, invoiceId);
        payReq.input("payment_method", sql.NVarChar(30), p.method);
        payReq.input("amount", sql.Decimal(18,2), p.amount);
        payReq.input("reference", sql.NVarChar(80), p.reference ?? null);
        await payReq.query(`INSERT INTO app.invoice_payments (invoice_id, payment_method, amount, reference) VALUES (@invoice_id, @payment_method, @amount, @reference);`);
      }
    }

    if (data.items && data.items.length > 0) {
      let line = 1;
      for (const it of data.items) {
        const itemsReq = new sql.Request(tx);
        itemsReq.input("invoice_id", sql.BigInt, invoiceId);
        itemsReq.input("line_number", sql.Int, line++);
        itemsReq.input("description", sql.NVarChar(200), it.description);
        itemsReq.input("quantity", sql.Decimal(18,4), it.quantity);
        itemsReq.input("unit_price", sql.Decimal(18,6), it.unit_price);
        itemsReq.input("line_total", sql.Decimal(18,2), Math.round(it.quantity * it.unit_price * 100) / 100);
        await itemsReq.query(`
          INSERT INTO app.invoice_items (invoice_id, line_number, description, quantity, unit_price, line_total)
          VALUES (@invoice_id, @line_number, @description, @quantity, @unit_price, @line_total);
        `);
      }
    }

    await tx.commit();
    return { id: invoiceId, invoice_number: data.invoice_number };
  } catch (error) {
    await tx.rollback();
    console.error("Error al insertar factura", error);
    throw error;
  }
}

export async function getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceInsertResult | null> {
  if (env.useMockData) {
    return mockInvoices.find(m => m.invoice_number === invoiceNumber) ?? null;
  }
  const pool = await getPool();
  const req = pool.request();
  req.input("invoice_number", sql.NVarChar(40), invoiceNumber);
  const result = await req.query<{ id: number; invoice_number: string }>("SELECT id, invoice_number FROM app.invoices WHERE invoice_number = @invoice_number");
  const row = result.recordset[0];
  return row ? { id: Number(row.id), invoice_number: row.invoice_number } : null;
}
