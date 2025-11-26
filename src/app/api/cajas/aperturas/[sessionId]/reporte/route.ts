import { NextRequest, NextResponse } from "next/server";

import { formatCurrency } from "@/config/currency";
import { SESSION_COOKIE_NAME, parseSessionCookie, verifyReportAccessToken } from "@/lib/auth/session";
import { adminUserService } from "@/lib/services/AdminUserService";
import { cashRegisterService, type CashRegisterSessionRecord } from "@/lib/services/CashRegisterService";

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

function translateStatus(status: CashRegisterSessionRecord["status"]): string {
  switch (status) {
    case "OPEN":
      return "Abierta";
    case "CLOSED":
      return "Cerrada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

function buildOpeningHtml(params: {
  session: CashRegisterSessionRecord;
  operatorName: string;
  operatorUsername: string;
  issuerName: string;
  issuerUsername: string;
  generatedAt: Date;
}): string {
  const { session, operatorName, operatorUsername, issuerName, issuerUsername, generatedAt } = params;
  const cashRegister = session.cashRegister;
  const sessionIdLabel = typeof session.idRaw === "string" && session.idRaw.trim().length > 0
    ? session.idRaw.trim()
    : String(session.id);
  const openingNotes = session.openingNotes?.trim() ? session.openingNotes.trim() : "Sin notas";
  const closingStatus = session.status === "CLOSED" ? formatDateTime(session.closingAt) : "Sin cierre";
  const denominations = Array.isArray(session.openingDenominations) ? session.openingDenominations : [];

  const denomByCurrency = new Map<string, Array<{ value: number; qty: number; kind?: string }>>();
  for (const d of denominations) {
    const code = (d.currency || "").toUpperCase();
    if (!denomByCurrency.has(code)) denomByCurrency.set(code, []);
    denomByCurrency.get(code)!.push({ value: Number(d.value || 0), qty: Math.trunc(Number(d.qty || 0)), kind: d.kind });
  }
  for (const entry of denomByCurrency.values()) {
    entry.sort((a, b) => b.value - a.value);
  }
  const denomSections = Array.from(denomByCurrency.entries()).map(([currency, lines]) => {
    const rows = lines.map((l) => {
      const subtotal = (Number(l.value) || 0) * (Number(l.qty) || 0);
      return `<tr><td>${escapeHtml(l.kind || '-')}</td><td>${escapeHtml(String(l.value))}</td><td>${escapeHtml(String(l.qty))}</td><td>${escapeHtml(formatCurrency(subtotal, { currency }))}</td></tr>`;
    }).join("");
    const total = lines.reduce((acc, l) => acc + (Number(l.value) || 0) * (Number(l.qty) || 0), 0);
    return `
      <section>
        <h3 style="font-size:16px; font-weight:600; margin:16px 0 8px; color:#0f172a;">Denominaciones (${escapeHtml(currency)})</h3>
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Cantidad</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="4" style="text-align:center; color:#6b7280; padding:16px;">Sin detalle</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="3" style="text-align:right;">Total ${escapeHtml(currency)}</th>
              <th>${escapeHtml(formatCurrency(total, { currency }))}</th>
            </tr>
          </tfoot>
        </table>
      </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reporte de apertura de caja ${escapeHtml(cashRegister.cashRegisterCode)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f4f4f5; color: #111827; }
    .wrapper { max-width: 820px; margin: 40px auto; padding: 0 24px 40px; }
    .card { background: #ffffff; border-radius: 24px; box-shadow: 0 20px 45px -20px rgba(15, 23, 42, 0.2); padding: 32px; }
    header { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 600; margin: 0; color: #0f172a; }
    .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .actions { display: flex; gap: 12px; }
    button { background: #2563eb; color: #ffffff; border: none; border-radius: 9999px; padding: 10px 18px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.2s ease; }
    button:hover { background: #1d4ed8; }
    section + section { margin-top: 28px; }
    .summary-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 18px; padding: 16px; background: #f9fafb; }
    .summary-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
    .summary-value { font-size: 15px; font-weight: 600; color: #111827; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; padding: 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
    td { padding: 12px; font-size: 14px; color: #111827; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
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
          <h1>Reporte de apertura de caja</h1>
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
            <p class="summary-value">${escapeHtml(cashRegister.cashRegisterCode)} • ${escapeHtml(cashRegister.cashRegisterName)}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Almacén</p>
            <p class="summary-value">${escapeHtml(cashRegister.warehouseCode)} • ${escapeHtml(cashRegister.warehouseName)}</p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Responsable</p>
            <p class="summary-value">${escapeHtml(operatorName)} <span style="color:#6b7280; font-weight:500;">(${escapeHtml(operatorUsername)})</span></p>
          </div>
          <div class="summary-card">
            <p class="summary-label">Estado actual</p>
            <p class="summary-value">${escapeHtml(translateStatus(session.status))}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 style="font-size:18px; font-weight:600; margin:0 0 12px; color:#0f172a;">Detalles de apertura</h2>
        <table>
          <tbody>
            <tr>
              <th>Fecha y hora de apertura</th>
              <td>${escapeHtml(formatDateTime(session.openingAt))}</td>
            </tr>
            <tr>
              <th>Monto inicial</th>
              <td>${escapeHtml(formatCurrency(session.openingAmount, { currency: "local" }))}</td>
            </tr>
            <tr>
              <th>Notas registradas</th>
              <td class="notes">${escapeHtml(openingNotes)}</td>
            </tr>
            <tr>
              <th>Último cierre</th>
              <td>${escapeHtml(closingStatus)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      ${denominations.length > 0 ? denomSections : `
      <section>
        <h2 style="font-size:18px; font-weight:600; margin:16px 0 12px; color:#0f172a;">Denominaciones de apertura</h2>
        <div style="color:#6b7280; font-size:13px;">No se registraron denominaciones.</div>
      </section>`}

      <section>
        <h2 style="font-size:18px; font-weight:600; margin:0 0 12px; color:#0f172a;">Registro de emisión</h2>
        <table>
          <tbody>
            <tr>
              <th>Generado por</th>
              <td>${escapeHtml(issuerName)} <span style="color:#6b7280; font-weight:500;">(${escapeHtml(issuerUsername)})</span></td>
            </tr>
            <tr>
              <th>ID de sesión</th>
              <td>#${escapeHtml(sessionIdLabel)}</td>
            </tr>
            <tr>
              <th>Fecha de generación</th>
              <td>${escapeHtml(formatDateTime(generatedAt))}</td>
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
  const normalizedSessionId = typeof rawSessionId === "string" ? rawSessionId.trim() : "";
  if (!/^[0-9]+$/.test(normalizedSessionId)) {
    return NextResponse.json({ success: false, message: "Identificador de sesión inválido" }, { status: 400 });
  }

  const sessionIdNumeric = Number(normalizedSessionId);
  const sessionIdIsSafe = Number.isSafeInteger(sessionIdNumeric) && sessionIdNumeric > 0;

  const format = request.nextUrl.searchParams.get("format");
  if (format && format.toLowerCase() !== "html") {
    return NextResponse.json({ success: false, message: "Formato no soportado" }, { status: 400 });
  }

  const tokenRaw = request.nextUrl.searchParams.get("token") ?? undefined;
  const reportToken = tokenRaw ? await verifyReportAccessToken(tokenRaw).catch(() => null) : null;

  const rawSessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await parseSessionCookie(rawSessionCookie);

  if (!session && !reportToken) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }

  const tokenMismatch = (() => {
    if (!reportToken) {
      return false;
    }
    if (reportToken.reportType !== "opening") {
      return true;
    }
    if (sessionIdIsSafe) {
      return reportToken.sessionId !== sessionIdNumeric;
    }
    return reportToken.sessionId.toString() !== normalizedSessionId;
  })();

  if (tokenMismatch) {
    return NextResponse.json({ success: false, message: "Token de acceso inválido" }, { status: 403 });
  }

  const roles = session && Array.isArray(session.roles) ? session.roles : [];
  const permissions = session && Array.isArray(session.permissions) ? session.permissions : [];
  const requesterId = reportToken ? reportToken.requesterId : Number(session?.sub);
  if (!Number.isFinite(requesterId)) {
    return NextResponse.json({ success: false, message: "Autenticación requerida" }, { status: 401 });
  }
  const canAccessViaSession =
    !!session &&
    (roles.includes("FACTURADOR") ||
      roles.includes("ADMINISTRADOR") ||
      permissions.some((perm) => perm === "cash.register.open" || perm === "cash.report.view"));

  if (!reportToken && !canAccessViaSession) {
    return NextResponse.json({ success: false, message: "No tienes permisos para consultar aperturas" }, { status: 403 });
  }

  const sessionRecord = await cashRegisterService.getCashRegisterSessionById(normalizedSessionId);
  if (!sessionRecord) {
    return NextResponse.json({ success: false, message: "No se encontró la sesión solicitada" }, { status: 404 });
  }

  const isAdministratorViaSession =
    !!session &&
    (roles.includes("ADMINISTRADOR") ||
      permissions.some((perm) => perm === "admin.users.manage" || perm === "menu.roles.view" || perm === "cash.report.view"));

  if (!reportToken) {
    if (!isAdministratorViaSession && sessionRecord.adminUserId !== requesterId) {
      return NextResponse.json({ success: false, message: "No puedes consultar aperturas de otros usuarios" }, { status: 403 });
    }
  } else if (reportToken.scope !== "admin" && sessionRecord.adminUserId !== requesterId) {
    return NextResponse.json({ success: false, message: "El token no permite consultar aperturas de otros usuarios" }, { status: 403 });
  }

  const [operatorEntry, issuerEntry] = await Promise.all([
    adminUserService.getAdminDirectoryEntry(sessionRecord.adminUserId).catch(() => null),
    adminUserService.getAdminDirectoryEntry(requesterId).catch(() => null),
  ]);

  const operatorName = operatorEntry?.displayName?.trim() || operatorEntry?.username || `Usuario ${sessionRecord.adminUserId}`;
  const operatorUsername = operatorEntry?.username || String(sessionRecord.adminUserId);
  const issuerName = issuerEntry?.displayName?.trim() || issuerEntry?.username || session?.name || `Usuario ${requesterId}`;
  const issuerUsername = issuerEntry?.username || session?.name || String(requesterId);

  const generatedAt = new Date();

  const html = buildOpeningHtml({
    session: sessionRecord,
    operatorName,
    operatorUsername,
    issuerName,
    issuerUsername,
    generatedAt,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
