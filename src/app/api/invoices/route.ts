import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import { invoiceService } from "@/lib/services/InvoiceService";
import { toCentralClosedDate } from "@/lib/utils/date";

const paymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  amount: z.number().nonnegative(),
  reference: z.string().trim().max(80).nullable().optional(),
});

const invoiceSchema = z.object({
  invoice_number: z.string().trim().max(40).optional(),
  table_code: z.string().trim().max(40).nullable().optional(),
  waiter_code: z.string().trim().max(50).nullable().optional(),
  invoice_date: z
    .string()
    .trim()
    .refine((value) => {
      const date = new Date(value);
      return !Number.isNaN(date.getTime());
    }, { message: "Fecha de factura inválida" }),
  origin_order_id: z.number().int().positive().nullable().optional(),
  subtotal: z.number().nonnegative(),
  service_charge: z.number().nonnegative(),
  vat_amount: z.number().nonnegative(),
  vat_rate: z.number().min(0),
  total_amount: z.number().nonnegative(),
  currency_code: z.string().trim().length(3),
  notes: z.string().trim().max(300).nullable().optional(),
  customer_name: z.string().trim().max(150).nullable().optional(),
  customer_tax_id: z.string().trim().max(40).nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  customer_code: z.string().trim().max(40).nullable().optional(),
  sale_type: z.enum(["CONTADO", "CREDITO"]).nullable().optional(),
  payment_term_code: z.string().trim().max(32).nullable().optional(),
  payment_term_days: z.number().int().min(0).nullable().optional(),
  due_date: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/), z.date(), z.literal(null)]).optional(),
  items: z.array(z.object({
    article_code: z.string().trim().min(1).max(40).nullable().optional(),
    description: z.string().trim().min(1).max(200),
    quantity: z.number().positive(),
    unit_price: z.number().nonnegative(),
    unit: z.enum(["RETAIL", "STORAGE"]).optional(),
  })).optional().default([]),
  payments: z.array(paymentSchema).default([]),
});

function parseInvoiceDate(value: string): Date {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("Fecha vacía");
  }
  try {
    return toCentralClosedDate(normalized);
  } catch {
    throw new Error("Fecha inválida");
  }
}

function parseOptionalDueDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return toCentralClosedDate(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return parseInvoiceDate(value);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles.map((role) => role.trim().toUpperCase()) : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions.map((perm) => perm.trim().toLowerCase()) : [];
  const isFacturador = roles.includes("FACTURADOR") || permissions.includes("invoice.issue");
  if (!isFacturador) {
    return NextResponse.json({ success: false, message: "No tienes permisos para facturar" }, { status: 403 });
  }

  const issuerAdminId = Number(session.sub);
  if (!Number.isInteger(issuerAdminId) || issuerAdminId <= 0) {
    return NextResponse.json({ success: false, message: "Sesión inválida" }, { status: 401 });
  }

  const activeSession = await cashRegisterService.getActiveCashRegisterSessionByAdmin(issuerAdminId);
  if (!activeSession) {
    return NextResponse.json({ success: false, message: "Debes abrir una caja antes de facturar" }, { status: 409 });
  }

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
    const paymentsTotal = payload.payments.reduce((acc, payment) => acc + payment.amount, 0);
    const missingAmount = Math.max(Math.round((payload.total_amount - paymentsTotal) * 100) / 100, 0);
    const retailMode = env.features.retailModeEnabled;
    const saleType = payload.sale_type ?? null;

    if (retailMode) {
      if (!payload.customer_id || payload.customer_id <= 0) {
        return NextResponse.json(
          { success: false, message: "Debes seleccionar un cliente para facturar en modo retail" },
          { status: 400 },
        );
      }
    }

    const allowPendingBalance = retailMode && saleType === "CREDITO";
    if (missingAmount > 0) {
      if (!allowPendingBalance) {
        return NextResponse.json(
          { success: false, message: "No puedes guardar la factura con saldo pendiente. Registra el cobro completo antes de continuar." },
          { status: 409 }
        );
      }
    }

    let invoiceDate: Date;
    try {
      invoiceDate = parseInvoiceDate(payload.invoice_date);
    } catch {
      return NextResponse.json({ success: false, message: "Fecha de factura inválida" }, { status: 400 });
    }
    const result = await invoiceService.createInvoice({
      invoice_number: payload.invoice_number ?? null,
      table_code: payload.table_code ?? null,
      waiter_code: payload.waiter_code ?? null,
      invoiceDate,
      originOrderId: payload.origin_order_id ?? null,
      subtotal: payload.subtotal,
      service_charge: payload.service_charge,
      vat_amount: payload.vat_amount,
      vat_rate: payload.vat_rate,
      total_amount: payload.total_amount,
      currency_code: payload.currency_code.toUpperCase(),
      notes: payload.notes ?? null,
      customer_name: payload.customer_name ?? null,
      customer_tax_id: payload.customer_tax_id ?? null,
      customer_id: payload.customer_id ?? null,
      customer_code: payload.customer_code ?? null,
      sale_type: saleType ?? null,
      payment_term_code: payload.payment_term_code ?? null,
      payment_term_days: payload.payment_term_days ?? null,
      due_date: parseOptionalDueDate(payload.due_date),
      items: payload.items?.map((i) => ({
        article_code: i.article_code ? i.article_code.toUpperCase() : null,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
        unit: i.unit ?? "RETAIL",
      })) ?? [],
      payments: payload.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
      issuer_admin_user_id: issuerAdminId,
      cash_register_id: activeSession.cashRegister.cashRegisterId,
      cash_register_session_id: activeSession.id,
      cash_register_code: activeSession.cashRegister.cashRegisterCode,
      cashRegisterWarehouseCode: activeSession.cashRegister.warehouseCode,
    });

    return NextResponse.json({ id: result.id, invoice_number: result.invoice_number }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error", error);
    const message = error instanceof Error ? error.message : "No se pudo guardar la factura";
    const status = /consecutivo|secuencia/i.test(message) ? 409 : 500;
    return NextResponse.json(
      { success: false, message },
      { status }
    );
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const table_code = url.searchParams.get("table") ?? undefined;
  const waiter_code = url.searchParams.get("waiter") ?? undefined;
  const page = url.searchParams.get("page") ?? undefined;
  const pageSize = url.searchParams.get("pageSize") ?? undefined;

  try {
    const result = await invoiceService.listInvoices({
      from: from || undefined,
      to: to || undefined,
      q: q || undefined,
      table_code,
      waiter_code,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/invoices error", error);
    return NextResponse.json(
      { success: false, message: "No se pudieron listar las facturas" },
      { status: 500 }
    );
  }
}
