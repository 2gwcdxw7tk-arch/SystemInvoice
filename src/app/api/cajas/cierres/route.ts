import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, createReportAccessToken, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const paymentSchema = z.object({
  method: z.string().trim().min(1),
  reported_amount: z.number().min(0),
  transaction_count: z.number().int().min(0).optional().default(0),
});

const payloadSchema = z.object({
  session_id: z.number().int().positive().optional(),
  closing_amount: z.number().min(0),
  payments: z.array(paymentSchema).min(1, "Captura al menos un método de pago"),
  closing_notes: z.string().max(400).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canClose =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) => perm === "cash.register.close" || perm === "cash.report.view");
  if (!canClose) {
    return NextResponse.json({ success: false, message: "No tienes permisos para cerrar cajas" }, { status: 403 });
  }

  const isAdministrator =
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) => perm === "admin.users.manage" || perm === "menu.roles.view");

  const rawBody = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Datos inválidos", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const summary = await cashRegisterService.closeCashRegisterSession({
      adminUserId: Number(session.sub),
      sessionId: parsed.data.session_id,
      closingAmount: parsed.data.closing_amount,
      payments: parsed.data.payments.map((payment) => ({
        method: payment.method,
        reportedAmount: payment.reported_amount,
        transactionCount: payment.transaction_count,
      })),
      closingNotes: parsed.data.closing_notes ?? null,
      allowDifferentUser: isAdministrator,
    });

    const requesterId = Number(session.sub);
    const reportToken = await createReportAccessToken({
      reportType: "closure",
      sessionId: summary.sessionId,
      requesterId,
      scope: summary.closingByAdminId === requesterId ? "self" : "admin",
    });

    return NextResponse.json(
      {
        success: true,
        summary,
        report_url: `${request.nextUrl.origin}/api/cajas/cierres/${summary.sessionId}/reporte?format=html&token=${encodeURIComponent(reportToken)}`,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cerrar la caja";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
