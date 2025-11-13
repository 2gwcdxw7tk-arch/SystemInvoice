"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

interface KardexRow {
  id: string;
  occurred_at: string;
  transaction_type: "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT";
  transaction_code: string;
  article_code: string;
  article_name: string;
  direction: "IN" | "OUT";
  quantity_retail: number;
  quantity_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
  reference: string | null;
  counterparty_name: string | null;
  warehouse_code: string;
  warehouse_name: string;
  source_kit_code: string | null;
  balance_retail: number;
  balance_storage: number;
}

const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

function formatDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString("es-MX"),
    time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function KardexPage() {
  const { toast } = useToast();
  const [articleFilter, setArticleFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [movements, setMovements] = useState<KardexRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function loadMovements(options?: { article?: string; from?: string; to?: string }) {
    const currentArticle = options?.article ?? articleFilter;
    const currentFrom = options?.from ?? fromDate;
    const currentTo = options?.to ?? toDate;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/inventario/kardex", window.location.origin);
      if (currentArticle.trim().length > 0) url.searchParams.set("article", currentArticle.trim());
      if (currentFrom) url.searchParams.set("from", currentFrom);
      if (currentTo) url.searchParams.set("to", currentTo);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudo cargar el kardex");
      const data = (await response.json()) as { items?: KardexRow[] };
      setMovements(Array.isArray(data.items) ? data.items : []);
      setLastUpdated(new Date().toISOString());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo obtener el kardex";
      setError(message);
      toast({ variant: "error", title: "Kardex", description: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return "";
    const parts = formatDateParts(lastUpdated);
    return `${parts.day} ${parts.time ? `a las ${parts.time}` : ""}`.trim();
  }, [lastUpdated]);

  const totalMovements = movements.length;

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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Kardex</h1>
              <p className="text-sm text-muted-foreground">Consulta los movimientos de entrada y salida por artículo y valida el saldo acumulado.</p>
              {lastUpdatedText && <p className="text-xs text-muted-foreground">Última actualización: {lastUpdatedText}</p>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button type="button" variant="outline" onClick={() => loadMovements()} className="h-11 rounded-2xl px-4">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
            <Input value={articleFilter} onChange={(event) => setArticleFilter(event.target.value)} placeholder="Código, nombre o kit" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
            <DatePicker value={fromDate} onChange={setFromDate} className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
            <DatePicker value={toDate} onChange={setToDate} className="rounded-2xl" />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={() => loadMovements()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArticleFilter("");
                setFromDate("");
                setToDate("");
                loadMovements({ article: "", from: "", to: "" });
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
          <CardTitle className="text-xl font-semibold">Movimientos recientes</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Total de movimientos: ${totalMovements}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && movements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos que coincidan con los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Artículo</th>
                    <th className="px-3 py-2">Movimiento</th>
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Saldo</th>
                    <th className="px-3 py-2">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {movements.map((movement) => {
                    const parts = formatDateParts(movement.occurred_at);
                    const signedRetail = movement.direction === "IN" ? movement.quantity_retail : -movement.quantity_retail;
                    const signedStorage = movement.direction === "IN" ? movement.quantity_storage : -movement.quantity_storage;
                    const balanceRetail = movement.balance_retail;
                    const balanceStorage = movement.balance_storage;
                    const isIngress = movement.direction === "IN";
                    return (
                      <tr key={movement.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                          <div className="font-medium text-foreground">{parts.day}</div>
                          {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{movement.article_code}</span>
                            <span className="text-xs text-muted-foreground">{movement.article_name}</span>
                            <span className="text-xs text-muted-foreground">Almacén: {movement.warehouse_name}</span>
                            {movement.source_kit_code && (
                              <span className="text-xs text-muted-foreground">Derivado de kit {movement.source_kit_code}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 font-semibold ${isIngress ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                            {isIngress ? "Entrada" : "Salida"}
                          </span>
                          <div className="mt-1 text-xs text-muted-foreground">{movement.transaction_type}</div>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <div className={`font-semibold ${isIngress ? "text-emerald-600" : "text-destructive"}`}>
                            Detalle: {isIngress ? "+" : "-"}
                            {numberFormatter.format(Math.abs(signedRetail))}
                            {movement.retail_unit ? ` ${movement.retail_unit}` : ""}
                          </div>
                          <div className={`text-xs ${isIngress ? "text-emerald-500" : "text-destructive"}`}>
                            Almacén: {isIngress ? "+" : "-"}
                            {numberFormatter.format(Math.abs(signedStorage))}
                            {movement.storage_unit ? ` ${movement.storage_unit}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm">
                          <div className="font-semibold text-foreground">
                            Detalle: {numberFormatter.format(balanceRetail)}
                            {movement.retail_unit ? ` ${movement.retail_unit}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Almacén: {numberFormatter.format(balanceStorage)}
                            {movement.storage_unit ? ` ${movement.storage_unit}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-sm text-muted-foreground">
                          {movement.reference ? <div className="font-medium text-foreground">{movement.reference}</div> : null}
                          {movement.counterparty_name && <div className="text-xs">{movement.counterparty_name}</div>}
                          <div className="text-xs text-muted-foreground">Folio: {movement.transaction_code}</div>
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
