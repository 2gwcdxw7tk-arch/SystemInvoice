"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeftRight, Boxes, ClipboardList, Notebook, PackageSearch, ScrollText, ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type InventoryRoute =
  | "/inventario/kardex"
  | "/inventario/existencias"
  | "/inventario/registro-compras"
  | "/inventario/registro-consumos"
  | "/inventario/traspasos"
  | "/inventario/bodegas"
  | "/inventario/documentos";

type InventoryMenuItem = { href: InventoryRoute; title: string; description: string; icon: typeof ClipboardList };

const INVENTORY_SECTIONS: Array<{ title: string; description: string; items: InventoryMenuItem[] }> = [
  {
    title: "Operaciones",
    description: "Registra entradas, consumos y movimientos entre almacenes.",
    items: [
      { href: "/inventario/registro-compras", title: "Registro de compras", description: "Historial de compras, facturas y costos asociados.", icon: ShoppingCart },
      { href: "/inventario/registro-consumos", title: "Registro de consumos", description: "Consumos internos, mermas y ajustes autorizados.", icon: Notebook },
      { href: "/inventario/traspasos", title: "Traspasos", description: "Traslada existencias entre almacenes con folio y autorizaciones.", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Reportes",
    description: "Consulta el estado del inventario y los folios generados.",
    items: [
      { href: "/inventario/kardex", title: "Kardex", description: "Movimiento detallado de entradas y salidas por artículo.", icon: ClipboardList },
      { href: "/inventario/documentos", title: "Documentos", description: "Listado maestro de folios con visor y acceso a impresión.", icon: ScrollText },
      { href: "/inventario/existencias", title: "Existencias", description: "Saldos actuales por almacén, unidad y lote.", icon: PackageSearch },
    ],
  },
  {
    title: "Administración",
    description: "Configura almacenes y catálogos base del módulo.",
    items: [{ href: "/inventario/bodegas", title: "Bodegas", description: "Da de alta y administra los almacenes disponibles en el sistema.", icon: Boxes }],
  },
];

export default function InventarioPage() {
  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Inventario</h1>
        <p className="text-sm text-muted-foreground">Selecciona el reporte o flujo operativo que necesitas consultar.</p>
      </header>

      <div className="space-y-8">
        {INVENTORY_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.href} className="flex h-full flex-col justify-between rounded-3xl border bg-background/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
                    <CardHeader className="space-y-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </span>
                      <div className="space-y-2">
                        <CardTitle className="text-xl font-semibold text-foreground">{item.title}</CardTitle>
                        <CardDescription>{item.description}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button type="button" className="w-full rounded-2xl" asChild>
                        <Link href={item.href as Route}>Ingresar</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
