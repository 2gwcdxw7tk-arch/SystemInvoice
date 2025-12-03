import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";
import { adminUserService } from "@/lib/services/AdminUserService";

// Endpoint de preparación de cierre: permite obtener los montos esperados y desglose
// antes de ejecutar la operación de cierre definitiva. No genera HTML; siempre JSON.

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId: rawSessionId } = await context.params;
  const sessionId = Number(rawSessionId);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de sesión inválido" }, { status: 400 });
  }

  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = Array.isArray(session.roles) ? session.roles : [];
  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const canView =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.some((p) => p === "cash.report.view" || p === "cash.register.close" || p === "cash.register.open");
  if (!canView) {
    return NextResponse.json({ success: false, message: "No tienes permisos para consultar preparación de cierre" }, { status: 403 });
  }

  try {
    const report = await cashRegisterService.getCashRegisterClosureReport(sessionId);
    if (!report) {
      return NextResponse.json({ success: false, message: "No se encontró la sesión solicitada" }, { status: 404 });
    }

    // Datos del operador para mejorar contexto (opcional en preview)
    const [openedEntry, closedEntry] = await Promise.all([
      adminUserService.getAdminDirectoryEntry(report.openedByAdminId).catch(() => null),
      adminUserService.getAdminDirectoryEntry(report.closingByAdminId).catch(() => null),
    ]);

    return NextResponse.json(
      {
        success: true,
        preview: {
          sessionId: report.sessionId,
            cashRegister: report.cashRegister,
          openingAmount: report.openingAmount,
          expectedTotalAmount: report.expectedTotalAmount,
          reportedTotalAmount: report.reportedTotalAmount,
          differenceTotalAmount: report.differenceTotalAmount,
          totalInvoices: report.totalInvoices,
          creditTotals: report.creditTotals ?? null,
          payments: report.payments.map((p) => ({
            method: p.method,
            expectedAmount: p.expectedAmount,
            reportedAmount: p.reportedAmount,
            differenceAmount: p.differenceAmount,
            transactionCount: p.transactionCount,
          })),
          status: report.closingAt ? "CLOSED" : "OPEN",
          openedByAdminId: report.openedByAdminId,
          openedBy: openedEntry?.displayName?.trim() || openedEntry?.username || `Usuario ${report.openedByAdminId}`,
          closingByAdminId: report.closingByAdminId,
          closingBy: closedEntry?.displayName?.trim() || closedEntry?.username || `Usuario ${report.closingByAdminId}`,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al preparar el cierre";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
