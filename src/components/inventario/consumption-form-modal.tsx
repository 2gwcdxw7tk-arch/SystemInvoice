"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { ArticleSearchModal } from "@/components/inventory/article-search-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface WarehouseOption {
    code: string;
    name: string;
}

interface ArticleOption {
    article_code: string;
    name: string;
    storage_unit?: string | null;
    retail_unit?: string | null;
}

type ConsumptionLineForm = {
    article_code: string;
    quantity: string;
    unit: "STORAGE" | "RETAIL";
};

function defaultLine(articleCode?: string): ConsumptionLineForm {
    return {
        article_code: articleCode || "",
        quantity: "1",
        unit: "STORAGE",
    };
}

interface ConsumptionFormModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (transactionCode?: string) => void;
    warehouses: WarehouseOption[];
}

export function ConsumptionFormModal({ open, onClose, onSuccess, warehouses }: ConsumptionFormModalProps) {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);

    // Article search state
    const [articles, setArticles] = useState<ArticleOption[]>([]);
    const [articlesLoading, setArticlesLoading] = useState(false);
    const [articlePickerOpen, setArticlePickerOpen] = useState(false);
    const [articlePickerLineIndex, setArticlePickerLineIndex] = useState<number | null>(null);

    // Form state
    const [form, setForm] = useState({
        reason: "",
        occurred_at: new Date().toISOString().slice(0, 10),
        authorized_by: "",
        area: "",
        warehouse_code: "",
        notes: "",
        lines: [defaultLine()],
    });

    // Load initial articles for default selections if needed, or just when picker opens
    async function loadArticles() {
        setArticlesLoading(true);
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
        } finally {
            setArticlesLoading(false);
        }
    }

    // Initialize form defaults when opening
    useEffect(() => {
        if (open) {
            if (warehouses.length > 0 && !form.warehouse_code) {
                setForm(prev => ({ ...prev, warehouse_code: warehouses[0].code }));
            }
            if (articles.length === 0) {
                loadArticles();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, warehouses]);

    useEffect(() => {
        if (articles.length > 0 && form.lines.length === 1 && !form.lines[0].article_code) {
            setForm(prev => ({
                ...prev,
                lines: [defaultLine(articles[0].article_code)]
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [articles]);


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

    function openArticlePicker(lineIndex: number) {
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
                })),
            };
            const response = await fetch("/api/inventario/consumos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = (await response.json().catch(() => null)) as { message?: string; transaction_code?: string } | null;
            if (!response.ok) {
                throw new Error(data?.message || "No se pudo registrar el consumo");
            }

            toast({ variant: "success", title: "Consumo registrado", description: "El movimiento se guardó correctamente" });

            // Reset form
            setForm({
                reason: "",
                occurred_at: new Date().toISOString().slice(0, 10),
                authorized_by: "",
                area: "",
                warehouse_code: warehouses[0]?.code || "",
                notes: "",
                lines: [defaultLine(articles[0]?.article_code)],
            });

            onSuccess(data?.transaction_code);
            onClose();

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Ocurrió un error";
            toast({ variant: "error", title: "Registro de consumo", description: message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <Modal
                open={open}
                onClose={() => {
                    if (saving) return;
                    onClose();
                }}
                title="Nuevo consumo"
                description="Registra salidas de inventario por mermas, preparación o ajustes autorizados."
                contentClassName="max-w-6xl"
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
                            <DatePicker
                                value={form.occurred_at}
                                onChange={(value) => setForm((prev) => ({ ...prev, occurred_at: value }))}
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
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-col">
                                <h3 className="text-sm font-semibold text-foreground">Artículos consumidos</h3>
                                <p className="text-xs text-muted-foreground">Gestiona todas las líneas desde una sola grilla editable.</p>
                            </div>
                            <div className="ml-auto text-xs text-muted-foreground">
                                {form.lines.length} líneas capturadas
                            </div>
                            <Button type="button" variant="outline" onClick={addLine} className="rounded-2xl px-4 text-xs">
                                <Plus className="mr-2 h-4 w-4" />
                                Agregar fila
                            </Button>
                        </div>
                        <div className="overflow-x-auto rounded-2xl border border-dashed border-muted">
                            <table className="w-full min-w-[960px] table-auto text-sm text-foreground">
                                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                                    <tr>
                                        <th className="w-10 px-3 py-2 text-left">#</th>
                                        <th className="w-[45%] px-3 py-2 text-left">Artículo</th>
                                        <th className="w-[30%] px-3 py-2 text-left">Unidad</th>
                                        <th className="w-[15%] px-3 py-2 text-right">Cantidad</th>
                                        <th className="w-14 px-3 py-2 text-right" aria-label="Acciones" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-muted/70">
                                    {form.lines.map((line, index) => {
                                        const currentArticle = articles.find((article) => article.article_code === line.article_code);
                                        const storageUnit = currentArticle?.storage_unit || "Unidad almacén";
                                        const retailUnit = currentArticle?.retail_unit || "Unidad detalle";
                                        const unitOptions = [
                                            { value: "STORAGE" as const, label: `${storageUnit} — Unidad almacén` },
                                            { value: "RETAIL" as const, label: `${retailUnit} — Unidad detalle` },
                                        ];
                                        return (
                                            <tr key={`consumption-${index}`} className="align-top">
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
                                                </td>
                                                <td className="px-3 py-3">
                                                    <select
                                                        value={line.unit}
                                                        onChange={(event) => updateLine(index, { unit: event.target.value as "STORAGE" | "RETAIL" })}
                                                        className="h-10 w-full rounded-2xl border border-muted bg-background/95 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                                    >
                                                        {unitOptions.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <Input
                                                        value={line.quantity}
                                                        onChange={(event) => updateLine(index, { quantity: event.target.value })}
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        className="w-28 rounded-2xl text-right"
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
                    </div>

                    <div className="space-y-2 border-t pt-4">
                        <Label className="text-xs uppercase text-muted-foreground">Notas del movimiento</Label>
                        <textarea
                            value={form.notes}
                            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                            placeholder="Comentarios adicionales"
                            className="min-h-[80px] w-full rounded-2xl border border-muted bg-background/95 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        />
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                                if (saving) return;
                                onClose();
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

            <ArticleSearchModal
                open={articlePickerOpen}
                onClose={closeArticlePicker}
                articles={articles}
                loading={articlesLoading}
                onSelect={handleArticlePicked}
                selectedCode={articlePickerLineIndex != null ? form.lines[articlePickerLineIndex]?.article_code : null}
                onReload={() => void loadArticles()}
                title="Seleccionar artículo"
                description="Filtra el catálogo y asigna el artículo consumido a la línea actual."
            />
        </>
    );
}
