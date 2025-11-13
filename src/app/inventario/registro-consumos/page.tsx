"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface ConsumptionRecord {
  id: string;
  occurred_at: string;
  article_code: string;
  article_name: string;
  reason: string | null;
  authorized_by: string | null;
  area: string | null;
  quantity_retail: number;
  quantity_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
  source_kit_code: string | null;
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

type ConsumptionLineForm = {
  article_code: string;
  quantity: string;
  unit: "STORAGE" | "RETAIL";
  notes?: string;
};

const UNIT_OPTIONS: Array<{ value: "STORAGE" | "RETAIL"; label: string }> = [
  { value: "STORAGE", label: "Unidad almacén" },
  { value: "RETAIL", label: "Unidad detalle" },
];

function defaultLine(articleCode?: string): ConsumptionLineForm {
  return {
    article_code: articleCode || "",
    quantity: "1",
    unit: "STORAGE",
    notes: "",
  };
}

function sanitizeNumericInput(value: string): string {
  return value.replace(/[^0-9.,]/g, "");
}

function formatDateParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
  return {
    day: date.toLocaleDateString("es-MX"),
    time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function RegistroConsumosPage() {
  const { toast } = useToast();
  const [articleFilter, setArticleFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [form, setForm] = useState({
    reason: "",
    occurred_at: new Date().toISOString().slice(0, 10),
    authorized_by: "",
    area: "",
    warehouse_code: "",
    notes: "",
    lines: [defaultLine()],
  });

  const quantityFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-MX", {
        maximumFractionDigits: 3,
        minimumFractionDigits: 0,
      }),
    []
  );

  async function loadConsumptions(options?: { article?: string; from?: string; to?: string }) {
    const article = options?.article ?? articleFilter;
    const from = options?.from ?? fromDate;
    const to = options?.to ?? toDate;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/inventario/consumos", window.location.origin);
      if (article.trim().length > 0) url.searchParams.set("article", article.trim());
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudo obtener el registro de consumos");
      const data = (await response.json()) as { items?: ConsumptionRecord[] };
      setConsumptions(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los consumos";
      setError(message);
      toast({ variant: "error", title: "Consumos", description: message });
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
      if (!response.ok) throw new Error("No se pudieron cargar los artículos");
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
      const message = error instanceof Error ? error.message : "No se pudieron cargar los artículos";
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
    loadConsumptions();
    loadArticles();
    loadWarehouses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (warehouses.length > 0) {
      setForm((prev) => ({ ...prev, warehouse_code: prev.warehouse_code || warehouses[0].code }));
    }
  }, [warehouses]);

  useEffect(() => {
    if (articles.length === 0) return;
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.article_code ? line : defaultLine(articles[0].article_code))),
    }));
  }, [articles]);

  const filtered = useMemo(() => consumptions, [consumptions]);

  function resetForm() {
    setForm({
      reason: "",
      occurred_at: new Date().toISOString().slice(0, 10),
      authorized_by: "",
      area: "",
      warehouse_code: warehouses[0]?.code || "",
      notes: "",
      lines: [defaultLine(articles[0]?.article_code)],
    });
  }

  function updateLine(index: number, updates: Partial<ConsumptionLineForm>) {
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

  function validateForm(): string | null {
    if (!form.reason.trim()) return "Captura el motivo del consumo";
    if (!form.authorized_by.trim()) return "Captura la persona que autoriza";
    if (!form.warehouse_code.trim()) return "Selecciona un almacén";
    if (!form.lines.length) return "Agrega al menos un artículo";
    for (const line of form.lines) {
      if (!line.article_code.trim()) return "Todas las líneas requieren un artículo";
      if (!line.quantity.trim() || Number(line.quantity.replace(/,/g, ".")) <= 0) {
        return "Las cantidades deben ser mayores a cero";
      }
    }
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      toast({ variant: "warning", title: "Formulario incompleto", description: validationError });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        reason: form.reason.trim(),
        occurred_at: form.occurred_at || undefined,
        authorized_by: form.authorized_by.trim(),
        area: form.area.trim() || undefined,
        warehouse_code: form.warehouse_code,
        notes: form.notes.trim() || undefined,
        lines: form.lines.map((line) => ({
          article_code: line.article_code,
          quantity: Number(line.quantity.replace(/,/g, ".")) || 0,
          unit: line.unit,
          notes: line.notes?.trim() || undefined,
        })),
      };
      const response = await fetch("/api/inventario/consumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "No se pudo registrar el consumo");
      }
      toast({ variant: "success", title: "Consumo registrado", description: "El movimiento se guardó correctamente" });
      setModalOpen(false);
      resetForm();
      loadConsumptions();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ocurrió un error";
      toast({ variant: "error", title: "Registro de consumo", description: message });
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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Registro de consumos</h1>
              <p className="text-sm text-muted-foreground">
                Controla mermas y salidas de producción registrando consumos por artículo y almacén. Los kits se desglosan en sus componentes automáticamente.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button type="button" variant="outline" onClick={() => loadConsumptions()} className="h-11 rounded-2xl px-4">
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
              Nuevo consumo
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
            <Input
              value={articleFilter}
              onChange={(event) => setArticleFilter(event.target.value)}
              placeholder="Código o nombre"
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-2xl" />
          </div>
          <div className="flex items-end gap-2 md:col-span-4">
            <Button type="button" onClick={() => loadConsumptions()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArticleFilter("");
                setFromDate("");
                setToDate("");
                loadConsumptions({ article: "", from: "", to: "" });
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
          <CardTitle className="text-xl font-semibold">Historial de consumos</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Total de registros: ${filtered.length}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay consumos que coincidan con los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Artículo</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Cantidad</th>
                    <th className="px-3 py-2">Área</th>
                    <th className="px-3 py-2">Autorizó</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((consumption) => {
                    const parts = formatDateParts(consumption.occurred_at);
                    const retailLabel = consumption.retail_unit || "Unidad detalle";
                    const storageLabel = consumption.storage_unit || "Unidad almacén";
                    return (
                      <tr key={consumption.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-medium text-foreground">{parts.day}</div>
                          {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">{consumption.article_name}</div>
                          <div className="text-xs text-muted-foreground">Código {consumption.article_code}</div>
                          {consumption.source_kit_code ? (
                            <div className="text-xs text-muted-foreground">Derivado del kit {consumption.source_kit_code}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">{consumption.reason || "Sin motivo registrado"}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-foreground">
                            {quantityFormatter.format(consumption.quantity_retail)} {retailLabel}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {quantityFormatter.format(consumption.quantity_storage)} {storageLabel}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-foreground">{consumption.area || "No especificada"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-foreground">{consumption.authorized_by || "No registrado"}</span>
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

      <Modal
        open={modalOpen}
        onClose={() => {
          if (saving) return;
          setModalOpen(false);
        }}
        title="Nuevo consumo"
        description="Registra salidas de inventario por mermas, preparación o ajustes autorizados."
        contentClassName="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Motivo</Label>
              <Input
                value={form.reason}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Ej. Merma de cocina"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Autorizó</Label>
              <Input
                value={form.authorized_by}
                onChange={(event) => setForm((prev) => ({ ...prev, authorized_by: event.target.value }))}
                placeholder="Responsable"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Área</Label>
              <Input
                value={form.area}
                onChange={(event) => setForm((prev) => ({ ...prev, area: event.target.value }))}
                placeholder="Departamento o estación"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Fecha</Label>
              <Input
                type="date"
                value={form.occurred_at}
                onChange={(event) => setForm((prev) => ({ ...prev, occurred_at: event.target.value }))}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Almacén</Label>
              <select
                value={form.warehouse_code}
                onChange={(event) => setForm((prev) => ({ ...prev, warehouse_code: event.target.value }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.code} value={warehouse.code}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
              <Input
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Comentarios adicionales"
                className="rounded-2xl"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Artículos consumidos</h3>
              <Button type="button" variant="outline" onClick={addLine} className="rounded-2xl px-3 text-xs">
                <Plus className="mr-2 h-4 w-4" />
                Agregar artículo
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
                          onChange={(event) => updateLine(index, { quantity: sanitizeNumericInput(event.target.value) })}
                          placeholder="0"
                          className="rounded-2xl"
                        />
                        <p className="text-xs text-muted-foreground">{retailUnit}</p>
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
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <Label className="text-xs uppercase text-muted-foreground">Notas</Label>
                        <Input
                          value={line.notes || ""}
                          onChange={(event) => updateLine(index, { notes: event.target.value })}
                          placeholder="Comentarios para esta línea"
                          className="rounded-2xl"
                        />
                      </div>
                      {form.lines.length > 1 && (
                        <Button type="button" variant="ghost" onClick={() => removeLine(index)} className="mt-6 h-10 rounded-2xl px-3 text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (saving) return;
                setModalOpen(false);
              }}
              className="rounded-2xl px-4"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-2xl px-4">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar consumo
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
