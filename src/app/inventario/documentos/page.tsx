"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Filter, Loader2, Printer, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { Modal } from "@/components/ui/modal";
import { formatCurrency } from "@/config/currency";
import type { InventoryDocument, InventoryTransactionHeader } from "@/lib/types/inventory";

interface WarehouseOption {
  code: string;
  name: string;
}

const TRANSACTION_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos" },
  { value: "PURCHASE", label: "Compras" },
  { value: "CONSUMPTION", label: "Consumos" },
  { value: "TRANSFER", label: "Traspasos" },
  { value: "ADJUSTMENT", label: "Ajustes" },
];

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  CONSUMPTION: "Consumo",
  TRANSFER: "Traspaso",
  ADJUSTMENT: "Ajuste",
};

const quantityFormatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3, minimumFractionDigits: 0 });

function formatDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString("es-MX"),
    time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

function formatTodayIso() {
  const today = new Date();
  const year = today.getFullYear();
  const month = `${today.getMonth() + 1}`.padStart(2, "0");
  const day = `${today.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createInitialFilters() {
  const today = formatTodayIso();
  return { search: "", type: "", warehouse: "", from: today, to: today };
}

function getTransactionTypeLabel(type: InventoryTransactionHeader["transaction_type"]) {
  return TRANSACTION_TYPE_LABELS[type] || type;
}

export default function DocumentosInventarioPage() {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [documents, setDocuments] = useState<InventoryTransactionHeader[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filters, setFilters] = useState(() => createInitialFilters());
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const [activeFolio, setActiveFolio] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detail, setDetail] = useState<InventoryDocument | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  function syncQueryParam(code: string | null) {
    const current = new URLSearchParams(searchParams.toString());
    if (code) current.set("folio", code);
    else current.delete("folio");
    const query = current.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(nextUrl as Route, { scroll: false });
  }

  const loadWarehouses = useCallback(async () => {
    try {
      const response = await fetch("/api/inventario/warehouses", { credentials: "include" });
      if (!response.ok) throw new Error("No se pudieron cargar los almacenes");
      const data = (await response.json()) as { items?: WarehouseOption[] };
      const mapped = Array.isArray(data.items) ? data.items : [];
      setWarehouses(mapped);
    } catch (error) {
      console.error(error);
    }
  }, []);

  async function loadDocuments(currentFilters = filters) {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (currentFilters.search.trim()) params.set("search", currentFilters.search.trim());
      if (currentFilters.type) params.append("type", currentFilters.type);
      if (currentFilters.warehouse) params.append("warehouse", currentFilters.warehouse);
      if (currentFilters.from) params.set("from", currentFilters.from);
      if (currentFilters.to) params.set("to", currentFilters.to);
      const qs = params.toString();
      const response = await fetch(`/api/inventario/documentos${qs ? `?${qs}` : ""}`);
      const payload = (await response.json().catch(() => null)) as { items?: InventoryTransactionHeader[]; message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message || "No se pudieron consultar los documentos");
      }
      setDocuments(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el listado";
      setListError(message);
      toast({ variant: "error", title: "Documentos", description: message });
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    const folioParam = searchParams.get("folio");
    if (folioParam) {
      setActiveFolio(folioParam);
      setDetailModalOpen(true);
    } else {
      setDetailModalOpen(false);
      setActiveFolio(null);
      setDetail(null);
      setDetailError(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!detailModalOpen || !activeFolio) return;
    const folio = activeFolio;
    let cancelled = false;
    async function fetchDetail() {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const response = await fetch(`/api/inventario/documentos/${encodeURIComponent(folio)}`);
        const data = (await response.json().catch(() => null)) as { document?: InventoryDocument; message?: string } | null;
        if (!response.ok || !data?.document) {
          throw new Error(data?.message || "No se encontró el documento");
        }
        if (!cancelled) setDetail(data.document);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo cargar el detalle";
        if (!cancelled) {
          setDetail(null);
          setDetailError(message);
        }
        toast({ variant: "warning", title: "Documentos", description: message });
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [activeFolio, detailModalOpen, toast]);

  function handleRowDoubleClick(code: string) {
    setActiveFolio(code);
    setDetailModalOpen(true);
    syncQueryParam(code);
  }

  function handleCloseDetailModal() {
    setDetailModalOpen(false);
    setDetail(null);
    setDetailError(null);
    setActiveFolio(null);
    syncQueryParam(null);
  }

  function handleSearch() {
    setHasSearched(true);
    loadDocuments();
  }

  function handleClearFilters() {
    const reset = createInitialFilters();
    setFilters(reset);
    setHasSearched(false);
    setDocuments([]);
    setListError(null);
    setActiveFolio(null);
    setDetailModalOpen(false);
    setDetail(null);
    setDetailError(null);
    syncQueryParam(null);
  }

  function handlePrint(code?: string | null) {
    const folio = code || activeFolio;
    if (!folio) return;
    window.open(`/api/inventario/documentos/${encodeURIComponent(folio)}?format=html`, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <section className="space-y-8 pb-16">
        <header className="space-y-4">
          <div className="space-y-3">
            <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
              <Link href="/inventario" aria-label="Volver al menú de inventario" className="flex items-center gap-2 text-sm font-semibold">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Link>
            </Button>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Documentos de inventario</h1>
              <p className="text-sm text-muted-foreground">Aplica filtros (por fecha, tipo o almacén) y abre el detalle con doble clic en cualquier folio.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 md:flex-nowrap md:items-end">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
              <Input value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} placeholder="Folio, referencia o proveedor" className="rounded-2xl" />
            </div>
            <div className="flex min-w-[180px] flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <select
                value={filters.type}
                onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
                className="h-10 rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {TRANSACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[200px] flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Almacén</Label>
              <select
                value={filters.warehouse}
                onChange={(event) => setFilters((prev) => ({ ...prev, warehouse: event.target.value }))}
                className="h-10 rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="">Todos</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[160px] flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
              <DatePicker value={filters.from} onChange={(value) => setFilters((prev) => ({ ...prev, from: value }))} className="rounded-2xl" />
            </div>
            <div className="flex min-w-[160px] flex-col gap-1">
              <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
              <DatePicker value={filters.to} onChange={(value) => setFilters((prev) => ({ ...prev, to: value }))} className="rounded-2xl" />
            </div>
            <div className="ml-auto flex items-end gap-2">
              <Button type="button" onClick={handleSearch} disabled={listLoading} className="h-10 rounded-2xl px-4">
                {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </Button>
              <Button type="button" variant="outline" onClick={handleClearFilters} className="h-10 rounded-2xl px-4">
                Limpiar
              </Button>
            </div>
          </div>
        </header>

        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Foliador</CardTitle>
            <CardDescription>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Filter className="h-4 w-4" />
                {listLoading ? "Buscando documentos..." : hasSearched ? `Total: ${documents.length}` : "Aplica filtros y haz clic en Buscar"}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
          {listError ? <p className="mb-4 text-sm text-destructive">{listError}</p> : null}
          {!hasSearched ? (
            <p className="text-sm text-muted-foreground">Define al menos un rango de fechas y presiona Buscar para cargar los folios.</p>
          ) : !listLoading && documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay documentos con los filtros actuales. Intenta ampliar la búsqueda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Folio</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Almacén</th>
                    <th className="px-3 py-2">Referencia</th>
                    <th className="px-3 py-2 text-right">Entradas/Salidas</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {documents.map((document) => {
                    const parts = formatDateParts(document.occurred_at);
                    const isActive = detailModalOpen && activeFolio === document.transaction_code;
                    return (
                      <tr
                        key={document.transaction_code}
                        className={`cursor-pointer transition hover:bg-muted/40 ${isActive ? "bg-primary/5" : ""}`}
                        onDoubleClick={() => handleRowDoubleClick(document.transaction_code)}
                        title="Doble clic para abrir el detalle"
                      >
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">{document.transaction_code}</div>
                          <div className="text-xs text-muted-foreground">{document.status}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-foreground">{getTransactionTypeLabel(document.transaction_type)}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div>{parts.day}</div>
                          {parts.time ? <div className="text-xs text-muted-foreground">{parts.time} hrs</div> : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">{document.warehouse_name}</div>
                          <div className="text-xs text-muted-foreground">{document.warehouse_code}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">{document.reference || "Sin referencia"}</div>
                          <div className="text-xs text-muted-foreground">{document.counterparty_name || "—"}</div>
                        </td>
                        <td className="px-3 py-3 text-right text-xs">
                          <div>Entradas: {document.entries_in}</div>
                          <div>Salidas: {document.entries_out}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">{document.total_amount != null ? formatCurrency(document.total_amount) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {hasSearched && listLoading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando documentos...
            </p>
          ) : null}
          </CardContent>
        </Card>
      </section>
      <Modal
        open={detailModalOpen}
        onClose={handleCloseDetailModal}
        title={detail ? `Documento ${detail.transaction_code}` : "Documento de inventario"}
        description="Encabezado y líneas totales del movimiento"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-2xl" onClick={() => handlePrint(detail?.transaction_code || activeFolio)} disabled={!activeFolio}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>
          {detailLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando detalle...
            </p>
          ) : null}
          {detailError ? <p className="text-sm text-destructive">{detailError}</p> : null}
          {!detailLoading && !detail ? <p className="text-sm text-muted-foreground">Selecciona un folio con doble clic para visualizarlo.</p> : null}
          {detail ? (
            (() => {
              const doc = detail!;
              return (
                <>
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Tipo</p>
                        <p className="text-sm font-semibold text-foreground">{getTransactionTypeLabel(doc.transaction_type)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Fecha</p>
                        <p className="text-sm font-semibold text-foreground">{formatDateParts(doc.occurred_at).day}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Almacén</p>
                        <p className="text-sm font-semibold text-foreground">{doc.warehouse_name} · {doc.warehouse_code}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Total</p>
                        <p className="text-sm font-semibold text-foreground">{doc.total_amount != null ? formatCurrency(doc.total_amount) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Referencia</p>
                        <p className="text-sm font-semibold text-foreground">{doc.reference || "Sin referencia"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Contraparte</p>
                        <p className="text-sm font-semibold text-foreground">{doc.counterparty_name || "No aplica"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Líneas capturadas</h3>
                    <div className="overflow-x-auto rounded-2xl border border-dashed border-muted">
                      <table className="min-w-full table-auto text-left text-sm text-foreground">
                        <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Artículo</th>
                            <th className="px-3 py-2">Dirección</th>
                            <th className="px-3 py-2">Unidad</th>
                            <th className="px-3 py-2 text-right">Cantidad</th>
                            <th className="px-3 py-2 text-right">Detalle</th>
                            <th className="px-3 py-2">Notas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-muted/70">
                          {doc.entries.map((entry) => (
                            <tr key={entry.line_number}>
                              <td className="px-3 py-3 text-xs text-muted-foreground">{entry.line_number}</td>
                              <td className="px-3 py-3">
                                <div className="font-semibold text-foreground">{entry.article_code}</div>
                                <div className="text-xs text-muted-foreground">{entry.article_name}</div>
                                <div className="text-[11px] text-muted-foreground">Movimientos: {entry.movements.length}</div>
                              </td>
                              <td className="px-3 py-3">{entry.direction === "IN" ? "Entrada" : "Salida"}</td>
                              <td className="px-3 py-3">{entry.entered_unit === "STORAGE" ? "Almacén" : "Detalle"}</td>
                              <td className="px-3 py-3 text-right">{quantityFormatter.format(entry.quantity_entered)}</td>
                              <td className="px-3 py-3 text-right">{quantityFormatter.format(entry.quantity_retail)}</td>
                              <td className="px-3 py-3">{entry.notes || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              );
            })()
          ) : null}
        </div>
      </Modal>
    </>
  );
}
