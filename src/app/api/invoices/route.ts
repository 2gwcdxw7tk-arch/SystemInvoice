import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { insertInvoice } from "@/lib/db/invoices";

const paymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  amount: z.number().nonnegative(),
  reference: z.string().trim().max(80).nullable().optional(),
});

const invoiceSchema = z.object({
  invoice_number: z.string().trim().min(1).max(40),
  table_code: z.string().trim().max(40).nullable().optional(),
  waiter_code: z.string().trim().max(50).nullable().optional(),
  subtotal: z.number().nonnegative(),
  service_charge: z.number().nonnegative(),
  vat_amount: z.number().nonnegative(),
  vat_rate: z.number().min(0),
  total_amount: z.number().nonnegative(),
  currency_code: z.string().trim().length(3),
  notes: z.string().trim().max(300).nullable().optional(),
  customer_name: z.string().trim().max(150).nullable().optional(),
  customer_tax_id: z.string().trim().max(40).nullable().optional(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
  })).optional().default([]),
  payments: z.array(paymentSchema).default([]),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Datos de factura inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    const result = await insertInvoice({
      invoice_number: payload.invoice_number,
      table_code: payload.table_code ?? null,
      waiter_code: payload.waiter_code ?? null,
      subtotal: payload.subtotal,
      service_charge: payload.service_charge,
      vat_amount: payload.vat_amount,
      vat_rate: payload.vat_rate,
      total_amount: payload.total_amount,
      currency_code: payload.currency_code.toUpperCase(),
      notes: payload.notes ?? null,
      customer_name: payload.customer_name ?? null,
      customer_tax_id: payload.customer_tax_id ?? null,
      items: payload.items?.map(i => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price })) ?? [],
      payments: payload.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
    });

    return NextResponse.json({ id: result.id, invoice_number: result.invoice_number }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error", error);
    return NextResponse.json(
      { success: false, message: "No se pudo guardar la factura" },
      { status: 500 }
    );
  }
}
