import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, parseSessionCookie } from "@/lib/auth/session";
import { cashRegisterService } from "@/lib/services/CashRegisterService";

function buildCsv(
  report: Awaited<ReturnType<typeof cashRegisterService.getCashRegisterClosureReport>>
): string {
  if (!report) {
    return "";
  }
  const lines: string[] = [];
  lines.push("Campo,Valor");
  lines.push(`Caja,"${report.cashRegister.cashRegisterCode} - ${report.cashRegister.cashRegisterName}"`);
  lines.push(`Almacén,"${report.cashRegister.warehouseCode} - ${report.cashRegister.warehouseName}"`);
  lines.push(`Inicio,"${report.openingAt}"`);
  lines.push(`Cierre,"${report.closingAt}"`);
  lines.push(`Monto apertura,${report.openingAmount.toFixed(2)}`);
  lines.push(`Monto cierre,${report.closingAmount.toFixed(2)}`);
  lines.push(`Total ventas (esperado),${report.expectedTotalAmount.toFixed(2)}`);
  lines.push(`Total reportado,${report.reportedTotalAmount.toFixed(2)}`);
  lines.push(`Diferencia,${report.differenceTotalAmount.toFixed(2)}`);
  lines.push(`Facturas,${report.totalInvoices}`);
  lines.push("");
  lines.push("Método,Esperado,Reportado,Diferencia,Transacciones");
  for (const payment of report.payments) {
    lines.push(
      `${payment.method},${payment.expectedAmount.toFixed(2)},${payment.reportedAmount.toFixed(2)},${payment.differenceAmount.toFixed(2)},${payment.transactionCount}`
    );
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const permissions = Array.isArray(session.permissions) ? session.permissions : [];
  const roles = Array.isArray(session.roles) ? session.roles : [];
  const canView =
    roles.includes("FACTURADOR") ||
    roles.includes("ADMINISTRADOR") ||
    permissions.some((perm) => perm === "cash.report.view");
  if (!canView) {
    return NextResponse.json({ success: false, message: "No tienes permisos para consultar reportes de caja" }, { status: 403 });
  }

  const { sessionId: rawSessionId } = await context.params;
  const sessionId = Number(rawSessionId);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de sesión inválido" }, { status: 400 });
  }

  const report = await cashRegisterService.getCashRegisterClosureReport(sessionId);
  if (!report) {
    return NextResponse.json({ success: false, message: "No se encontró la sesión solicitada" }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "json";
  if (format === "csv") {
    const csv = buildCsv(report);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="cierre-caja-${report.sessionId}.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, report }, { status: 200 });
}
