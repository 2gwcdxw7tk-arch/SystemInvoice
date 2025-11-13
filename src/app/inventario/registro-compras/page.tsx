"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, RefreshCcw, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";

interface PurchaseRecord {
  id: string;
  transaction_code: string;
  document_number: string | null;
  supplier_name: string | null;
  occurred_at: string;
  status: "PENDIENTE" | "PARCIAL" | "PAGADA";
  total_amount: number;
  warehouse_name: string;
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

type PurchaseLineForm = {
  article_code: string;
  quantity: string;
  unit: "STORAGE" | "RETAIL";
  cost_per_unit: string;
  notes?: string;
};

const STATUS_OPTIONS: Array<{ value: "PENDIENTE" | "PARCIAL" | "PAGADA"; label: string }> = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PARCIAL", label: "Pago parcial" },
  { value: "PAGADA", label: "Pagada" },
];

const UNIT_OPTIONS: Array<{ value: "STORAGE" | "RETAIL"; label: string }> = [
  { value: "STORAGE", label: "Unidad almacén" },
  { value: "RETAIL", label: "Unidad detalle" },
];

function defaultLine(articleCode?: string): PurchaseLineForm {
  return {
    article_code: articleCode || "",
    quantity: "1",
    unit: "STORAGE",
    cost_per_unit: "",
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

export default function RegistroComprasPage() {
  const { toast } = useToast();
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState<ArticleOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [form, setForm] = useState({
    document_number: "",
    supplier_name: "",
    occurred_at: new Date().toISOString().slice(0, 10),
    status: "PENDIENTE" as "PENDIENTE" | "PARCIAL" | "PAGADA",
    warehouse_code: "",
    notes: "",
    lines: [defaultLine()],
  });

  async function loadPurchases(options?: { supplier?: string; status?: string; from?: string; to?: string }) {
    const supplier = options?.supplier ?? supplierFilter;
    const status = options?.status ?? statusFilter;
    const from = options?.from ?? fromDate;
    const to = options?.to ?? toDate;
    setLoading(true);
    setError(null);
    try {
      const url = new URL("/api/inventario/compras", window.location.origin);
      if (supplier.trim().length > 0) url.searchParams.set("supplier", supplier.trim());
      if (status) url.searchParams.set("status", status);
      if (from) url.searchParams.set("from", from);
      if (to) url.searchParams.set("to", to);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("No se pudo obtener el registro de compras");
      const data = (await response.json()) as { items?: PurchaseRecord[] };
      setPurchases(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las compras";
      setError(message);
      toast({ variant: "error", title: "Compras", description: message });
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
    loadPurchases();
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

  const filtered = useMemo(() => purchases, [purchases]);

  function resetForm() {
    setForm({
      document_number: "",
      supplier_name: "",
      occurred_at: new Date().toISOString().slice(0, 10),
      status: "PENDIENTE",
      warehouse_code: warehouses[0]?.code || "",
      notes: "",
      lines: [defaultLine(articles[0]?.article_code)],
    });
  }

  function updateLine(index: number, updates: Partial<PurchaseLineForm>) {
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
    if (!form.document_number.trim()) return "Captura el documento de compra";
    if (!form.supplier_name.trim()) return "Captura el proveedor";
    if (!form.warehouse_code.trim()) return "Selecciona un almacén";
    if (!form.lines.length) return "Debe haber al menos una línea";
    for (const line of form.lines) {
      if (!line.article_code.trim()) return "Todas las líneas requieren un artículo";
      if (!line.quantity.trim() || Number(line.quantity) <= 0) return "Las cantidades deben ser mayores a cero";
      if (line.cost_per_unit.trim() && Number(line.cost_per_unit) < 0) return "El costo no puede ser negativo";
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
      const response = await fetch("/api/inventario/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lines: form.lines.map((line) => ({
            ...line,
            quantity: Number(line.quantity),
            cost_per_unit: line.cost_per_unit.trim() ? Number(line.cost_per_unit) : undefined,
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || "No se pudo registrar la compra");
      }
      toast({ variant: "success", title: "Compra registrada", description: "El movimiento se guardó correctamente" });
      setModalOpen(false);
      resetForm();
      loadPurchases();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ocurrió un error";
      toast({ variant: "error", title: "Registro de compra", description: message });
    } finally {
      setSaving(false);
    }
  }

  const totalAmount = useMemo(() => {
    return form.lines.reduce((acc, line) => {
      const quantity = Number(line.quantity) || 0;
      const cost = Number(line.cost_per_unit) || 0;
      return acc + quantity * cost;
    }, 0);
  }, [form.lines]);

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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Registro de compras</h1>
              <p className="text-sm text-muted-foreground">
                Captura entradas de inventario detallando artículo, unidad, costo y almacén. Los kits se expanden automáticamente a sus componentes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Button type="button" variant="outline" onClick={() => loadPurchases()} className="h-11 rounded-2xl px-4">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
            <Button type="button" onClick={() => { resetForm(); setModalOpen(true); }} className="h-11 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground">
              <Plus className="mr-2 h-4 w-4" />
              Nueva compra
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-5 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Proveedor</Label>
            <Input value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} placeholder="Nombre o código" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
            <Button type="button" onClick={() => loadPurchases()} disabled={loading} className="h-10 rounded-2xl px-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSupplierFilter("");
                setStatusFilter("");
                setFromDate("");
                setToDate("");
                loadPurchases({ supplier: "", status: "", from: "", to: "" });
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
          <CardTitle className="text-xl font-semibold">Historial de compras</CardTitle>
          <CardDescription>{loading ? "Consultando información..." : `Total de registros: ${filtered.length}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {!loading && filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay compras que coincidan con los filtros seleccionados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Almacén</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((purchase) => {
                    const parts = formatDateParts(purchase.occurred_at);
                    return (
                      <tr key={purchase.id} className="hover:bg-muted/30">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{parts.day}</div>
                          {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{purchase.document_number || "Sin folio"}</span>
                            <span className="text-xs text-muted-foreground">Movimiento {purchase.transaction_code}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground">{purchase.supplier_name || "No especificado"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                              purchase.status === "PAGADA"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : purchase.status === "PARCIAL"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {purchase.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm font-medium text-foreground">{purchase.warehouse_name}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm font-semibold text-foreground">{formatCurrency(purchase.total_amount)}</span>
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
        title="Nueva compra"
        description="Registra una nueva entrada de inventario desde proveedores o traspasos."
        contentClassName="max-w-4xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Documento</Label>
              <Input
                value={form.document_number}
                onChange={(event) => setForm((prev) => ({ ...prev, document_number: event.target.value }))}
                placeholder="Factura, remisión, traspaso"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Proveedor</Label>
              <Input
                value={form.supplier_name}
                onChange={(event) => setForm((prev) => ({ ...prev, supplier_name: event.target.value }))}
                placeholder="Nombre del proveedor"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Fecha</Label>
              <DatePicker
                value={form.occurred_at}
                onChange={(value) => setForm((prev) => ({ ...prev, occurred_at: value }))}
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as "PENDIENTE" | "PARCIAL" | "PAGADA" }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                        <p className="text-xs text-muted-foreground">
                          {line.unit === "STORAGE" ? storageUnit : retailUnit}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Costo unitario</Label>
                        <Input
                          value={line.cost_per_unit}
                          onChange={(event) => updateLine(index, { cost_per_unit: event.target.value })}
                          type="number"
                          min="0"
                          step="0.01"
                          className="rounded-2xl"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
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

          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total estimado</span>
              <span className="text-xl font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Los costos se almacenan según la unidad capturada y se convierten automáticamente a unidad detalle para kardex e inventario.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-2xl px-4">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-2xl px-4">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {saving ? "Guardando" : "Registrar compra"}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
