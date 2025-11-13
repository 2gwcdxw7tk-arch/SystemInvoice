"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

interface StockRow {
  article_code: string;
  article_name: string;
  warehouse_code: string;
  warehouse_name: string;
  available_retail: number;
  available_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
}

const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

export default function ExistenciasPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const warehouses = useMemo(() => {
    const unique = new Map<string, string>();
    for (const row of stock) {
      unique.set(row.warehouse_code, row.warehouse_name);
    }
    return Array.from(unique.entries()).map(([code, name]) => ({ code, name }));
  }, [stock]);

  async function loadStock(options?: { article?: string; warehouse?: string }) {
    const currentArticle = options?.article ?? query;
    const currentWarehouse = options?.warehouse ?? warehouseFilter;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/inventario/existencias", window.location.origin);
      if (currentArticle.trim().length > 0) url.searchParams.set("article", currentArticle.trim());
      if (currentWarehouse) url.searchParams.set("warehouse_code", currentWarehouse);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudo obtener existencias");
      const data = (await response.json()) as { items?: StockRow[] };
      setStock(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las existencias";
      setError(message);
      toast({ variant: "error", title: "Existencias", description: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!query && !warehouseFilter) return stock;
    return stock.filter((row) => {
      const matchArticle = query ? `${row.article_code} ${row.article_name}`.toLowerCase().includes(query.toLowerCase()) : true;
      const matchWarehouse = warehouseFilter ? row.warehouse_code === warehouseFilter : true;
      return matchArticle && matchWarehouse;
    });
  }, [stock, query, warehouseFilter]);

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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Existencias</h1>
              <p className="text-sm text-muted-foreground">Visualiza saldos actuales por almacén, unidad y stock de seguridad.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código o nombre" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Almacén</Label>
            <select
              value={warehouseFilter}
              onChange={(event) => setWarehouseFilter(event.target.value)}
              className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
            >
              <option value="">Todos</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.code} value={warehouse.code}>{warehouse.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={() => loadStock()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setWarehouseFilter("");
                loadStock({ article: "", warehouse: "" });
              }}
              className="h-10 rounded-2xl px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Resumen de existencias</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Registros encontrados: ${filtered.length}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron registros con los filtros actuales.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Artículo</th>
                    <th className="px-3 py-2">Almacén</th>
                    <th className="px-3 py-2 text-right">Detalle disponible</th>
                    <th className="px-3 py-2 text-right">Almacén disponible</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((row) => {
                    return (
                      <tr key={`${row.article_code}-${row.warehouse_code}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{row.article_code}</span>
                            <span className="text-xs text-muted-foreground">{row.article_name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.warehouse_name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                          {numberFormatter.format(row.available_retail)} {row.retail_unit || "und"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground">
                          {numberFormatter.format(row.available_storage)} {row.storage_unit || row.retail_unit || "und"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
