import { NextRequest, NextResponse } from "next/server";

import { inventoryService } from "@/lib/services/InventoryService";
import { requireAdministrator } from "@/lib/auth/access";
import type { StockSummaryRow } from "@/lib/types/inventory";

const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderStockSummaryHtml(items: StockSummaryRow[]): string {
  const sorted = [...items].sort((a, b) => {
    const articleComparison = a.article_code.localeCompare(b.article_code, "es");
    if (articleComparison !== 0) return articleComparison;
    return a.warehouse_code.localeCompare(b.warehouse_code, "es");
  });

  const groups = new Map<string, { article_name: string; rows: StockSummaryRow[] }>();
  let totalRetail = 0;
  let totalStorage = 0;

  for (const row of sorted) {
    totalRetail += row.available_retail;
    totalStorage += row.available_storage;
    const key = row.article_code;
    if (!groups.has(key)) {
      groups.set(key, { article_name: row.article_name, rows: [row] });
    } else {
      groups.get(key)!.rows.push(row);
    }
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
    .muted { color: #6b7280; font-size: 12px; }
    .summary { margin-top: 12px; font-weight: 600; }
  `;

  const sections = Array.from(groups.entries())
    .map(([articleCode, group]) => {
      const retailUnit = group.rows[0]?.retail_unit ?? group.rows[0]?.storage_unit ?? "und";
      const storageUnit = group.rows[0]?.storage_unit ?? group.rows[0]?.retail_unit ?? "und";
      const totalArticleRetail = group.rows.reduce((acc, row) => acc + row.available_retail, 0);
      const totalArticleStorage = group.rows.reduce((acc, row) => acc + row.available_storage, 0);

      const rows = group.rows
        .map((row) => `
          <tr>
            <td>${escapeHtml(row.warehouse_code)}</td>
            <td>${escapeHtml(row.warehouse_name)}</td>
            <td style="text-align:right;">${escapeHtml(numberFormatter.format(row.available_retail))}${row.retail_unit ? " " + escapeHtml(row.retail_unit) : ""}</td>
            <td style="text-align:right;">${escapeHtml(numberFormatter.format(row.available_storage))}${row.storage_unit ? " " + escapeHtml(row.storage_unit) : row.retail_unit ? " " + escapeHtml(row.retail_unit) : ""}</td>
          </tr>
        `)
        .join("\n");

      return `
        <section>
          <h2>${escapeHtml(articleCode)} • ${escapeHtml(group.article_name)}</h2>
          <table>
            <thead>
              <tr>
                <th>Almacén</th>
                <th>Nombre</th>
                <th>Disponible detalle</th>
                <th>Disponible almacén</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
          <p class="summary">Total artículo: ${escapeHtml(numberFormatter.format(totalArticleRetail))}${retailUnit ? " " + escapeHtml(retailUnit) : ""} • ${escapeHtml(numberFormatter.format(totalArticleStorage))}${storageUnit ? " " + escapeHtml(storageUnit) : ""}</p>
        </section>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Existencias</title>
        <style>${styles}</style>
      </head>
      <body>
        <h1>Resumen de existencias</h1>
        <p class="muted">Registros: ${items.length} • Total disponible: ${escapeHtml(numberFormatter.format(totalRetail))} detalle • ${escapeHtml(numberFormatter.format(totalStorage))} almacén</p>
        ${sections || '<p class="muted">No se encontraron existencias con los filtros aplicados.</p>'}
      </body>
    </html>`;
}

export async function GET(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede consultar existencias");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const articleParams = searchParams.getAll("article").map((value) => value.trim().toUpperCase()).filter((value) => value.length > 0);
  const warehouseParams = searchParams
    .getAll("warehouse_code")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  const article = searchParams.get("article") || undefined;
  const warehouse_code = searchParams.get("warehouse_code") || undefined;
  const format = (searchParams.get("format") || "json").toLowerCase();

  try {
    const items = await inventoryService.getStockSummary({
      article,
      articles: articleParams,
      warehouse_code,
      warehouse_codes: warehouseParams,
    });
    if (format === "html") {
      const html = renderStockSummaryHtml(items);
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/inventario/existencias error", error);
    return NextResponse.json({ success: false, message: "No se pudo obtener existencias" }, { status: 500 });
  }
}
