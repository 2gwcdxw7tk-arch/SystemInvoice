import { NextRequest, NextResponse } from "next/server";

import { formatCurrency } from "@/config/currency";
import { SESSION_COOKIE_NAME, parseSessionCookie, verifyReportAccessToken } from "@/lib/auth/session";
import { adminUserService } from "@/lib/services/AdminUserService";
import { cashRegisterService, type CashRegisterReport } from "@/lib/services/CashRegisterService";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

function escapeHtml(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return "Sin registro";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin registro";
  }
  return dateFormatter.format(date);
}

type SessionStatus = "OPEN" | "CLOSED" | "CANCELLED";

function translateStatus(status: SessionStatus): string {
  switch (status) {
    case "OPEN":
      return "Abierta";
    case "CLOSED":
      return "Cerrada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status ?? "-";
  }
}

function resolvePaymentMethodLabel(method: string): string {
  const normalized = method.trim().toUpperCase();
  switch (normalized) {
    case "CASH":
    case "EFECTIVO":
      return "Efectivo";
    case "CARD":
    case "TARJETA":
      return "Tarjeta";
    case "TRANSFER":
    case "TRANSFERENCIA":
      return "Transferencia";
    case "OTHER":
    case "OTRO":
      return "Otros";
    default:
      return method;
  }
}

