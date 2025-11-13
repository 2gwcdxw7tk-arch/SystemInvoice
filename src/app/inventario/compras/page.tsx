"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/config/currency";

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  requestDate: string;
  expectedDate: string;
  totalEstimated: number;
  status: "BORRADOR" | "ENVIADA" | "APROBADA" | "RECIBIDA";
}

const MOCK_ORDERS: PurchaseOrder[] = [
  { id: "1", orderNumber: "OC-2025-097", supplier: "Proveedor Aromas S.A.", requestDate: "2025-11-06", expectedDate: "2025-11-11", totalEstimated: 1800.0, status: "ENVIADA" },
  { id: "2", orderNumber: "OC-2025-095", supplier: "Lácteos del Norte", requestDate: "2025-11-05", expectedDate: "2025-11-09", totalEstimated: 720.4, status: "APROBADA" },
  { id: "3", orderNumber: "OC-2025-092", supplier: "Distribuidora Dulce", requestDate: "2025-11-02", expectedDate: "2025-11-07", totalEstimated: 540.35, status: "RECIBIDA" },
  { id: "4", orderNumber: "OC-2025-091", supplier: "Bebidas Premium", requestDate: "2025-11-01", expectedDate: "2025-11-08", totalEstimated: 980.55, status: "BORRADOR" },
];

export default function ComprasInventarioPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return MOCK_ORDERS.filter((order) => {
      const matchesSearch = search ? `${order.orderNumber} ${order.supplier}`.toLowerCase().includes(search.toLowerCase()) : true;
      const matchesStatus = statusFilter ? order.status === statusFilter : true;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter]);

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
              <Link href="/inventario" aria-label="Volver al menú principal de inventario">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al menú
                </span>
              </Link>
            </Button>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Compras</h1>
              <p className="text-sm text-muted-foreground">Gestiona la planificación y seguimiento de órdenes a proveedores.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Orden o proveedor" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
            >
              <option value="">Todos</option>
              <option value="BORRADOR">Borrador</option>
              <option value="ENVIADA">Enviada</option>
              <option value="APROBADA">Aprobada</option>
              <option value="RECIBIDA">Recibida</option>
            </select>
          </div>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Órdenes de compra</CardTitle>
          <CardDescription>Actualmente se muestran datos mock. En la integración final se enlazará con la tabla de órdenes.</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay órdenes que coincidan con los filtros aplicados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Orden</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Solicitud</th>
                    <th className="px-3 py-2">Entrega estimada</th>
                    <th className="px-3 py-2 text-right">Total estimado</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{order.orderNumber}</td>
                      <td className="px-3 py-2 text-foreground">{order.supplier}</td>
                      <td className="px-3 py-2 text-muted-foreground">{order.requestDate}</td>
                      <td className="px-3 py-2 text-muted-foreground">{order.expectedDate}</td>
                      <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(order.totalEstimated, { currency: "local" })}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${order.status === "RECIBIDA" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : order.status === "APROBADA" ? "bg-primary/10 text-primary" : order.status === "ENVIADA" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {order.status.toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
