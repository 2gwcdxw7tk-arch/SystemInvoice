import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import type { KardexMovementRow } from "@/lib/types/inventory";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "short" });
const timeFormatter = new Intl.DateTimeFormat("es-MX", { timeStyle: "short" });

const transactionTypeLabel: Record<string, string> = {
  PURCHASE: "Compra",
  CONSUMPTION: "Consumo",
  ADJUSTMENT: "Ajuste",
  TRANSFER: "Traspaso",
};

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateParts(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { day: iso, time: "" };
  }
  return {
    day: dateFormatter.format(date),
    time: timeFormatter.format(date),
  };
}

function renderKardexHtml(items: KardexMovementRow[]): string {
  const movements = [...items].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const groups: Array<{
    article_code: string;
    article_name: string;
    warehouse_code: string;
    warehouse_name: string;
    retail_unit: string | null;
    initial_balance: number;
    movements: Array<KardexMovementRow & { delta_retail: number }>;
  }> = [];

  const ledger = new Map<string, { index: number; running: number }>();

  for (const movement of movements) {
    const key = `${movement.article_code}__${movement.warehouse_code}`;
    const delta = movement.direction === "IN" ? movement.quantity_retail : -movement.quantity_retail;
    const entry = ledger.get(key);
    if (!entry) {
      const initialBalance = movement.balance_retail - delta;
      ledger.set(key, { index: groups.length, running: movement.balance_retail });
      groups.push({
        article_code: movement.article_code,
        article_name: movement.article_name,
        warehouse_code: movement.warehouse_code,
        warehouse_name: movement.warehouse_name,
        retail_unit: movement.retail_unit,
        initial_balance: initialBalance,
        movements: [{ ...movement, delta_retail: delta }],
      });
      continue;
    }
    entry.running = movement.balance_retail;
    groups[entry.index].movements.push({ ...movement, delta_retail: delta });
  }

  const styles = `
    @page { size: A4 landscape; margin: 12mm; }
    @media print {
      body { margin: 0; }
      section { break-inside: avoid; page-break-inside: avoid; }
      table { break-inside: avoid; page-break-inside: avoid; }
    }
    body { font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #111827; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; font-size: 12px; }
    th { background-color: #f9fafb; text-transform: uppercase; font-weight: 600; letter-spacing: 0.02em; color: #4b5563; }
    tbody tr:nth-child(even) { background-color: #f9fafb; }
    .group-header { border-left: 4px solid #2563eb; padding-left: 12px; }
    .muted { color: #6b7280; font-size: 12px; }
    .tag-in { background-color: #dcfce7; color: #047857; border-radius: 9999px; padding: 2px 8px; font-weight: 600; font-size: 12px; }
    .tag-out { background-color: #fee2e2; color: #b91c1c; border-radius: 9999px; padding: 2px 8px; font-weight: 600; font-size: 12px; }
  `;

  const sections = groups
    .map((group) => {
      const saldoInicial = group.initial_balance;
      const saldoFinal = group.movements.at(-1)?.balance_retail ?? group.initial_balance;
      const unitLabel = group.retail_unit ? ` ${escapeHtml(group.retail_unit)}` : "";
      const movementsRows = group.movements
        .map((movement) => {
          const occurred = formatDateParts(movement.occurred_at);
          const created = formatDateParts(movement.created_at);
          const natureLabel = movement.direction === "IN" ? "Entrada" : "Salida";
          const deltaValue = Math.abs(movement.delta_retail).toLocaleString("es-MX", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          });
          const balanceValue = movement.balance_retail.toLocaleString("es-MX", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          });
          return `
            <tr>
              <td>
                <div>${escapeHtml(occurred.day)}</div>
                <div class="muted">${escapeHtml(occurred.time)}</div>
              </td>
              <td>
                <div>${escapeHtml(created.day)}</div>
                <div class="muted">${escapeHtml(created.time)}</div>
              </td>
              <td>${escapeHtml(movement.warehouse_code)}</td>
              <td>${escapeHtml(transactionTypeLabel[movement.transaction_type] ?? movement.transaction_type)}</td>
              <td>
                <div>${escapeHtml(movement.transaction_code)}</div>
                <div class="muted">${escapeHtml(movement.reference ?? "")}</div>
              </td>
              <td>${movement.direction === "IN" ? `<span class="tag-in">${natureLabel}</span>` : `<span class="tag-out">${natureLabel}</span>`}</td>
              <td style="text-align:right; font-weight:600; ${movement.delta_retail >= 0 ? "color:#047857" : "color:#b91c1c"}">
                ${movement.delta_retail >= 0 ? "+" : "-"}${deltaValue}${unitLabel}
              </td>
              <td style="text-align:right; font-weight:600;">${balanceValue}${unitLabel}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <section>
          <div class="group-header">
            <h2>${escapeHtml(group.article_code)} • ${escapeHtml(group.article_name)}</h2>
            <div class="muted">Almacén ${escapeHtml(group.warehouse_code)} • ${escapeHtml(group.warehouse_name)}</div>
            <div class="muted" style="margin-top:4px;">
              Saldo inicial: <strong>${saldoInicial.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${unitLabel}</strong>
              &nbsp;|&nbsp;
              Saldo final: <strong>${saldoFinal.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${unitLabel}</strong>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Registrado</th>
                <th>Bodega</th>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Naturaleza</th>
                <th>Cantidad</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="8" class="muted" style="font-weight:600;">Saldo inicial del periodo: ${saldoInicial.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 })}${unitLabel}</td>
              </tr>
              ${movementsRows}
            </tbody>
          </table>
        </section>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Kardex</title>
        <style>${styles}</style>
      </head>
      <body>
        <h1>Kardex de Inventario</h1>
        <p class="muted">Total de movimientos: ${items.length}</p>
        ${sections || '<p class="muted">No se encontraron movimientos.</p>'}
      </body>
    </html>`;
}

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar el kardex");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const articleParams = searchParams.getAll("article").map((value) => value.trim().toUpperCase()).filter((value) => value.length > 0);
  const warehouseParams = searchParams
    .getAll("warehouse_code")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const article = searchParams.get("article") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const warehouse_code = searchParams.get("warehouse_code") || undefined;
  const format = (searchParams.get("format") || "json").toLowerCase();

  try {
    const items = await inventoryService.listKardex({
      article,
      articles: articleParams,
      from,
      to,
      warehouse_code,
      warehouse_codes: warehouseParams,
    });
    if (format === "html") {
      const html = renderKardexHtml(items);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/kardex error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener el kardex" }, { status: 500 });
  }
}
