"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, FileText, Table as TableIcon, Users, type LucideIcon } from "lucide-react";

import { formatCurrency } from "@/config/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SummaryCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  helper: string[];
};

type ProductRow = {
  name: string;
  category: string | null;
  units: number;
  revenue: number;
};

type LowInventoryRow = {
  articleCode: string;
  articleName: string;
  warehouseName: string;
  availableRetail: number;
  availableStorage: number;
  unit: string | null;
};

type WaiterSale = {
  waiter: string;
  tickets: number;
  revenue: number;
  avgTicket: number;
};

type TableStatus = {
  occupied: number;
  available: number;
  reserved: number;
  total: number;
};

type SummaryData = {
  totalSales: number;
  invoices: number;
  cfdi: number;
  simplified: number;
  openingTime: string | null;
  openedBy: string | null;
  closingTime: string | null;
  closingSupervisor: string | null;
  cashOnHand: number | null;
};

type DashboardClientProps = {
  todayLabel: string;
  summary: SummaryData;
  tableStatus: TableStatus;
  topProducts: ProductRow[];
  lowInventory: LowInventoryRow[];
  waiterSales: WaiterSale[];
};

type FeedbackKey = "export-products" | "export-waiters" | "configure-alerts";

type DashboardAction = Exclude<FeedbackKey, "print-receipt">;

type ActionDescriptor = {
  title: string;
  description: string;
  nextSteps: string[];
};

const ACTION_MESSAGES: Record<FeedbackKey, ActionDescriptor> = {
  "export-products": {
    title: "Top 10 de productos exportado",
    description: "Se descargó un CSV con el concentrado de ventas para análisis externo.",
    nextSteps: [
      "Comparte el archivo con el área de compras",
      "Identifica productos con ventas decrecientes semana a semana",
      "Ajusta promociones en items con margen alto",
    ],
  },
  "export-waiters": {
    title: "Ranking de meseros exportado",
    description: "Se generó un CSV con ventas por mesero para seguimiento de incentivos.",
    nextSteps: [
      "Entrega el reporte al líder de sala",
      "Integra los datos en el panel de KPIs semanales",
      "Refuerza coaching con quien tenga ticket promedio bajo",
    ],
  },
  "configure-alerts": {
    title: "Configuración de alertas de inventario",
    description: "Abre la configuración para ajustar mínimos dinámicos por insumo.",
    nextSteps: [
      "Revisa consumos promedio por turno",
      "Actualiza proveedores y tiempos de reposición",
      "Activa notificaciones push para quiebres críticos",
    ],
  },
};

const formatHelperLine = (time: string | null, name: string | null, fallback: string): string => {
  if (!time && !name) return fallback;
  if (!time) return name ?? fallback;
  if (!name) return `Hora ${time}`;
  return `${time} • ${name}`;
};

const formatWarehouseLabel = (row: LowInventoryRow): string => {
  const base = `${row.articleCode} · ${row.warehouseName}`;
  if (row.unit) {
    return `${base} (${row.unit})`;
  }
  return base;
};

