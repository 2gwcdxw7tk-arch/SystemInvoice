import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { SESSION_COOKIE_NAME, createReportAccessToken, parseSessionCookie } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

const paymentSchema = z.object({
  method: z.string().trim().min(1),
  reported_amount: z.number().min(0),
  transaction_count: z.number().int().min(0).optional().default(0),
});

const denominationSchema = z.object({
  currency: z.string().trim().min(3).max(3),
  value: z.number().min(0),
  qty: z.number().int().min(0),
  kind: z.enum(["COIN", "BILL", "OTHER"]).optional(),
});

const payloadSchema = z
  .object({
    session_id: z.number().int().positive().optional(),
    // closing_amount will be computed server-side from facturas; accept but ignore client value
    closing_amount: z.number().min(0).optional().default(0),
    payments: z.array(paymentSchema).min(1, "Captura al menos un método de pago"),
    closing_notes: z.string().max(400).optional().nullable(),
    closing_denominations: z.array(denominationSchema).optional().default([]),
  })
  .superRefine((data, ctx) => {
    // If there is CASH/EFECTIVO with amount>0, denominations become required and must match that amount
    const cashMethodSet = new Set(["CASH", "EFECTIVO"]);
    const reportedCash = data.payments
      .filter((p) => cashMethodSet.has(p.method.trim().toUpperCase()))
      .reduce((acc, p) => acc + p.reported_amount, 0);

    const denoms = data.closing_denominations ?? [];
    if (reportedCash > 0) {
      if (denoms.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debes capturar denominaciones de efectivo", path: ["closing_denominations"] });
        return;
      }
      const currencySet = new Set(denoms.map((d) => d.currency.toUpperCase()));
      if (currencySet.size !== 1 || !currencySet.has(env.currency.local.code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Las denominaciones deben ser en ${env.currency.local.code}`, path: ["closing_denominations"] });
      }
      const sum = denoms.reduce((acc, d) => acc + d.value * d.qty, 0);
      const equal = Math.abs(Number(sum.toFixed(2)) - Number(reportedCash.toFixed(2))) < 0.005;
      if (!equal) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Las denominaciones deben cuadrar con el efectivo reportado", path: ["closing_denominations"] });
      }
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

  const requesterId = Number(session.sub);

  try {
    // Compute expected total from facturas for the session and ensure reported totals match
    // Resolve session id: provided or current active of the user
    const resolvedSessionId = parsed.data.session_id ?? (await cashRegisterService.getActiveCashRegisterSessionByAdmin(requesterId))?.id ?? null;
    if (resolvedSessionId == null) {
      return NextResponse.json({ success: false, message: "No se encontró una sesión de caja abierta" }, { status: 400 });
    }
    const [report, sessionRecord] = await Promise.all([
      cashRegisterService.getCashRegisterClosureReport(resolvedSessionId),
      cashRegisterService.getCashRegisterSessionById(resolvedSessionId),
    ]);
    if (!report) {
      return NextResponse.json({ success: false, message: "No fue posible calcular el total esperado del cierre" }, { status: 400 });
    }
    if (!sessionRecord) {
      return NextResponse.json({ success: false, message: "No se encontró la sesión indicada" }, { status: 404 });
    }
    const expectedTotal = Number((report.expectedTotalAmount || 0).toFixed(2));
    if (sessionRecord.status !== "OPEN") {
      // Sesión ya cerrada: devolver estado y evitar segundo cierre fantasma
      const reportToken = await createReportAccessToken({
        reportType: "closure",
        sessionId: report.sessionId,
        requesterId,
        scope: report.closingByAdminId === requesterId ? "self" : "admin",
      });
      const baseUrl = env.appUrl || request.nextUrl.origin;
      return NextResponse.json({
        success: true,
        already_closed: true,
        summary: report,
        report_url: `${baseUrl}/api/cajas/cierres/${report.sessionId}/reporte?format=html&token=${encodeURIComponent(reportToken)}`,
      }, { status: 200 });
    }
    // Permitimos diferencias; el reporte y las tablas almacenan difference_amount
    // Aun así, normalizamos el total esperado para guardar en closing_amount

    const summary = await cashRegisterService.closeCashRegisterSession({
      adminUserId: requesterId,
      sessionId: resolvedSessionId,
      // Guardamos como monto de cierre el total esperado de facturas
      closingAmount: expectedTotal,
      payments: parsed.data.payments.map((payment) => ({
        method: payment.method,
        reportedAmount: payment.reported_amount,
        transactionCount: payment.transaction_count,
      })),
      closingNotes: parsed.data.closing_notes ?? null,
      allowDifferentUser: isAdministrator,
      closingDenominations: parsed.data.closing_denominations,
    });

    const reportToken = await createReportAccessToken({
      reportType: "closure",
      sessionId: summary.sessionId,
      requesterId,
      scope: summary.closingByAdminId === requesterId ? "self" : "admin",
    });

    const baseUrl = env.appUrl || request.nextUrl.origin;
    // Refrescar snapshot tras cierre para GET /sesion-activa inmediato
    const refreshed = await cashRegisterService.getCashRegisterClosureReport(summary.sessionId);
    return NextResponse.json({
      success: true,
      summary: refreshed ?? summary,
      report_url: `${baseUrl}/api/cajas/cierres/${summary.sessionId}/reporte?format=html&token=${encodeURIComponent(reportToken)}`,
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo cerrar la caja";

    const sessionClosed =
      message.toLowerCase().includes("ya fue cerrada") &&
      (parsed.data.session_id != null || requesterId != null);

    if (sessionClosed) {
      const fallbackSessionId = parsed.data.session_id ?? null;
      if (fallbackSessionId != null) {
        const existingReport = await cashRegisterService.getCashRegisterClosureReport(fallbackSessionId);
        if (existingReport && existingReport.closingAt) {
          const reportToken = await createReportAccessToken({
            reportType: "closure",
            sessionId: existingReport.sessionId,
            requesterId,
            scope: existingReport.closingByAdminId === requesterId ? "self" : "admin",
          });
          const baseUrl = env.appUrl || request.nextUrl.origin;
          return NextResponse.json(
            {
              success: true,
              already_closed: true,
              report_url: `${baseUrl}/api/cajas/cierres/${existingReport.sessionId}/reporte?format=html&token=${encodeURIComponent(reportToken)}`,
            },
            { status: 200 }
          );
        }
      }
    }

    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
