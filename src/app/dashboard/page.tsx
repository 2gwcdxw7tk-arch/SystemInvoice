'use client';

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, FileText, Table as TableIcon, Users, type LucideIcon } from "lucide-react";

import { formatCurrency } from "@/config/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const longDateFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

type SummaryCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  helper: string[];
};

type ProductRow = {
  name: string;
  category: string;
  units: number;
  revenue: number;
};

type InventoryAlert = {
  item: string;
  current: number;
  min: number;
  unit: string;
  action: string;
};

type WaiterSale = {
  waiter: string;
  tickets: number;
  revenue: number;
  avgTicket: number;
};

// Tipos y estados de facturación removidos del dashboard; ahora viven en /facturacion

const cashRegister = {
  openingTime: "08:00",
  closingTime: "23:00",
  openedBy: "Laura G.",
  closingSupervisor: "Javier R.",
  totalSales: 21874.8,
  cashOnHand: 5630.4,
};

const invoiceSummary = {
  total: 132,
  cfdi: 118,
  simplified: 14,
};

// Utilidades de mesas/facturación removidas aquí; el dashboard muestra totales informativos.

const topProducts: ProductRow[] = [
  { name: "Flat white 12oz", category: "Bebidas", units: 96, revenue: 13440 },
  { name: "Croissant almendrado", category: "Panadería", units: 88, revenue: 9240 },
  { name: "Ensalada mediterránea", category: "Cocina fría", units: 74, revenue: 19620 },
  { name: "Pasta al pesto", category: "Cocina caliente", units: 65, revenue: 25350 },
  { name: "Cheesecake frutos rojos", category: "Postres", units: 58, revenue: 14500 },
  { name: "Latte de avena", category: "Bebidas", units: 54, revenue: 7020 },
  { name: "Chilaquiles verdes", category: "Desayunos", units: 48, revenue: 11040 },
  { name: "Sándwich caprese", category: "Cocina fría", units: 46, revenue: 9200 },
  { name: "Té matcha frío", category: "Bebidas", units: 42, revenue: 5880 },
  { name: "Brownie de cacao", category: "Postres", units: 38, revenue: 5700 },
];

const lowInventoryAlerts: InventoryAlert[] = [
  { item: "Queso burrata", current: 6, min: 12, unit: "pz", action: "Programar reposición con proveedor gourmet" },
  { item: "Harina integral", current: 18, min: 30, unit: "kg", action: "Revisar entrega pendiente del molino" },
  { item: "Vino rosado reserva", current: 9, min: 15, unit: "bot", action: "Autorizar compra especial fin de semana" },
  { item: "Hojas verdes mix", current: 5, min: 10, unit: "kg", action: "Solicitar adelanto a proveedor local" },
];

const waiterSales: WaiterSale[] = [
  { waiter: "María P.", tickets: 21, revenue: 6540, avgTicket: 311 },
  { waiter: "Jorge M.", tickets: 18, revenue: 5980, avgTicket: 332 },
  { waiter: "Daniela R.", tickets: 16, revenue: 5725, avgTicket: 358 },
  { waiter: "Luis C.", tickets: 14, revenue: 4340, avgTicket: 310 },
  { waiter: "Andrea T.", tickets: 13, revenue: 4120, avgTicket: 317 },
];

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

export default function DashboardPage() {
  const today = longDateFormatter.format(new Date());
  const [activeAction, setActiveAction] = useState<FeedbackKey | null>(null);

  const tableStatus = useMemo(() => ({ occupied: 18, available: 9, reserved: 4, total: 31 }), []);

  const summaryCards = useMemo<SummaryCard[]>(
    () => [
      {
        label: "Total ventas del día",
        value: formatCurrency(cashRegister.totalSales, { currency: "local" }),
        icon: Banknote,
        helper: [
          `Apertura ${cashRegister.openingTime} • ${cashRegister.openedBy}`,
          `Cierre programado ${cashRegister.closingTime} • ${cashRegister.closingSupervisor}`,
        ],
      },
      {
        label: "Facturas emitidas",
        value: invoiceSummary.total.toString(),
        icon: FileText,
        helper: [`CFDI ${invoiceSummary.cfdi}`, `Notas simplificadas ${invoiceSummary.simplified}`],
      },
      {
        label: "Mesas ocupadas / disponibles",
        value: `${tableStatus.occupied} / ${tableStatus.available}`,
        icon: TableIcon,
        helper: [`Reservadas ${tableStatus.reserved}`, `Capacidad total ${tableStatus.total}`],
      },
    ],
    [tableStatus]
  );

  // Se removió la lógica de cobro/impresión; ahora se encuentra en /facturacion

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
          ["Producto", "Categoría", "Unidades", "Ingresos"],
          topProducts.map((product) => [product.name, product.category, product.units, product.revenue])
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

  // Handlers de facturación removidos

  // (Impresión de ticket removida del dashboard)

  const actionDescriptor = activeAction ? ACTION_MESSAGES[activeAction] : null;

  return (
    <section className="space-y-10 pb-16">
      <section id="resumen" className="space-y-6">
        <header className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{today}</span>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Control diario de la operación</h2>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Administra la jornada desde la apertura de caja hasta el cierre: verifica ventas, facturas emitidas y estado de las
            mesas sin perder visibilidad sobre inventario y desempeño por mesero.
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
                {topProducts.map((product) => (
                  <tr key={product.name} className="hover:bg-muted/30">
                    <td className="px-6 py-3 font-semibold text-foreground">
                      <span className="block text-pretty leading-tight">{product.name}</span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      <span className="block text-pretty leading-tight">{product.category}</span>
                    </td>
                    <td className="px-6 py-3">{product.units}</td>
                    <td className="px-6 py-3 font-semibold text-foreground">
                      {formatCurrency(product.revenue, { currency: "local" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section id="inventario" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold text-foreground">Alertas de inventario bajo</h3>
            <p className="text-sm text-muted-foreground">Prioriza insumos críticos para evitar quiebres de stock.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-2xl"
            onClick={() => handleAction("configure-alerts")}
          >
            <AlertTriangle className="h-4 w-4" /> Configurar alertas
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {lowInventoryAlerts.map((alert) => (
            <Card key={alert.item} className="h-full min-w-0 overflow-hidden rounded-3xl border bg-background/95 shadow-sm">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg font-semibold text-foreground">{alert.item}</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">{alert.unit.toUpperCase()}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p className="flex justify-between text-foreground">
                  <span>Actual</span>
                  <span>{alert.current} {alert.unit}</span>
                </p>
                <p className="flex justify-between">
                  <span>Mínimo</span>
                  <span>{alert.min} {alert.unit}</span>
                </p>
                <p className="text-pretty text-xs leading-tight text-muted-foreground">{alert.action}</p>
              </CardContent>
            </Card>
          ))}
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
                {waiterSales.map((row) => (
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
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {actionDescriptor && (
        <section id="acciones" className="space-y-4">
          <Card className="rounded-3xl border bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-primary">
                <CheckCircle2 className="h-5 w-5" />
                {actionDescriptor.title}
              </CardTitle>
              <CardDescription className="text-sm text-primary/80">
                {actionDescriptor.description}
              </CardDescription>
              {/* Mensaje contextual removido */}
            </CardHeader>
            <CardContent>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Próximos pasos sugeridos</p>
              <ul className="mt-2 space-y-2 text-sm text-foreground">
                {actionDescriptor.nextSteps.map((step: string) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span className="text-pretty leading-snug">{step}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </section>
  );
}
