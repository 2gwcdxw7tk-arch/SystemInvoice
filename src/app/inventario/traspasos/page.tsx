"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRightLeft, Loader2, Plus, Search, Trash2 } from "lucide-react";

import { ArticleSearchModal } from "@/components/inventory/article-search-modal";
import { RecentInventoryTransactionBanner } from "@/components/inventory/recent-transaction-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface TransferRecord {
  id: string;
  transaction_code: string;
  occurred_at: string;
  from_warehouse_code: string;
  from_warehouse_name: string;
  to_warehouse_code: string;
  to_warehouse_name: string;
  lines_count: number;
  notes: string | null;
  authorized_by: string | null;
}

interface ArticleOption {
  article_code: string;
  name: string;
  storage_unit?: string | null;
  retail_unit?: string | null;
}

interface WarehouseOption {
  code: string;
  name: string;
}

type TransferLineForm = {
  article_code: string;
  quantity: string;
  unit: "STORAGE" | "RETAIL";
  notes?: string;
};

const UNIT_OPTIONS: Array<{ value: "STORAGE" | "RETAIL"; label: string }> = [
  { value: "STORAGE", label: "Unidad almacén" },
  { value: "RETAIL", label: "Unidad detalle" },
];

function defaultLine(articleCode?: string): TransferLineForm {
  return {
    article_code: articleCode || "",
    quantity: "1",
    unit: "STORAGE",
  };
}

function formatDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString("es-MX"),
    time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TraspasosPage() {
  const { toast } = useToast();
  const [articleFilter, setArticleFilter] = useState("");
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState("");
  const [toWarehouseFilter, setToWarehouseFilter] = useState("");
  const [fromDate, setFromDate] = useState<string>(() => todayIso());
  const [toDate, setToDate] = useState<string>(() => todayIso());
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentTransactionCode, setRecentTransactionCode] = useState<string | null>(null);
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [form, setForm] = useState({
    occurred_at: todayIso(),
    from_warehouse_code: "",
    to_warehouse_code: "",
    authorized_by: "",
    requested_by: "",
    reference: "",
    notes: "",
    lines: [defaultLine()],
  });
  const [articlePickerOpen, setArticlePickerOpen] = useState(false);
  const [articlePickerLineIndex, setArticlePickerLineIndex] = useState<number | null>(null);

  async function loadTransfers(options?: {
    article?: string;
    fromWarehouse?: string;
    toWarehouse?: string;
    from?: string;
    to?: string;
  }) {
    const article = options?.article ?? articleFilter;
    const fromWarehouse = options?.fromWarehouse ?? fromWarehouseFilter;
    const toWarehouse = options?.toWarehouse ?? toWarehouseFilter;
    const from = options?.from ?? fromDate;
    const to = options?.to ?? toDate;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const url = new URL("/api/inventario/traspasos", window.location.origin);
      if (article.trim()) url.searchParams.set("article", article.trim());
      if (fromWarehouse) url.searchParams.set("fromWarehouse", fromWarehouse);
      if (toWarehouse) url.searchParams.set("toWarehouse", toWarehouse);
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudo obtener el historial de traspasos");
      const data = (await response.json()) as { items?: TransferRecord[] };
      setTransfers(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los traspasos";
      setError(message);
      toast({ variant: "error", title: "Traspasos", description: message });
    } finally {
      setLoading(false);
    }
  }

  async function loadArticles() {
    setArticlesLoading(true);
    try {
      const url = new URL("/api/articulos", window.location.origin);
      url.searchParams.set("unit", "RETAIL");
      url.searchParams.set("include_units", "1");
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudieron cargar artículos");
      const data = (await response.json()) as { items?: ArticleOption[] };
      const mapped = Array.isArray(data.items)
        ? data.items.map((item) => ({
            article_code: item.article_code,
            name: item.name,
            storage_unit: item.storage_unit ?? null,
            retail_unit: item.retail_unit ?? null,
          }))
        : [];
      setArticles(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar artículos";
      toast({ variant: "warning", title: "Artículos", description: message });
    } finally {
      setArticlesLoading(false);
    }
  }

  async function loadWarehouses() {
    try {
      const response = await fetch("/api/inventario/warehouses", { credentials: "include" });
      if (!response.ok) throw new Error("No se pudieron cargar los almacenes");
      const data = (await response.json()) as { items?: WarehouseOption[] };
      setWarehouses(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar los almacenes";
      toast({ variant: "warning", title: "Almacenes", description: message });
    }
  }

  useEffect(() => {
    loadArticles();
    loadWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (warehouses.length === 0) return;
    setForm((prev) => ({
      ...prev,
      from_warehouse_code: prev.from_warehouse_code || warehouses[0].code,
      to_warehouse_code: prev.to_warehouse_code || warehouses[1]?.code || warehouses[0].code,
    }));
  }, [warehouses]);

  useEffect(() => {
    if (articles.length === 0) return;
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.article_code ? line : defaultLine(articles[0].article_code))),
    }));
  }, [articles]);

  const filtered = useMemo(() => transfers, [transfers]);

  function resetForm() {
    setForm({
      occurred_at: todayIso(),
      from_warehouse_code: warehouses[0]?.code || "",
      to_warehouse_code: warehouses[1]?.code || warehouses[0]?.code || "",
      authorized_by: "",
      requested_by: "",
      reference: "",
      notes: "",
      lines: [defaultLine(articles[0]?.article_code)],
    });
  }

  function updateLine(index: number, updates: Partial<TransferLineForm>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, idx) => (idx === index ? { ...line, ...updates } : line)),
    }));
  }

  function addLine() {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, defaultLine(articles[0]?.article_code)],
    }));
  }

  function removeLine(index: number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, idx) => idx !== index),
    }));
  }

  function openArticlePicker(lineIndex: number) {
    if (!articles.length && !articlesLoading) {
      void loadArticles();
    }
    setArticlePickerLineIndex(lineIndex);
    setArticlePickerOpen(true);
  }

  function closeArticlePicker() {
    setArticlePickerOpen(false);
    setArticlePickerLineIndex(null);
  }

  function handleArticlePicked(articleCode: string) {
    if (articlePickerLineIndex == null) return;
    updateLine(articlePickerLineIndex, { article_code: articleCode });
    closeArticlePicker();
  }

  async function handleSubmitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.from_warehouse_code || !form.to_warehouse_code) {
      toast({ variant: "warning", title: "Traspasos", description: "Selecciona almacenes de origen y destino" });
      return;
    }
    if (form.from_warehouse_code === form.to_warehouse_code) {
      toast({ variant: "warning", title: "Traspasos", description: "Elige almacenes distintos para el traspaso" });
      return;
    }
    if (!form.authorized_by.trim()) {
      toast({ variant: "warning", title: "Traspasos", description: "Indica quién autoriza el traspaso" });
      return;
    }
    if (form.lines.length === 0) {
      toast({ variant: "warning", title: "Traspasos", description: "Agrega al menos una línea" });
      return;
    }
    for (const line of form.lines) {
      if (!line.article_code.trim()) {
        toast({ variant: "warning", title: "Traspasos", description: "Hay líneas sin artículo" });
        return;
      }
      const quantity = Number(line.quantity.toString().replace(/,/g, "."));
      if (!(quantity > 0)) {
        toast({ variant: "warning", title: "Traspasos", description: `Cantidad inválida en ${line.article_code}` });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        occurred_at: form.occurred_at || undefined,
        from_warehouse_code: form.from_warehouse_code,
        to_warehouse_code: form.to_warehouse_code,
        authorized_by: form.authorized_by.trim(),
        requested_by: form.requested_by.trim() || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        lines: form.lines.map((line) => ({
          article_code: line.article_code,
          quantity: Number(line.quantity.toString().replace(/,/g, ".")),
          unit: line.unit,
          notes: line.notes?.trim() || undefined,
        })),
      };
      const response = await fetch("/api/inventario/traspasos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; transaction_code?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message || "No se pudo registrar el traspaso");
      }
      if (data?.transaction_code) setRecentTransactionCode(data.transaction_code);
      toast({ variant: "success", title: "Traspasos", description: "Traspaso registrado correctamente" });
      setModalOpen(false);
      resetForm();
      loadTransfers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo registrar el traspaso";
      toast({ variant: "error", title: "Traspasos", description: message });
    } finally {
      setSaving(false);
    }
  }

  const totalsByUnit = useMemo(
    () =>
      form.lines.reduce<{ storage: number; retail: number }>((acc, line) => {
        const numericQuantity = Number(line.quantity.toString().replace(/,/g, ".")) || 0;
        if (line.unit === "STORAGE") acc.storage += numericQuantity;
        else acc.retail += numericQuantity;
        return acc;
      }, { storage: 0, retail: 0 }),
    [form.lines]
  );

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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Traspasos entre almacenes</h1>
              <p className="text-sm text-muted-foreground">
                Registra y consulta movimientos de traslado, manteniendo folio, autorización y detalle de líneas.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button
              type="button"
              onClick={() => {
                resetForm();
                setModalOpen(true);
              }}
              className="h-11 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground"
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar traspaso
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
            <Input value={articleFilter} onChange={(event) => setArticleFilter(event.target.value)} placeholder="Código o nombre" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Almacén origen</Label>
            <select
              value={fromWarehouseFilter}
              onChange={(event) => setFromWarehouseFilter(event.target.value)}
              className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Todos</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.code} value={warehouse.code}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Almacén destino</Label>
            <select
              value={toWarehouseFilter}
              onChange={(event) => setToWarehouseFilter(event.target.value)}
              className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Todos</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.code} value={warehouse.code}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
            <DatePicker value={fromDate} onChange={setFromDate} className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
            <DatePicker value={toDate} onChange={setToDate} className="rounded-2xl" />
          </div>
          <div className="flex h-full items-end justify-end gap-2">
            <Button type="button" onClick={() => loadTransfers()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setArticleFilter("");
                setFromWarehouseFilter("");
                setToWarehouseFilter("");
                const today = todayIso();
                setFromDate(today);
                setToDate(today);
                setTransfers([]);
                setError(null);
                setHasSearched(false);
              }}
              className="h-10 rounded-2xl px-4"
            >
              Limpiar
            </Button>
          </div>
        </div>
      </header>

      {recentTransactionCode ? (
        <RecentInventoryTransactionBanner
          code={recentTransactionCode}
          message="Consulta el folio recién generado o imprime el traspaso para su entrega."
          onDismiss={() => setRecentTransactionCode(null)}
        />
      ) : null}

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Historial de traspasos</CardTitle>
          <CardDescription>
            {loading
              ? "Consultando información..."
              : hasSearched
                ? `Total de registros: ${filtered.length}`
                : "Aplica filtros de fecha y ejecuta una búsqueda para ver resultados."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {!hasSearched ? (
            <p className="text-sm text-muted-foreground">Selecciona un rango de fechas y haz clic en Buscar para consultar el historial.</p>
          ) : !loading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay traspasos que coincidan con los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Folio</th>
                    <th className="px-3 py-2">Almacén origen</th>
                    <th className="px-3 py-2">Almacén destino</th>
                    <th className="px-3 py-2">Autorizó</th>
                    <th className="px-3 py-2">Líneas</th>
                    <th className="px-3 py-2">Notas</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((transfer) => {
                    const dateParts = formatDateParts(transfer.occurred_at);
                    return (
                      <tr key={transfer.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col">
                            <span className="font-medium">{dateParts.day}</span>
                            <span className="text-xs text-muted-foreground">{dateParts.time}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-col">
                            <span className="font-medium">{transfer.transaction_code}</span>
                            <span className="text-xs text-muted-foreground">{transfer.lines_count} líneas</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{transfer.from_warehouse_name}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{transfer.from_warehouse_code}</p>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium">{transfer.to_warehouse_name}</p>
                          <p className="text-xs text-muted-foreground">{transfer.to_warehouse_code}</p>
                        </td>
                        <td className="px-3 py-2 align-top">{transfer.authorized_by || "—"}</td>
                        <td className="px-3 py-2 align-top">{transfer.lines_count}</td>
                        <td className="px-3 py-2 align-top">{transfer.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        title="Nuevo traspaso"
        description="Traslada inventario entre almacenes conservando autorización y detalle de líneas."
        contentClassName="max-w-6xl"
      >
        <form onSubmit={handleSubmitTransfer} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Fecha</Label>
              <DatePicker value={form.occurred_at} onChange={(value) => setForm((prev) => ({ ...prev, occurred_at: value }))} className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Autorizado por</Label>
              <Input value={form.authorized_by} onChange={(event) => setForm((prev) => ({ ...prev, authorized_by: event.target.value }))} placeholder="Nombre del responsable" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Solicitado por</Label>
              <Input value={form.requested_by} onChange={(event) => setForm((prev) => ({ ...prev, requested_by: event.target.value }))} placeholder="Área o persona solicitante" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Referencia</Label>
              <Input value={form.reference} onChange={(event) => setForm((prev) => ({ ...prev, reference: event.target.value }))} placeholder="Folio o referencia externa" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Almacén origen</Label>
              <select
                value={form.from_warehouse_code}
                onChange={(event) => setForm((prev) => ({ ...prev, from_warehouse_code: event.target.value }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="" disabled>
                  Selecciona un almacén
                </option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Almacén destino</Label>
              <select
                value={form.to_warehouse_code}
                onChange={(event) => setForm((prev) => ({ ...prev, to_warehouse_code: event.target.value }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <option value="" disabled>
                  Selecciona un almacén
                </option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={3}
                className="w-full rounded-2xl border border-muted bg-background/90 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="Comentarios adicionales"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Detalle del traspaso</h3>
                <p className="text-xs text-muted-foreground">Selecciona artículos, unidad y notas desde una misma grilla.</p>
              </div>
              <div className="ml-auto text-xs text-muted-foreground">{form.lines.length} líneas</div>
              <Button type="button" variant="outline" onClick={addLine} className="rounded-2xl px-4 text-xs">
                <Plus className="mr-2 h-4 w-4" />
                Agregar fila
              </Button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-dashed border-muted">
              <table className="min-w-[920px] w-full table-auto text-sm text-foreground">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Artículo</th>
                    <th className="px-3 py-2 text-left">Unidad</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-left">Notas</th>
                    <th className="px-3 py-2 text-right" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted/70">
                  {form.lines.map((line, index) => {
                    const currentArticle = articles.find((article) => article.article_code === line.article_code);
                    const storageUnit = currentArticle?.storage_unit || "Unidad almacén";
                    const retailUnit = currentArticle?.retail_unit || "Unidad detalle";
                    return (
                      <tr key={`transfer-${index}`} className="align-top">
                        <td className="px-3 py-3 text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex h-10 w-full items-center justify-between rounded-2xl px-3 text-left font-normal"
                            onClick={() => openArticlePicker(index)}
                          >
                            <span className="truncate">
                              {currentArticle ? `${line.article_code} — ${currentArticle.name}` : "Buscar artículo"}
                            </span>
                            <Search className="ml-2 h-4 w-4 text-muted-foreground" />
                          </Button>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {currentArticle ? `${currentArticle.storage_unit || "N/D"} · ${currentArticle.retail_unit || "N/D"}` : "Filtra por código o nombre"}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <select
                            value={line.unit}
                            onChange={(event) => updateLine(index, { unit: event.target.value as "STORAGE" | "RETAIL" })}
                            className="h-10 w-full rounded-2xl border border-muted bg-background/95 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {UNIT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-muted-foreground">{line.unit === "STORAGE" ? storageUnit : retailUnit}</p>
                        </td>
                        <td className="px-3 py-3">
                          <Input
                            value={line.quantity}
                            onChange={(event) => updateLine(index, { quantity: event.target.value })}
                            type="number"
                            min="0"
                            step="0.01"
                            className="rounded-2xl text-right"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Input
                            value={line.notes ?? ""}
                            onChange={(event) => updateLine(index, { notes: event.target.value })}
                            placeholder="Detalle adicional"
                            className="rounded-2xl"
                          />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={form.lines.length === 1}
                            onClick={() => removeLine(index)}
                            className="rounded-2xl px-3 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl bg-muted/30 p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Totales en vivo</p>
              <p>Líneas: {form.lines.length}</p>
              <p>
                Suma unidades almacén: {totalsByUnit.storage.toLocaleString("es-MX", { maximumFractionDigits: 3 })} | Detalle: {totalsByUnit.retail.toLocaleString("es-MX", { maximumFractionDigits: 3 })}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-2xl px-4">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-2xl px-4">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Guardando" : "Registrar traspaso"}
            </Button>
          </div>
        </form>
      </Modal>

      <ArticleSearchModal
        open={articlePickerOpen}
        onClose={closeArticlePicker}
        articles={articles}
        loading={articlesLoading}
        onSelect={handleArticlePicked}
        selectedCode={articlePickerLineIndex != null ? form.lines[articlePickerLineIndex]?.article_code : null}
        onReload={() => void loadArticles()}
        title="Seleccionar artículo"
        description="Filtra el catálogo y asigna el artículo al traspaso."
      />
    </section>
  );
}
