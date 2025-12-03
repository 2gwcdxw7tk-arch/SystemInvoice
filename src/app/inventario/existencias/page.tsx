"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
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

function parseCodeList(rawValue: string): string[] {
  return Array.from(
    new Set(
      rawValue
        .split(/[\s,;]+/)
        .map((value) => value.trim().toUpperCase())
        .filter((value) => value.length > 0)
    )
  );
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

export default function ExistenciasPage() {
  const { toast } = useToast();
  const [articleCodes, setArticleCodes] = useState<string[]>([]);
  const [articleInputValue, setArticleInputValue] = useState("");
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [articleSearchTerm, setArticleSearchTerm] = useState("");
  const [articleOptions, setArticleOptions] = useState<ArticleOption[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const articleOptionsRequestedRef = useRef(false);
  const [warehouseCodes, setWarehouseCodes] = useState<string[]>([]);
  const [warehouseInputValue, setWarehouseInputValue] = useState("");
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [warehouseSearchTerm, setWarehouseSearchTerm] = useState("");
  const [warehouseOptions, setWarehouseOptions] = useState<WarehouseOption[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const warehouseOptionsRequestedRef = useRef(false);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const applyArticleCodes = useCallback((codes: string[]): string[] => {
    const normalized = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => code.length > 0)));
    setArticleCodes(normalized);
    setArticleInputValue(normalized.join(", "));
    return normalized;
  }, []);

  const applyWarehouseCodes = useCallback((codes: string[]): string[] => {
    const normalized = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => code.length > 0)));
    setWarehouseCodes(normalized);
    setWarehouseInputValue(normalized.join(", "));
    return normalized;
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

  const buildExistenciasRequestUrl = useCallback(
    (format: "json" | "html" = "json", options?: { articles?: string[]; warehouses?: string[] }) => {
      if (typeof window === "undefined") {
        throw new Error("La URL de existencias solo está disponible en el navegador");
      }
      const targetArticles = options?.articles ?? articleCodes;
      const targetWarehouses = options?.warehouses ?? warehouseCodes;
      const url = new URL("/api/inventario/existencias", window.location.origin);
      targetArticles.forEach((code) => {
        if (code.trim().length > 0) url.searchParams.append("article", code.trim().toUpperCase());
      });
      targetWarehouses.forEach((code) => {
        if (code.trim().length > 0) url.searchParams.append("warehouse_code", code.trim().toUpperCase());
      });
      if (format === "html") {
        url.searchParams.set("format", "html");
      }
      return url;
    },
    [articleCodes, warehouseCodes]
  );

  const loadStock = useCallback(
    async (override?: { articles?: string[]; warehouses?: string[] }) => {
      setLoading(true);
      setError(null);
      try {
        const url = buildExistenciasRequestUrl("json", override);
        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("No se pudo obtener existencias");
        const data = (await response.json()) as { items?: StockRow[] };
        setStock(Array.isArray(data.items) ? data.items : []);
        setLastUpdated(new Date().toISOString());
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "No se pudieron cargar las existencias";
        setError(message);
        toast({ variant: "error", title: "Existencias", description: message });
      } finally {
        setLoading(false);
      }
    },
    [buildExistenciasRequestUrl, toast]
  );

  const openPrintPreview = useCallback(() => {
    try {
      const url = buildExistenciasRequestUrl("html");
      setPrintUrl(url.toString());
      setPrintModalOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo preparar la vista para impresión";
      toast({ variant: "error", title: "Existencias", description: message });
    }
  }, [buildExistenciasRequestUrl, toast]);

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
        const items = rawItems.filter((entry): entry is Record<string, unknown> => isRecord(entry));
        const mapped: ArticleOption[] = items
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

  useEffect(() => {
    void loadStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const totalRecords = stock.length;

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
              {lastUpdatedText && <p className="text-xs text-muted-foreground">Última actualización: {lastUpdatedText}</p>}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button type="button" variant="outline" onClick={openPrintPreview} className="h-11 rounded-2xl px-4">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
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
          <div className="flex h-full items-end justify-end gap-2 md:col-span-1">
            <Button type="button" onClick={() => loadStock()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? "Buscando..." : "Buscar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const clearedArticles = applyArticleCodes([]);
                const clearedWarehouses = applyWarehouseCodes([]);
                setLastUpdated(null);
                void loadStock({ articles: clearedArticles, warehouses: clearedWarehouses });
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
        description="Busca en el catálogo y elige uno o varios artículos para consultar existencias."
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
        description="Filtra las existencias por una o varias bodegas específicas."
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
            Selecciona una o varias bodegas para filtrar el cuadro. Deja la lista vacía para mostrar todas.
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
        title="Imprimir existencias"
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
              <iframe ref={iframeRef} src={printUrl} title="Vista previa de existencias" className="h-full w-full" />
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
          <CardTitle className="text-xl font-semibold">Resumen de existencias</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Registros encontrados: ${totalRecords}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && totalRecords === 0 ? (
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
                  {stock.map((row) => (
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