function buildHtml(params: {
  report: CashRegisterReport;
  openedBy: { name: string; username: string };
  closedBy: { name: string; username: string };
  issuedBy: { name: string; username: string };
  generatedAt: Date;
}): string {
  const { report, openedBy, closedBy, issuedBy, generatedAt } = params;
  const register = report.cashRegister;
  const notes = report.closingNotes?.trim() ? report.closingNotes.trim() : "Sin notas";
  const differenceClass = report.differenceTotalAmount === 0 ? "neutral" : report.differenceTotalAmount > 0 ? "positive" : "negative";
  const sessionStatus: SessionStatus = report.closingAt ? "CLOSED" : "OPEN";
  const differenceLabel = report.differenceTotalAmount === 0 ? "Sin diferencia" : report.differenceTotalAmount > 0 ? "Excedente" : "Faltante";

  const paymentsRows = report.payments.length > 0
    ? report.payments
        .map((payment) => {
          const diffClass = payment.differenceAmount === 0 ? "neutral" : payment.differenceAmount > 0 ? "positive" : "negative";
          return `
        <tr>
          <td>${escapeHtml(resolvePaymentMethodLabel(payment.method))}</td>
          <td>${escapeHtml(formatCurrency(payment.expectedAmount, { currency: "local" }))}</td>
          <td>${escapeHtml(formatCurrency(payment.reportedAmount, { currency: "local" }))}</td>
          <td class="${diffClass}">${escapeHtml(formatCurrency(payment.differenceAmount, { currency: "local" }))}</td>
          <td>${payment.transactionCount}</td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" style="text-align:center; color:#6b7280; padding:24px; font-size:13px;">No se registraron pagos para esta sesión.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reporte de cierre de caja ${escapeHtml(register.cashRegisterCode)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f5; color: #111827; }
    .wrapper { max-width: 900px; margin: 40px auto; padding: 0 24px 40px; }
    .card { background: #ffffff; border-radius: 24px; box-shadow: 0 24px 50px -28px rgba(15, 23, 42, 0.25); padding: 32px; }
    header { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px; }
    h1 { font-size: 26px; font-weight: 600; margin: 0; color: #0f172a; }
    .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .actions { display: flex; gap: 12px; }
    button { background: #2563eb; color: #ffffff; border: none; border-radius: 9999px; padding: 10px 18px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s ease; }
    button:hover { background: #1d4ed8; }
    section + section { margin-top: 28px; }
    .summary-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 18px; padding: 16px; background: #f9fafb; }
    .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
    .summary-value { font-size: 15px; font-weight: 600; color: #111827; }
    .summary-highlight { font-size: 18px; font-weight: 700; }
    .summary-highlight.positive { color: #166534; }
    .summary-highlight.negative { color: #b91c1c; }
    .summary-highlight.neutral { color: #374151; }
    .summary-meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; padding: 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    td { padding: 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    td.neutral { color: #4b5563; }
    td.positive { color: #166534; font-weight: 600; }
    td.negative { color: #b91c1c; font-weight: 600; }
    .notes { white-space: pre-wrap; line-height: 1.6; }
    footer { margin-top: 32px; font-size: 12px; color: #6b7280; text-align: center; }
    @media print {
      body { background: #ffffff; }
      .wrapper { margin: 0; padding: 0; }
      .card { border-radius: 0; box-shadow: none; }
      header { border-bottom: none; margin-bottom: 12px; padding-bottom: 0; }
      .actions { display: none; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <article class="card">
      <header>
        <div>
          <h1>Reporte de cierre de caja</h1>
          <p class="meta">Generado el ${escapeHtml(formatDateTime(generatedAt))}</p>
        </div>
        <div class="actions">
          <button type="button" onclick="window.print()">Imprimir</button>
        </div>
      </header>

      <section>
        <div class="summary-grid">
          <div class="summary-card">
            <p class="summary-label">Caja</p>
            <p class="summary-value">${escapeHtml(register.cashRegisterCode)} • ${escapeHtml(register.cashRegisterName)}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Almacén</p>
            <p class="summary-value">${escapeHtml(register.warehouseCode)} • ${escapeHtml(register.warehouseName)}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Apertura</p>
            <p class="summary-value">${escapeHtml(formatDateTime(report.openingAt))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Cierre</p>
            <p class="summary-value">${escapeHtml(formatDateTime(report.closingAt))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Monto inicial</p>
            <p class="summary-value">${escapeHtml(formatCurrency(report.openingAmount, { currency: "local" }))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Monto declarado</p>
            <p class="summary-highlight">${escapeHtml(formatCurrency(report.closingAmount, { currency: "local" }))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Total esperado</p>
            <p class="summary-value">${escapeHtml(formatCurrency(report.expectedTotalAmount, { currency: "local" }))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Total reportado</p>
            <p class="summary-value">${escapeHtml(formatCurrency(report.reportedTotalAmount, { currency: "local" }))}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Diferencia</p>
            <p class="summary-highlight ${differenceClass}">${escapeHtml(formatCurrency(report.differenceTotalAmount, { currency: "local" }))}</p>
            <p class="summary-meta">${escapeHtml(differenceLabel)}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 style="font-size:18px; font-weight:600; margin:0 0 12px; color:#0f172a;">Responsables</h2>
        <table>
          <tbody>
            <tr>
              <th>Sesión #</th>
              <td>${report.sessionId}</td>
            </tr>
            <tr>
              <th>Cajero apertura</th>
              <td>${escapeHtml(openedBy.name)} <span style="color:#6b7280; font-weight:500;">(${escapeHtml(openedBy.username)})</span></td>
            </tr>
            <tr>
              <th>Cajero cierre</th>
              <td>${escapeHtml(closedBy.name)} <span style="color:#6b7280; font-weight:500;">(${escapeHtml(closedBy.username)})</span></td>
            </tr>
            <tr>
              <th>Emitido por</th>
              <td>${escapeHtml(issuedBy.name)} <span style="color:#6b7280; font-weight:500;">(${escapeHtml(issuedBy.username)})</span></td>
            </tr>
            <tr>
              <th>Estado</th>
              <td>${escapeHtml(translateStatus(sessionStatus))}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2 style="font-size:18px; font-weight:600; margin:0 0 12px; color:#0f172a;">Detalle por método de pago</h2>
        <table>
          <thead>
            <tr>
              <th>Método</th>
              <th>Esperado</th>
              <th>Reportado</th>
              <th>Diferencia</th>
              <th>Transacciones</th>
            </tr>
          </thead>
          <tbody>
            ${paymentsRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2 style="font-size:18px; font-weight:600; margin:0 0 12px; color:#0f172a;">Resumen adicional</h2>
        <table>
          <tbody>
            <tr>
              <th>Total de facturas</th>
              <td>${report.totalInvoices}</td>
            </tr>
            <tr>
              <th>Notas de cierre</th>
              <td class="notes">${escapeHtml(notes)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <footer>
        Sistema de facturación • Documento para control interno de caja
      </footer>
    </article>
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId: rawSessionId } = await context.params;
  const sessionId = Number(rawSessionId);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return NextResponse.json({ success: false, message: "Identificador de sesión inválido" }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (format && format.toLowerCase() !== "html") {
    return NextResponse.json({ success: false, message: "Formato no soportado" }, { status: 400 });
  }

  const tokenRaw = request.nextUrl.searchParams.get("token") ?? undefined;
  const reportToken = tokenRaw ? await verifyReportAccessToken(tokenRaw).catch(() => null) : null;
  if (reportToken && (reportToken.reportType !== "closure" || reportToken.sessionId !== sessionId)) {
    return NextResponse.json({ success: false, message: "Token de acceso inválido" }, { status: 403 });
  }

  const rawSession = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSession);
  if (!session && !reportToken) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const roles = session && Array.isArray(session.roles) ? session.roles : [];
  const permissions = session && Array.isArray(session.permissions) ? session.permissions : [];
  const requesterId = reportToken ? reportToken.requesterId : Number(session?.sub);
  if (!Number.isFinite(requesterId)) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const canViewViaSession =
    !!session &&
    (roles.includes("FACTURADOR") ||
      roles.includes("ADMINISTRADOR") ||
      permissions.some((perm) => perm === "cash.report.view"));
  if (!reportToken && !canViewViaSession) {
    return NextResponse.json({ success: false, message: "No tienes permisos para consultar reportes de caja" }, { status: 403 });
  }

  const report = await cashRegisterService.getCashRegisterClosureReport(sessionId);
  if (!report) {
    return NextResponse.json({ success: false, message: "No se encontró la sesión solicitada" }, { status: 404 });
  }

  const canViewAllViaSession =
    !!session &&
    (roles.includes("ADMINISTRADOR") ||
      permissions.some((perm) => perm === "admin.users.manage" || perm === "menu.roles.view" || perm === "cash.report.view"));

  if (!reportToken) {
    if (!canViewAllViaSession && report.openedByAdminId !== requesterId && report.closingByAdminId !== requesterId) {
      return NextResponse.json({ success: false, message: "No puedes consultar cierres de otros usuarios" }, { status: 403 });
    }
  } else if (reportToken.scope !== "admin" && report.openedByAdminId !== requesterId && report.closingByAdminId !== requesterId) {
    return NextResponse.json({ success: false, message: "El token no permite consultar cierres de otros usuarios" }, { status: 403 });
  }

  const [openedEntry, closedEntry, issuerEntry] = await Promise.all([
    adminUserService.getAdminDirectoryEntry(report.openedByAdminId).catch(() => null),
    adminUserService.getAdminDirectoryEntry(report.closingByAdminId).catch(() => null),
    adminUserService.getAdminDirectoryEntry(requesterId).catch(() => null),
  ]);

  const openedBy = {
    name: openedEntry?.displayName?.trim() || openedEntry?.username || `Usuario ${report.openedByAdminId}`,
    username: openedEntry?.username || String(report.openedByAdminId),
  };
  const closedBy = {
    name: closedEntry?.displayName?.trim() || closedEntry?.username || `Usuario ${report.closingByAdminId}`,
    username: closedEntry?.username || String(report.closingByAdminId),
  };
  const issuedBy = {
    name: issuerEntry?.displayName?.trim() || issuerEntry?.username || session?.name || `Usuario ${requesterId}`,
    username: issuerEntry?.username || session?.name || String(requesterId),
  };

  const generatedAt = new Date();
  const enrichedReport: CashRegisterReport = {
    ...report,
    issuerName: issuedBy.name,
  };

  const html = buildHtml({
    report: enrichedReport,
    openedBy,
    closedBy,
    issuedBy,
    generatedAt,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