export default function DashboardClient({ todayLabel, summary, tableStatus, topProducts, lowInventory, waiterSales }: DashboardClientProps) {
  const [activeAction, setActiveAction] = useState<FeedbackKey | null>(null);

  const summaryCards = useMemo<SummaryCard[]>(
    () => [
      {
        label: "Total ventas del día",
        value: formatCurrency(summary.totalSales, { currency: "local" }),
        icon: Banknote,
        helper: [
          formatHelperLine(summary.openingTime, summary.openedBy, "Sin aperturas registradas"),
          summary.cashOnHand != null
            ? `${formatHelperLine(summary.closingTime, summary.closingSupervisor, "Sin cierres registrados")} • Corte ${formatCurrency(summary.cashOnHand, { currency: "local" })}`
            : formatHelperLine(summary.closingTime, summary.closingSupervisor, "Sin cierres registrados"),
        ],
      },
      {
        label: "Facturas emitidas",
        value: summary.invoices.toString(),
        icon: FileText,
        helper: [`CFDI ${summary.cfdi}`, `Notas simplificadas ${summary.simplified}`],
      },
      {
        label: "Mesas ocupadas / disponibles",
        value: `${tableStatus.occupied} / ${tableStatus.available}`,
        icon: TableIcon,
        helper: [`Reservadas ${tableStatus.reserved}`, `Capacidad total ${tableStatus.total}`],
      },
    ],
    [summary, tableStatus]
  );

  const exportToCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
    const escapedRows = rows.map((row) =>
      row
        .map((value) => {
          const stringValue = String(value ?? "");
          const needsQuotes = /[",\n]/.test(stringValue);
          const escapedValue = stringValue.replace(/"/g, '""');
          return needsQuotes ? `"${escapedValue}"` : escapedValue;
        })
        .join(",")
    );

    const csvContent = [headers.join(","), ...escapedRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.setAttribute("download", filename);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleAction = (action: DashboardAction) => {
    setActiveAction(action);

    switch (action) {
      case "export-products": {
        const filename = `top-productos-${new Date().toISOString().slice(0, 10)}.csv`;
        exportToCsv(
          filename,
          ["Artículo", "Categoría", "Unidades", "Ingresos"],
          topProducts.map((product) => [product.name, product.category ?? "N/D", product.units, product.revenue])
        );
        document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "export-waiters": {
        const filename = `ventas-meseros-${new Date().toISOString().slice(0, 10)}.csv`;
        exportToCsv(
          filename,
          ["Mesero", "Tickets", "Ingresos", "Ticket promedio"],
          waiterSales.map((sale) => [sale.waiter, sale.tickets, sale.revenue, sale.avgTicket])
        );
        document.getElementById("meseros")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      case "configure-alerts": {
        document.getElementById("inventario")?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
      default:
        break;
    }
  };

  const actionDescriptor = activeAction ? ACTION_MESSAGES[activeAction] : null;

  return (
    <section className="space-y-10 pb-16">
      <section id="resumen" className="space-y-6">
        <header className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{todayLabel}</span>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Control diario de la operación</h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Administra la jornada desde la apertura de caja hasta el cierre: verifica ventas, facturas emitidas y estado de las mesas sin perder visibilidad sobre inventario y desempeño por mesero.
          </p>
        </header>

        <div className="grid gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="h-full min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader className="flex flex-row items-start gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">
                      {card.label}
                    </CardDescription>
                    <CardTitle className="truncate text-3xl font-semibold text-foreground">{card.value}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {card.helper.map((line) => (
                    <p key={line} className="text-pretty leading-tight">
                      {line}
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="productos" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-foreground">Top 10 productos del día</h3>
            <p className="text-sm text-muted-foreground">Ordenados por ingresos generados desde la apertura.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-2xl"
            onClick={() => handleAction("export-products")}
            disabled={topProducts.length === 0}
          >
            Exportar detalle
          </Button>
        </div>

        <Card className="min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Producto</th>
                  <th className="px-6 py-3 font-medium">Categoría</th>
                  <th className="px-6 py-3 font-medium">Unidades</th>
                  <th className="px-6 py-3 font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-muted-foreground">
                      Aún no hay ventas registradas para el periodo seleccionado.
                    </td>
                  </tr>
                ) : (
                  topProducts.map((product) => (
                    <tr key={`${product.name}-${product.category ?? "nd"}`} className="hover:bg-muted/30">
                      <td className="px-6 py-3 font-semibold text-foreground">
                        <span className="block text-pretty leading-tight">{product.name}</span>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        <span className="block text-pretty leading-tight">{product.category ?? "N/D"}</span>
                      </td>
                      <td className="px-6 py-3">{product.units}</td>
                      <td className="px-6 py-3 font-semibold text-foreground">
                        {formatCurrency(product.revenue, { currency: "local" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section id="inventario" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-foreground">Existencias con nivel crítico</h3>
            <p className="text-sm text-muted-foreground">Monitorea los artículos con menor disponibilidad consolidada.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-2xl"
            onClick={() => handleAction("configure-alerts")}
            disabled={lowInventory.length === 0}
          >
            <AlertTriangle className="h-4 w-4" /> Configurar alertas
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {lowInventory.length === 0 ? (
            <Card className="h-full min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm md:col-span-2 xl:col-span-4">
              <CardContent className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                No se encontraron artículos con existencias comprometidas.
              </CardContent>
            </Card>
          ) : (
            lowInventory.map((item) => (
              <Card key={`${item.articleCode}-${item.warehouseName}`} className="h-full min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-lg font-semibold text-foreground">{item.articleName}</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground">{formatWarehouseLabel(item)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex justify-between text-foreground">
                    <span>Disponible (detalle)</span>
                    <span>
                      {item.availableRetail.toFixed(2)} {item.unit ?? ""}
                    </span>
                  </p>
                  <p className="flex justify-between text-foreground">
                    <span>Equivalente almacén</span>
                    <span>{item.availableStorage.toFixed(2)}</span>
                  </p>
                  <p className="text-pretty text-xs leading-tight text-muted-foreground">Prioriza reposición en {item.warehouseName}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      <section id="meseros" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-foreground">Top ventas en dinero por mesero</h3>
            <p className="text-sm text-muted-foreground">Ordenado por ingresos acumulados durante la jornada.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-2xl"
            onClick={() => handleAction("export-waiters")}
            disabled={waiterSales.length === 0}
          >
            <Users className="h-4 w-4" /> Exportar ranking
          </Button>
        </div>

        <Card className="min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-6 py-3 font-medium">Mesero</th>
                  <th className="px-6 py-3 font-medium">Tickets</th>
                  <th className="px-6 py-3 font-medium">Ingresos</th>
                  <th className="px-6 py-3 font-medium">Ticket promedio</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {waiterSales.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-sm text-muted-foreground">
                      Sin ventas registradas para los criterios actuales.
                    </td>
                  </tr>
                ) : (
                  waiterSales.map((row) => (
                    <tr key={row.waiter} className="hover:bg-muted/30">
                      <td className="px-6 py-3 font-semibold text-foreground">
                        <span className="block text-pretty leading-tight">{row.waiter}</span>
                      </td>
                      <td className="px-6 py-3">{row.tickets}</td>
                      <td className="px-6 py-3 font-semibold text-foreground">
                        {formatCurrency(row.revenue, { currency: "local" })}
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {formatCurrency(row.avgTicket, { currency: "local" })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {actionDescriptor ? (
        <section className="space-y-3 rounded-3xl border bg-muted/30 p-6 text-sm text-muted-foreground">
          <h4 className="text-xl font-semibold text-foreground">{actionDescriptor.title}</h4>
          <p>{actionDescriptor.description}</p>
          <ul className="list-disc space-y-1 pl-5">
            {actionDescriptor.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
