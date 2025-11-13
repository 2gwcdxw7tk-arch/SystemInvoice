"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRightLeft, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";

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

export default function TraspasosPage() {
  const { toast } = useToast();
  const [articleFilter, setArticleFilter] = useState("");
  const [fromWarehouseFilter, setFromWarehouseFilter] = useState("");
  const [toWarehouseFilter, setToWarehouseFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [form, setForm] = useState({
    occurred_at: new Date().toISOString().slice(0, 10),
    from_warehouse_code: "",
    to_warehouse_code: "",
    authorized_by: "",
    requested_by: "",
    reference: "",
    notes: "",
    lines: [defaultLine()],
  });

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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los traspasos";
      setError(message);
      toast({ variant: "error", title: "Traspasos", description: message });
    } finally {
      setLoading(false);
    }
  }

  async function loadArticles() {
    try {
      const url = new URL("/api/articulos", window.location.origin);
      url.searchParams.set("unit", "RETAIL");
      url.searchParams.set("include_units", "1");
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudieron cargar artículos");
      const data = (await response.json()) as { items?: ArticleOption[] };
      const mapped: ArticleOption[] = Array.isArray(data.items)
        ? data.items.map((item) => ({
            article_code: item.article_code,
            name: item.name,
            storage_unit: item.storage_unit ?? null,
            retail_unit: item.retail_unit ?? null,
          }))
        : [];
      setArticles(mapped);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar artículos";
      toast({ variant: "warning", title: "Artículos", description: message });
    }
  }

  async function loadWarehouses() {
    try {
      const response = await fetch("/api/inventario/warehouses");
      if (!response.ok) throw new Error("No se pudieron cargar los almacenes");
      const data = (await response.json()) as { items?: WarehouseOption[] };
      const mapped: WarehouseOption[] = Array.isArray(data.items)
        ? data.items.map((row) => ({ code: row.code, name: row.name }))
        : [];
      setWarehouses(mapped);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los almacenes";
      toast({ variant: "warning", title: "Almacenes", description: message });
    }
  }

  useEffect(() => {
    loadTransfers();
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
      occurred_at: new Date().toISOString().slice(0, 10),
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
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "No se pudo registrar el traspaso");
      }
      toast({ variant: "success", title: "Traspasos", description: "Traspaso registrado correctamente" });
      setModalOpen(false);
      resetForm();
      loadTransfers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo registrar el traspaso";
      toast({ variant: "error", title: "Traspasos", description: message });
    } finally {
      setSaving(false);
    }
  }

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
            <Button type="button" variant="outline" onClick={() => loadTransfers()} className="h-11 rounded-2xl px-4">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
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
          <div className="flex items-end gap-2">
            <Button type="button" onClick={() => loadTransfers()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArticleFilter("");
                setFromWarehouseFilter("");
                setToWarehouseFilter("");
                setFromDate("");
                setToDate("");
                loadTransfers({ article: "", fromWarehouse: "", toWarehouse: "", from: "", to: "" });
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
          <CardTitle className="text-xl font-semibold">Historial de traspasos</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Total de registros: ${filtered.length}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Folio</th>
                  <th className="px-3 py-2">Almacén origen</th>
                  <th className="px-3 py-2">Almacén destino</th>
                  <th className="px-3 py-2 text-center">Líneas</th>
                  <th className="px-3 py-2">Autorizó</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Consultando información...
                      </span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No hay traspasos que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((transfer) => {
                    const parts = formatDateParts(transfer.occurred_at);
                    return (
                      <tr key={transfer.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{parts.day}</div>
                          {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{transfer.transaction_code}</span>
                            {transfer.notes && <span className="text-xs text-muted-foreground">{transfer.notes}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{transfer.from_warehouse_name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{transfer.from_warehouse_code}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">{transfer.to_warehouse_name}</div>
                          <div className="text-xs text-muted-foreground">{transfer.to_warehouse_code}</div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex h-8 items-center justify-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">
                            {transfer.lines_count}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm font-medium text-foreground">{transfer.authorized_by || "Sin registro"}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
        contentClassName="max-w-5xl"
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Líneas</h3>
              <Button type="button" variant="outline" onClick={addLine} className="rounded-2xl px-3 text-xs">
                <Plus className="mr-2 h-4 w-4" />
                Agregar línea
              </Button>
            </div>
            <div className="space-y-4">
              {form.lines.map((line, index) => {
                const currentArticle = articles.find((article) => article.article_code === line.article_code);
                const storageUnit = currentArticle?.storage_unit || "Unidad almacén";
                const retailUnit = currentArticle?.retail_unit || "Unidad detalle";
                return (
                  <div key={index} className="rounded-2xl border border-dashed border-muted p-4">
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-1 md:col-span-2">
                        <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
                        <select
                          value={line.article_code}
                          onChange={(event) => updateLine(index, { article_code: event.target.value })}
                          className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <option value="">Selecciona un artículo</option>
                          {articles.map((article) => (
                            <option key={article.article_code} value={article.article_code}>
                              {article.article_code} — {article.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Cantidad</Label>
                        <Input
                          value={line.quantity}
                          onChange={(event) => updateLine(index, { quantity: event.target.value })}
                          type="number"
                          min="0"
                          step="0.01"
                          className="rounded-2xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Unidad</Label>
                        <select
                          value={line.unit}
                          onChange={(event) => updateLine(index, { unit: event.target.value as "STORAGE" | "RETAIL" })}
                          className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {UNIT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">{line.unit === "STORAGE" ? storageUnit : retailUnit}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div className="space-y-1 md:col-span-3">
                        <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
                        <Input
                          value={line.notes ?? ""}
                          onChange={(event) => updateLine(index, { notes: event.target.value })}
                          placeholder="Detalle adicional"
                          className="rounded-2xl"
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeLine(index)}
                          className="rounded-2xl px-3 text-xs text-destructive hover:bg-destructive/10"
                          aria-label="Eliminar línea"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Quitar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
    </section>
  );
}
