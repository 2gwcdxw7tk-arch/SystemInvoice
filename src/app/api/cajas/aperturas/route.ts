import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, createReportAccessToken, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const payloadSchema = z.object({
  cash_register_code: z.string().trim().min(1, "Selecciona una caja"),
  opening_amount: z.number().min(0, "El monto de apertura no puede ser negativo"),
  opening_notes: z.string().max(400).optional().nullable(),
  operator_admin_user_id: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canOpen =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.includes("cash.register.open");

  if (!canOpen) {
    return NextResponse.json({ success: false, message: "No tienes permisos para abrir cajas" }, { status: 403 });
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
    const actingAdminId = Number(session.sub);
    const targetAdminId = parsed.data.operator_admin_user_id ?? actingAdminId;
    if (!Number.isFinite(targetAdminId)) {
      return NextResponse.json({ success: false, message: "Usuario responsable inválido" }, { status: 400 });
    }
    if (targetAdminId !== actingAdminId && !isAdministrator) {
      return NextResponse.json(
        { success: false, message: "No puedes aperturar cajas en nombre de otros usuarios" },
        { status: 403 }
      );
    }

    const result = await cashRegisterService.openCashRegisterSession({
      adminUserId: targetAdminId,
      cashRegisterCode: parsed.data.cash_register_code,
      openingAmount: parsed.data.opening_amount,
      openingNotes: parsed.data.opening_notes ?? null,
      allowUnassigned: isAdministrator,
      actingAdminUserId: actingAdminId !== targetAdminId ? actingAdminId : undefined,
    });

    const reportToken = await createReportAccessToken({
      reportType: "opening",
      sessionId: result.id,
      requesterId: actingAdminId,
      scope: actingAdminId === targetAdminId ? "self" : "admin",
    });

    return NextResponse.json(
      {
        success: true,
        session: {
          id: result.id,
          openingAmount: result.openingAmount,
          openingAt: result.openingAt,
          openingNotes: result.openingNotes,
          status: result.status,
          cashRegister: result.cashRegister,
        },
        report_url: `${request.nextUrl.origin}/api/cajas/aperturas/${result.id}/reporte?format=html&token=${encodeURIComponent(reportToken)}`,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo abrir la caja";
    const status = /ya (tienes|existe)/i.test(message) ? 409 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
