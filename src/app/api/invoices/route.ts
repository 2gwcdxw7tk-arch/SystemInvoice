import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import { invoiceService } from "@/lib/services/InvoiceService";

const paymentSchema = z.object({
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]),
  amount: z.number().nonnegative(),
  reference: z.string().trim().max(80).nullable().optional(),
});

const invoiceSchema = z.object({
  invoice_number: z.string().trim().min(1).max(40),
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

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  if (dateOnlyMatch) {
    const [year, month, day] = normalized.split("-").map((part) => Number(part));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error("Fecha inválida");
    }
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Fecha inválida");
    }
    return date;
  }

  const parsed = new Date(normalized.includes("T") ? normalized : `${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Fecha inválida");
  }
  return parsed;
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
    let invoiceDate: Date;
    try {
      invoiceDate = parseInvoiceDate(payload.invoice_date);
    } catch {
      return NextResponse.json({ success: false, message: "Fecha de factura inválida" }, { status: 400 });
    }
    const result = await invoiceService.createInvoice({
      invoice_number: payload.invoice_number,
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
      cashRegisterWarehouseCode: activeSession.cashRegister.warehouseCode,
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
