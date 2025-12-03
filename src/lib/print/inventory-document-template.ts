import { siteConfig } from "@/config/site";
import { formatCurrency } from "@/config/currency";
import type { InventoryDocument } from "@/lib/types/inventory";

const quantityFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return dateFormatter.format(date);
}

function renderMovements(entry: InventoryDocument["entries"][number]): string {
  if (!entry.movements.length) {
    return '<p class="muted">Sin desglose de movimientos para esta línea.</p>';
  }

  return `<ul class="movements">${entry.movements
    .map((movement) => {
      const directionLabel = movement.direction === "IN" ? "Entrada" : "Salida";
      const qty = quantityFormatter.format(movement.quantity_retail);
      const unitLabel = movement.retail_unit ? ` ${escapeHtml(movement.retail_unit)}` : "";
      const kitLabel = movement.source_kit_article_code
        ? ` <span class="muted">(kit ${escapeHtml(movement.source_kit_article_code)})</span>`
        : "";
      return `
        <li>
          <span class="tag ${movement.direction === "IN" ? "tag-in" : "tag-out"}">${directionLabel}</span>
          <strong>${escapeHtml(movement.article_code)}</strong>
          <span class="muted">• ${escapeHtml(movement.article_name)}</span>
          <span class="muted">• ${escapeHtml(movement.warehouse_code)} (${escapeHtml(movement.warehouse_name)})</span>
          <span class="quantity">${qty}${unitLabel}</span>
          ${kitLabel}
        </li>
      `;
    })
    .join("")}</ul>`;
}

export function renderInventoryDocumentHtml(document: InventoryDocument): string {
  const totalAmountLabel = document.total_amount != null ? formatCurrency(document.total_amount) : "—";
  const logoBlock = siteConfig.logoUrl
    ? `<img src="${escapeHtml(siteConfig.logoUrl)}" alt="Logo" class="company-logo" />`
    : `<div class="logo-placeholder">${escapeHtml(siteConfig.acronym)}</div>`;
  const addressBlock = siteConfig.address
    ? `<p class="muted">${escapeHtml(siteConfig.address)}</p>`
    : '<p class="muted">Dirección no registrada</p>';
  const styles = `
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; margin: 0; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    h2 { font-size: 18px; margin-top: 32px; margin-bottom: 8px; }
    .muted { color: #6b7280; }
    .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .company-meta { flex: 1; }
    .company-meta h3 { margin: 0; font-size: 16px; font-weight: 600; }
    .company-logo { height: 56px; width: auto; object-fit: contain; }
    .logo-placeholder { display: inline-flex; align-items: center; justify-content: center; height: 56px; width: 56px; border-radius: 12px; background: #e5e7eb; color: #111827; font-weight: 700; font-size: 20px; }
    .text-lg { font-size: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-top: 12px; }
    .summary div { background: #f9fafb; border-radius: 12px; padding: 12px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f3f4f6; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; font-size: 12px; }
    tbody tr:nth-child(odd) { background: #fff; }
    tbody tr:nth-child(even) { background: #fdfdfd; }
    .tag { border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; margin-right: 8px; }
    .tag-in { background: #dcfce7; color: #047857; }
    .tag-out { background: #fee2e2; color: #b91c1c; }
    .quantity { font-weight: 600; margin-left: 12px; }
    ul.movements { margin: 8px 0 0; padding-left: 16px; }
    ul.movements li { margin-bottom: 6px; list-style: disc; }
    .empty { font-style: italic; color: #9ca3af; }
  `;

  const entryRows = document.entries
    .map((entry) => {
      const costLabel = entry.cost_per_unit != null ? formatCurrency(entry.cost_per_unit) : "—";
      const subtotalLabel = entry.subtotal != null ? formatCurrency(entry.subtotal) : "—";
      const enteredUnitLabel = entry.entered_unit === "STORAGE" ? "Almacén" : "Detalle";
      const directionLabel = entry.direction === "IN" ? "Entrada" : "Salida";
      const movementsBlock = renderMovements(entry);
      return `
        <tr>
          <td>${entry.line_number}</td>
          <td>
            <div>${escapeHtml(entry.article_code)}</div>
            <div class="muted">${escapeHtml(entry.article_name)}</div>
          </td>
          <td>${directionLabel}</td>
          <td>${enteredUnitLabel}</td>
          <td>${quantityFormatter.format(entry.quantity_entered)}</td>
          <td>${quantityFormatter.format(entry.quantity_retail)}</td>
          <td>${costLabel}</td>
          <td>${subtotalLabel}</td>
          <td>${entry.notes ? escapeHtml(entry.notes) : "—"}</td>
        </tr>
        <tr>
          <td colspan="9">${movementsBlock}</td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <title>Documento ${escapeHtml(document.transaction_code)}</title>
      <style>${styles}</style>
    </head>
    <body>
      <div class="doc-header">
        <div>${logoBlock}</div>
        <div class="company-meta">
          <h3>${escapeHtml(siteConfig.name)}</h3>
          ${addressBlock}
        </div>
        <div class="company-meta" style="text-align:right;">
          <p class="muted">Folio</p>
          <p class="text-lg" style="font-weight:600;">${escapeHtml(document.transaction_code)}</p>
          <p class="muted">Registrado ${escapeHtml(formatDateLabel(document.created_at))}</p>
        </div>
      </div>

      <h1>Documento de inventario</h1>
      <p class="muted">Tipo ${escapeHtml(document.transaction_type)}</p>
      <div class="summary">
        <div><strong>Fecha del movimiento</strong><br/>${escapeHtml(formatDateLabel(document.occurred_at))}</div>
        <div><strong>Bodega</strong><br/>${escapeHtml(document.warehouse_code)} · ${escapeHtml(document.warehouse_name)}</div>
        <div><strong>Estatus</strong><br/>${escapeHtml(document.status)}</div>
        <div><strong>Monto total</strong><br/>${totalAmountLabel}</div>
        <div><strong>Referencia</strong><br/>${document.reference ? escapeHtml(document.reference) : '<span class="empty">Sin referencia</span>'}</div>
        <div><strong>Contraparte</strong><br/>${document.counterparty_name ? escapeHtml(document.counterparty_name) : '<span class="empty">No aplica</span>'}</div>
      </div>

      <h2>Detalle de líneas</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Artículo</th>
            <th>Dirección</th>
            <th>Unidad</th>
            <th>Cantidad capturada</th>
            <th>Cantidad detalle</th>
            <th>Costo unitario</th>
            <th>Subtotal</th>
            <th>Notas</th>
          </tr>
        </thead>
        <tbody>
          ${entryRows || '<tr><td colspan="9" class="empty">Sin líneas registradas.</td></tr>'}
        </tbody>
      </table>
    </body>
  </html>`;
}
