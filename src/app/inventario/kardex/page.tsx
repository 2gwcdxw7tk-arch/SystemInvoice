"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

interface KardexRow {
  id: string;
  occurred_at: string;
  created_at: string;
  transaction_type: "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT" | "TRANSFER";
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

interface KardexGroupEntry extends KardexRow {
  delta_retail: number;
}

interface KardexGroup {
  key: string;
  article_code: string;
  article_name: string;
  retail_unit: string | null;
  warehouse_code: string;
  warehouse_name: string;
  initial_balance: number;
  movements: KardexGroupEntry[];
}

type ArticleOption = {
  code: string;
  name: string;
  unit: string | null;
};

type WarehouseOption = {
  code: string;
  name: string;
  isActive: boolean;
};

const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCodeList(rawValue: string): string[] {
  const splitted = rawValue
    .split(/[\s,;]+/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  return Array.from(new Set(splitted));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString("es-MX"),
    time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

const transactionTypeLabel: Record<KardexRow["transaction_type"], string> = {
  PURCHASE: "Compra",
  CONSUMPTION: "Venta",
  ADJUSTMENT: "Ajuste",
  TRANSFER: "Traspaso",
};

export default function KardexPage() {
  const { toast } = useToast();
  const [articleCodes, setArticleCodes] = useState<string[]>([]);
  const [articleInputValue, setArticleInputValue] = useState("");
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [articleSearchTerm, setArticleSearchTerm] = useState("");
  const [articleOptions, setArticleOptions] = useState<ArticleOption[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const articleOptionsRequestedRef = useRef(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseSearchTerm, setWarehouseSearchTerm] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const warehouseOptionsRequestedRef = useRef(false);
  const [fromDate, setFromDate] = useState(() => getTodayIsoDate());
  const [toDate, setToDate] = useState(() => getTodayIsoDate());
  const [movements, setMovements] = useState<KardexRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [warehouseCodes, setWarehouseCodes] = useState<string[]>([]);
  const [warehouseInputValue, setWarehouseInputValue] = useState("");
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const applyArticleCodes = useCallback((codes: string[]) => {
    const normalized = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => code.length > 0)));
    setArticleCodes(normalized);
    setArticleInputValue(normalized.join(", "));
  }, []);

  const applyWarehouseCodes = useCallback((codes: string[]) => {
    const normalized = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => code.length > 0)));
    setWarehouseCodes(normalized);
    setWarehouseInputValue(normalized.join(", "));
  }, []);

  const handleArticleInputChange = useCallback((value: string) => {
    const uppercase = value.toUpperCase();
    setArticleInputValue(uppercase);
    setArticleCodes(parseCodeList(uppercase));
  }, []);

  const handleWarehouseInputChange = useCallback((value: string) => {
    const uppercase = value.toUpperCase();
    setWarehouseInputValue(uppercase);
    setWarehouseCodes(parseCodeList(uppercase));
  }, []);

  const buildKardexRequestUrl = useCallback(
    (format: "json" | "html" = "json") => {
      if (typeof window === "undefined") {
        throw new Error("La URL del kardex solo está disponible en el navegador");
      }
      const url = new URL("/api/inventario/kardex", window.location.origin);
      articleCodes.forEach((code) => {
        const normalized = code.trim().toUpperCase();
        if (normalized.length > 0) {
          url.searchParams.append("article", normalized);
        }
      });
      if (fromDate) url.searchParams.set("from", fromDate);
      if (toDate) url.searchParams.set("to", toDate);
      warehouseCodes.forEach((code) => {
        const normalized = code.trim().toUpperCase();
        if (normalized.length > 0) {
          url.searchParams.append("warehouse_code", normalized);
        }
      });
      if (format === "html") {
        url.searchParams.set("format", "html");
      }
      return url;
    },
    [articleCodes, fromDate, toDate, warehouseCodes]
  );

  async function loadMovements() {
    setLoading(true);
    setError(null);
    try {
      const url = buildKardexRequestUrl("json");
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

  const openPrintPreview = useCallback(() => {
    try {
      const url = buildKardexRequestUrl("html");
      setPrintUrl(url.toString());
      setPrintModalOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo preparar la vista para impresión";
      toast({ variant: "error", title: "Kardex", description: message });
    }
  }, [buildKardexRequestUrl, toast]);

  const closePrintPreview = useCallback(() => {
    setPrintModalOpen(false);
    setPrintUrl(null);
  }, []);

  const loadArticleOptions = useCallback(
    async (force = false) => {
      if (articleOptionsRequestedRef.current) return;
      if (!force && articleOptions.length > 0) return;
      articleOptionsRequestedRef.current = true;
      setArticlesLoading(true);
      try {
        const response = await fetch("/api/articulos?unit=RETAIL", { cache: "no-store", credentials: "include" });
        if (!response.ok) throw new Error("No se pudieron cargar los artículos");
        const payload = (await response.json()) as { items?: unknown };
        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        const mapped: ArticleOption[] = rawItems
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((item) => {
            const retailUnit = item.retail_unit as string | null | undefined;
            const unit = item.unit as string | null | undefined;
            const unitName = item.unit_name as string | null | undefined;
            return {
              code: String(item.article_code ?? "").toUpperCase(),
              name: String(item.name ?? ""),
              unit: retailUnit ?? unit ?? unitName ?? null,
            } satisfies ArticleOption;
          })
          .filter((item: ArticleOption) => item.code.length > 0);
        mapped.sort((a, b) => a.code.localeCompare(b.code));
        setArticleOptions(mapped);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "No se pudieron cargar los artículos";
        toast({ variant: "error", title: "Artículos", description: message });
      } finally {
        setArticlesLoading(false);
        articleOptionsRequestedRef.current = false;
      }
    },
    [articleOptions.length, toast]
  );

  const loadWarehouseOptions = useCallback(
    async (force = false) => {
      if (warehouseOptionsRequestedRef.current) return;
      if (!force && warehouseOptions.length > 0) return;
      warehouseOptionsRequestedRef.current = true;
      setWarehousesLoading(true);
      try {
        const response = await fetch("/api/inventario/warehouses", { cache: "no-store", credentials: "include" });
        if (!response.ok) throw new Error("No se pudieron cargar las bodegas");
        const payload = (await response.json()) as { items?: unknown };
        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        const mapped: WarehouseOption[] = rawItems
          .filter((entry): entry is Record<string, unknown> => isRecord(entry))
          .map((item) => ({
            code: String(item.code ?? "").toUpperCase(),
            name: String(item.name ?? ""),
            isActive: (item.is_active as boolean | undefined) !== false,
          }))
          .filter((item: WarehouseOption) => item.code.length > 0);
        mapped.sort((a, b) => a.code.localeCompare(b.code));
        setWarehouseOptions(mapped);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "No se pudieron cargar las bodegas";
        toast({ variant: "warning", title: "Bodegas", description: message });
      } finally {
        setWarehousesLoading(false);
        warehouseOptionsRequestedRef.current = false;
      }
    },
    [toast, warehouseOptions.length]
  );

  useEffect(() => {
    if (articleModalOpen) {
      setArticleSearchTerm("");
      void loadArticleOptions();
    } else {
      setArticleSearchTerm("");
    }
  }, [articleModalOpen, loadArticleOptions]);

  useEffect(() => {
    if (warehouseModalOpen) {
      setWarehouseSearchTerm("");
      void loadWarehouseOptions();
    } else {
      setWarehouseSearchTerm("");
    }
  }, [warehouseModalOpen, loadWarehouseOptions]);

  const filteredArticleOptions = useMemo(() => {
    const term = articleSearchTerm.trim().toLowerCase();
    if (!term) return articleOptions;
    return articleOptions.filter((option) => option.code.toLowerCase().includes(term) || option.name.toLowerCase().includes(term));
  }, [articleOptions, articleSearchTerm]);

  const filteredWarehouseOptions = useMemo(() => {
    const term = warehouseSearchTerm.trim().toLowerCase();
    if (!term) return warehouseOptions;
    return warehouseOptions.filter((option) => option.code.toLowerCase().includes(term) || option.name.toLowerCase().includes(term));
  }, [warehouseOptions, warehouseSearchTerm]);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return "";
    const parts = formatDateParts(lastUpdated);
    return `${parts.day} ${parts.time ? `a las ${parts.time}` : ""}`.trim();
  }, [lastUpdated]);

  const groupedMovements = useMemo<KardexGroup[]>(() => {
    if (!Array.isArray(movements) || movements.length === 0) {
      return [];
    }

    const groups: KardexGroup[] = [];
    const ledger = new Map<string, { group: KardexGroup; running: number }>();

    const sorted = [...movements].sort((a, b) => {
      const firstCreated = new Date(a.created_at ?? a.occurred_at).getTime();
      const secondCreated = new Date(b.created_at ?? b.occurred_at).getTime();
      if (firstCreated !== secondCreated) return firstCreated - secondCreated;
      return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
    });

    for (const movement of sorted) {
      const key = `${movement.article_code}__${movement.warehouse_code}`;
      let entry = ledger.get(key);
      if (!entry) {
        const delta = movement.direction === "IN" ? movement.quantity_retail : -movement.quantity_retail;
        const initial = movement.balance_retail - delta;
        const group: KardexGroup = {
          key,
          article_code: movement.article_code,
          article_name: movement.article_name,
          retail_unit: movement.retail_unit,
          warehouse_code: movement.warehouse_code,
          warehouse_name: movement.warehouse_name,
          initial_balance: initial,
          movements: [],
        };
        entry = { group, running: movement.balance_retail };
        ledger.set(key, entry);
        groups.push(group);
        group.movements.push({ ...movement, delta_retail: delta });
      } else {
        const delta = movement.direction === "IN" ? movement.quantity_retail : -movement.quantity_retail;
        entry.running = movement.balance_retail;
        entry.group.movements.push({ ...movement, delta_retail: delta });
      }
    }

    return groups;
  }, [movements]);

  const totalMovements = useMemo(() => groupedMovements.reduce((sum, group) => sum + group.movements.length, 0), [groupedMovements]);

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
            <Button type="button" variant="outline" onClick={openPrintPreview} className="h-11 rounded-2xl px-4">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button type="button" variant="outline" onClick={() => loadMovements()} className="h-11 rounded-2xl px-4">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
            <Input
              value={articleInputValue}
              onChange={(event) => handleArticleInputChange(event.target.value)}
              onBlur={() => applyArticleCodes(articleCodes)}
              onDoubleClick={() => setArticleModalOpen(true)}
              placeholder="Código(s) de artículo"
              className="rounded-2xl"
              title="Doble clic para abrir el catálogo"
            />
            <p className="text-xs text-muted-foreground">Deja vacío para incluir todos los artículos. Doble clic abre el catálogo.</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
            <DatePicker value={fromDate} onChange={setFromDate} className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
            <DatePicker value={toDate} onChange={setToDate} className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Bodega</Label>
            <Input
              value={warehouseInputValue}
              onChange={(event) => handleWarehouseInputChange(event.target.value)}
              onBlur={() => applyWarehouseCodes(warehouseCodes)}
              onDoubleClick={() => setWarehouseModalOpen(true)}
              placeholder="Código(s) de bodega"
              className="rounded-2xl"
              title="Doble clic para abrir el catálogo"
            />
            <p className="text-xs text-muted-foreground">Deja vacío para incluir todas las bodegas. Doble clic abre el catálogo.</p>
          </div>
          <div className="flex items-end justify-end gap-2">
            <Button type="button" onClick={() => loadMovements()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                applyArticleCodes([]);
                applyWarehouseCodes([]);
                const today = getTodayIsoDate();
                setFromDate(today);
                setToDate(today);
                setMovements([]);
                setLastUpdated(null);
              }}
              className="h-10 rounded-2xl px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </header>

      <Modal
        open={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        title="Seleccionar artículo"
        description="Busca en el catálogo y elige uno o varios artículos para consultar el kardex."
        contentClassName="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="article-picker-search" className="text-xs uppercase text-muted-foreground">Buscar</Label>
              <Input
                id="article-picker-search"
                value={articleSearchTerm}
                onChange={(event) => setArticleSearchTerm(event.target.value)}
                placeholder="Código o nombre"
                className="rounded-2xl"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl px-4"
              onClick={() => loadArticleOptions(true)}
              disabled={articlesLoading}
            >
              {articlesLoading ? "Actualizando..." : "Refrescar catálogo"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Haz clic en los registros para agregarlos o quitarlos de la selección. Si no eliges ninguno se consultarán todos los artículos.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-muted">
            {articlesLoading && articleOptions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Cargando catálogo de artículos...</p>
            ) : filteredArticleOptions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No se encontraron artículos que coincidan con la búsqueda.</p>
            ) : (
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArticleOptions.map((item) => {
                    const isSelected = articleCodes.includes(item.code);
                    return (
                      <tr
                        key={item.code}
                        className={`cursor-pointer ${isSelected ? "bg-primary/10" : "hover:bg-muted/40"}`}
                        onClick={() => {
                          const next = isSelected
                            ? articleCodes.filter((code) => code !== item.code)
                            : [...articleCodes, item.code];
                          applyArticleCodes(next);
                        }}
                      >
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.code}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{item.name}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{item.unit ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Seleccionados: {articleCodes.length > 0 ? articleCodes.join(", ") : "Todos"}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => applyArticleCodes([])} disabled={articleCodes.length === 0}>
                Incluir todos
              </Button>
              <Button type="button" className="rounded-2xl" onClick={() => setArticleModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={warehouseModalOpen}
        onClose={() => setWarehouseModalOpen(false)}
        title="Seleccionar bodega"
        description="Filtra los movimientos del kardex por una o varias bodegas específicas."
        contentClassName="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="warehouse-picker-search" className="text-xs uppercase text-muted-foreground">Buscar</Label>
              <Input
                id="warehouse-picker-search"
                value={warehouseSearchTerm}
                onChange={(event) => setWarehouseSearchTerm(event.target.value)}
                placeholder="Código o nombre"
                className="rounded-2xl"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-2xl px-4"
              onClick={() => loadWarehouseOptions(true)}
              disabled={warehousesLoading}
            >
              {warehousesLoading ? "Actualizando..." : "Refrescar catálogo"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Selecciona una o varias bodegas para filtrar el kardex. Deja la lista vacía para mostrar todas.
          </p>
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-muted">
            {warehousesLoading && warehouseOptions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Cargando bodegas disponibles...</p>
            ) : filteredWarehouseOptions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No se encontraron bodegas que coincidan con la búsqueda.</p>
            ) : (
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Código</th>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWarehouseOptions.map((item) => {
                    const isSelected = warehouseCodes.includes(item.code);
                    return (
                      <tr
                        key={item.code}
                        className={`cursor-pointer ${isSelected ? "bg-primary/10" : "hover:bg-muted/40"}`}
                        onClick={() => {
                          const next = isSelected
                            ? warehouseCodes.filter((code) => code !== item.code)
                            : [...warehouseCodes, item.code];
                          applyWarehouseCodes(next);
                        }}
                      >
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.code}</td>
                        <td className="px-4 py-2 text-sm text-foreground">{item.name}</td>
                        <td className="px-4 py-2 text-xs">
                          <span className={`inline-flex rounded-full px-3 py-1 font-semibold ${item.isActive ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                            {item.isActive ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Seleccionadas: {warehouseCodes.length > 0 ? warehouseCodes.join(", ") : "Todas"}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => applyWarehouseCodes([])} disabled={warehouseCodes.length === 0}>
                Incluir todas
              </Button>
              <Button type="button" className="rounded-2xl" onClick={() => setWarehouseModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={printModalOpen}
        onClose={closePrintPreview}
        title="Imprimir kardex"
        description="Vista previa horizontal lista para imprimir o abrir en una pestaña nueva."
        contentClassName="max-w-5xl"
      >
        {printUrl ? (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  const iframe = iframeRef.current;
                  try {
                    iframe?.contentWindow?.focus();
                    iframe?.contentWindow?.print();
                  } catch {
                    window.open(printUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <Button type="button" variant="outline" asChild>
                <a href={printUrl} target="_blank" rel="noreferrer noopener">Abrir en pestaña</a>
              </Button>
            </div>
            <div className="h-[70vh] overflow-hidden rounded-2xl border">
              <iframe ref={iframeRef} src={printUrl} title="Vista previa del kardex" className="h-full w-full" />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-sm text-muted-foreground">
            No hay vista previa disponible.
          </div>
        )}
      </Modal>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Movimientos recientes</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Total de movimientos: ${totalMovements}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && groupedMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay movimientos que coincidan con los filtros seleccionados.</p>
          ) : (
            <div className="space-y-10">
              {groupedMovements.map((group) => {
                const saldoInicial = numberFormatter.format(group.initial_balance);
                const saldoFinal = numberFormatter.format(group.movements.at(-1)?.balance_retail ?? group.initial_balance);
                return (
                  <div key={group.key} className="space-y-4">
                    <div className="flex flex-col gap-2 border-l-4 border-primary pl-4">
                      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{group.article_code} • {group.article_name}</h3>
                          <p className="text-sm text-muted-foreground">Almacén {group.warehouse_code} • {group.warehouse_name}</p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="mr-4">Saldo inicial: <span className="font-semibold text-foreground">{saldoInicial}{group.retail_unit ? ` ${group.retail_unit}` : ""}</span></span>
                          <span>Saldo final: <span className="font-semibold text-foreground">{saldoFinal}{group.retail_unit ? ` ${group.retail_unit}` : ""}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-auto text-left text-sm text-foreground">
                        <thead className="border-b text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 whitespace-nowrap">Fecha</th>
                            <th className="px-3 py-2 whitespace-nowrap">Bodega</th>
                            <th className="px-3 py-2 whitespace-nowrap">Tipo</th>
                            <th className="px-3 py-2 whitespace-nowrap">Documento</th>
                            <th className="px-3 py-2 whitespace-nowrap">Naturaleza</th>
                            <th className="px-3 py-2 whitespace-nowrap text-right">Cantidad</th>
                            <th className="px-3 py-2 whitespace-nowrap text-right">Saldo cantidad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          <tr className="bg-muted/30">
                            <td colSpan={7} className="px-3 py-3 text-sm font-medium text-muted-foreground">
                              Saldo inicial al periodo: {saldoInicial}{group.retail_unit ? ` ${group.retail_unit}` : ""}
                            </td>
                          </tr>
                          {group.movements.map((movement) => {
                            const parts = formatDateParts(movement.occurred_at);
                            const nature = movement.direction === "IN" ? "Entrada" : "Salida";
                            const quantityLabel = `${movement.delta_retail >= 0 ? "+" : "-"}${numberFormatter.format(Math.abs(movement.delta_retail))}${group.retail_unit ? ` ${group.retail_unit}` : ""}`;
                            const balanceLabel = `${numberFormatter.format(movement.balance_retail)}${group.retail_unit ? ` ${group.retail_unit}` : ""}`;
                            return (
                              <tr key={movement.id} className="hover:bg-muted/20">
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className="font-medium text-foreground">{parts.day}</div>
                                  {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className="font-medium text-foreground">{movement.warehouse_code}</div>
                                  <div className="text-xs text-muted-foreground">{movement.warehouse_name}</div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">{transactionTypeLabel[movement.transaction_type] ?? movement.transaction_type}</td>
                                <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                                  {movement.reference ? <div className="font-medium text-foreground">{movement.reference}</div> : <span className="text-xs text-muted-foreground">—</span>}
                                  <div className="text-xs text-muted-foreground">Folio: {movement.transaction_code}</div>
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${movement.direction === "IN" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
                                    {nature}
                                  </span>
                                </td>
                                <td className={`px-3 py-3 text-right font-semibold ${movement.delta_retail >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                                  {quantityLabel}
                                </td>
                                <td className="px-3 py-3 text-right font-semibold text-foreground">{balanceLabel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
