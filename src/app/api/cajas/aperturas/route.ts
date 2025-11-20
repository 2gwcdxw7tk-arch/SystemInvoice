import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, createReportAccessToken, parseSessionCookie } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const denominationSchema = z.object({
  currency: z.string().trim().min(3).max(3),
  value: z.number().min(0),
  qty: z.number().int().min(0),
  kind: z.enum(["COIN", "BILL", "OTHER"]).optional(),
});

const payloadSchema = z.object({
  cash_register_code: z.string().trim().min(1, "Selecciona una caja"),
  opening_amount: z.number().min(0, "El monto de apertura no puede ser negativo"),
  opening_notes: z.string().max(400).optional().nullable(),
  operator_admin_user_id: z.number().int().positive().optional(),
  opening_denominations: z.array(denominationSchema).optional(),
}).superRefine((data, ctx) => {
  const denoms = Array.isArray(data.opening_denominations) ? data.opening_denominations : [];
  const requiresDenoms = data.opening_amount > 0;
  if (requiresDenoms && denoms.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Agrega el detalle de denominaciones cuando el monto sea mayor a 0", path: ["opening_denominations"] });
    return;
  }
  if (denoms.length === 0) {
    return;
  }
  const currencySet = new Set(denoms.map((d) => d.currency.toUpperCase()));
  if (currencySet.size !== 1 || !currencySet.has(env.currency.local.code)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Las denominaciones deben ser en ${env.currency.local.code}`, path: ["opening_denominations"] });
  }
  const sum = denoms.reduce((acc, d) => acc + d.value * d.qty, 0);
  const equal = Math.abs(Number(sum.toFixed(2)) - Number(data.opening_amount.toFixed(2))) < 0.005;
  if (!equal) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La suma de denominaciones debe igualar el monto de apertura", path: ["opening_denominations"] });
  }
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

    const openingDenoms = Array.isArray(parsed.data.opening_denominations) ? parsed.data.opening_denominations : [];

    const result = await cashRegisterService.openCashRegisterSession({
      adminUserId: targetAdminId,
      cashRegisterCode: parsed.data.cash_register_code,
      openingAmount: parsed.data.opening_amount,
      openingNotes: parsed.data.opening_notes ?? null,
      allowUnassigned: isAdministrator,
      actingAdminUserId: actingAdminId !== targetAdminId ? actingAdminId : undefined,
      openingDenominations: openingDenoms.length > 0 ? openingDenoms : undefined,
    });

    const reportToken = await createReportAccessToken({
      reportType: "opening",
      sessionId: result.id,
      requesterId: actingAdminId,
      scope: actingAdminId === targetAdminId ? "self" : "admin",
    });

    const baseUrl = env.appUrl || request.nextUrl.origin;
    const reportUrl = `${baseUrl}/api/cajas/aperturas/${result.id}/reporte?format=html&token=${encodeURIComponent(reportToken)}`;

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
        report_url: reportUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo abrir la caja";
    const status = /ya (tienes|existe)/i.test(message) ? 409 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
