"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";

import { ArticleSearchModal, ArticleLookupItem } from "@/components/inventory/article-search-modal";
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

interface TransferFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (code?: string) => void;
    warehouses: WarehouseOption[];
    articles: ArticleLookupItem[];
    articlesLoading?: boolean;
    onReloadArticles: () => void;
}

type TransferLineForm = {
    article_code: string;
    quantity: string;
    unit: "STORAGE" | "RETAIL";
};

function defaultLine(articleCode?: string): TransferLineForm {
    return {
        article_code: articleCode || "",
        quantity: "1",
        unit: "STORAGE",
    };
}

function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

export function TransferForm({
    open,
    onClose,
    onSuccess,
    warehouses,
    articles,
    articlesLoading = false,
    onReloadArticles
}: TransferFormProps) {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    const [articlePickerOpen, setArticlePickerOpen] = useState(false);
    const [articlePickerLineIndex, setArticlePickerLineIndex] = useState<number | null>(null);

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

    useEffect(() => {
        if (open) {
            // Reset form on open
            setForm({
                occurred_at: todayIso(),
                from_warehouse_code: warehouses[0]?.code || "",
                to_warehouse_code: warehouses[1]?.code || warehouses[0]?.code || "",
                authorized_by: "",
                requested_by: "",
                reference: "",
                notes: "",
                lines: [defaultLine(articles[0]?.article_code)], // Articles might be empty initially
            });
        }
    }, [open, warehouses, articles]); // Note: articles dependency might reset form if articles load after open, check behavior. 
    // Usually we want to set defaultLine article ONLY if form lines are generic. 
    // Better to handle "defaultLine" logic separately or ensure articles available.

    // Update defaults when deps change and form is "fresh" could be complex. 
    // Simplified: Just use whatever is available or empty string.

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
            onReloadArticles();
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
            onSuccess(data?.transaction_code);
        } catch (err) {
            const message = err instanceof Error ? err.message : "No se pudo registrar el traspaso";
            toast({ variant: "error", title: "Traspasos", description: message });
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
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Detalle del traspaso</h3>
                                <p className="text-xs text-muted-foreground">Captura artículos y cantidades desde una grilla similar a compras.</p>
                            </div>
                            <div className="ml-auto text-xs text-muted-foreground">{form.lines.length} líneas</div>
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

                    <div className="flex items-center justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={() => { if (!saving) onClose(); }} disabled={saving} className="rounded-2xl px-4">
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
                onReload={onReloadArticles}
                title="Seleccionar artículo"
                description="Filtra el catálogo y asigna el artículo al traspaso."
            />
        </>
    );
}
