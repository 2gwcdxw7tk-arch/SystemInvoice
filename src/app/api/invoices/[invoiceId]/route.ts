import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { invoiceService, InvoiceCancellationError } from "@/lib/services/InvoiceService";

export async function GET(_request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }
  try {
    const detail = await invoiceService.getInvoiceDetailById(id);
    if (!detail) {
      return NextResponse.json({ success: false, message: "Factura no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ invoice: detail });
  } catch (error) {
    console.error(`GET /api/invoices/${id} error`, error);
    return NextResponse.json({ success: false, message: "No se pudo obtener la factura" }, { status: 500 });
  }
}

const patchSchema = z.object({ status: z.enum(["ANULADA"]) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  const id = Number(invoiceId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ success: false, message: "Identificador inválido" }, { status: 400 });
  }

  // Solo administradores con permiso de facturación
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Sesión no válida" }, { status: 401 });
  }
  const roles = Array.isArray(session.roles) ? session.roles.map((r) => r.trim().toUpperCase()) : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions.map((p) => p.trim().toLowerCase()) : [];
  const canCancel = roles.includes("FACTURADOR") || permissions.includes("invoice.issue");
  if (!canCancel) {
    return NextResponse.json({ success: false, message: "No tienes permisos para anular facturas" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Parámetros inválidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    await invoiceService.cancelInvoice(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`PATCH /api/invoices/${id} error`, error);
    if (error instanceof InvoiceCancellationError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status ?? 409 });
    }
    const message = error instanceof Error ? error.message : "No se pudo anular la factura";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
