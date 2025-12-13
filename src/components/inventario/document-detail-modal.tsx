"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";
import { formatCurrency } from "@/config/currency";
import type { InventoryDocument } from "@/lib/types/inventory";

interface DocumentDetailModalProps {
    transactionCode: string | null;
    open: boolean;
    onClose: () => void;
}

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

export function DocumentDetailModal({ transactionCode, open, onClose }: DocumentDetailModalProps) {
    const { toast } = useToast();
    const [detail, setDetail] = useState<InventoryDocument | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !transactionCode) {
            setDetail(null);
            setError(null);
            return;
        }

        let cancelled = false;
        async function fetchDetail() {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/inventario/documentos/${encodeURIComponent(transactionCode!)}`);
                const data = (await response.json().catch(() => null)) as { document?: InventoryDocument; message?: string } | null;
                if (!response.ok || !data?.document) {
                    throw new Error(data?.message || "No se encontró el documento");
                }
                if (!cancelled) setDetail(data.document);
            } catch (err) {
                const message = err instanceof Error ? err.message : "No se pudo cargar el detalle";
                if (!cancelled) {
                    setDetail(null);
                    setError(message);
                }
                toast({ variant: "warning", title: "Documentos", description: message });
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchDetail();
        return () => { cancelled = true; };
    }, [transactionCode, open, toast]);

    function handlePrint() {
        if (!transactionCode) return;
        window.open(`/api/inventario/documentos/${encodeURIComponent(transactionCode)}?format=html`, "_blank", "noopener,noreferrer");
    }

    const typeLabel = detail ? (TRANSACTION_TYPE_LABELS[detail.transaction_type] || detail.transaction_type) : "";
    const dateParts = detail ? formatDateParts(detail.occurred_at) : { day: "", time: "" };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={detail ? `Documento ${detail.transaction_code}` : "Cargando documento..."}
            description="Encabezado y líneas totales del movimiento"
            contentClassName="max-w-4xl" // Wider modal
        >
            <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-2xl" onClick={handlePrint} disabled={!detail}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                    </Button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Cargando detalle...</span>
                    </div>
                ) : null}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                {!loading && !error && !detail ? (
                    <p className="text-sm text-muted-foreground">No se encontró información del documento.</p>
                ) : null}

                {detail ? (
                    <>
                        <div className="rounded-2xl bg-muted/30 p-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Tipo</p>
                                    <p className="text-sm font-semibold text-foreground">{typeLabel}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Fecha</p>
                                    <p className="text-sm font-semibold text-foreground">{dateParts.day} <span className="text-xs font-normal text-muted-foreground">{dateParts.time}</span></p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Almacén</p>
                                    <p className="text-sm font-semibold text-foreground">{detail.warehouse_name}</p>
                                    <p className="text-xs text-muted-foreground">{detail.warehouse_code}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Total</p>
                                    <p className="text-sm font-semibold text-foreground">{detail.total_amount != null ? formatCurrency(detail.total_amount) : "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Referencia</p>
                                    <p className="text-sm font-semibold text-foreground">{detail.reference || "Sin referencia"}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase text-muted-foreground">Contraparte</p>
                                    <p className="text-sm font-semibold text-foreground">{detail.counterparty_name || "No aplica"}</p>
                                </div>
                                <div className="sm:col-span-3">
                                    <p className="text-xs uppercase text-muted-foreground">Notas</p>
                                    <p className="text-sm text-foreground italic">{detail.notes || "—"}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-foreground">Líneas detalle</h3>
                            <div className="overflow-hidden rounded-2xl border border-muted bg-background">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                                            <tr>
                                                <th className="px-3 py-2 font-medium">#</th>
                                                <th className="px-3 py-2 font-medium">Artículo</th>
                                                <th className="px-3 py-2 font-medium">Movimiento</th>
                                                <th className="px-3 py-2 font-medium">Unidad</th>
                                                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                                                <th className="px-3 py-2 text-right font-medium">Detalle (Calc)</th>
                                                <th className="px-3 py-2 font-medium">Notas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-muted/70">
                                            {detail.entries.map((entry) => (
                                                <tr key={entry.line_number} className="hover:bg-muted/10">
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">{entry.line_number}</td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-foreground">{entry.article_code}</div>
                                                        <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={entry.article_name}>{entry.article_name}</div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${entry.direction === 'IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-orange-100 text-orange-800'}`}>
                                                            {entry.direction === "IN" ? "ENTRADA" : "SALIDA"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className="text-xs">{entry.entered_unit === "STORAGE" ? "Almacén" : "Detalle"}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-medium">
                                                        {quantityFormatter.format(entry.quantity_entered)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-muted-foreground">
                                                        {quantityFormatter.format(entry.quantity_retail)}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[150px] truncate" title={entry.notes || ""}>
                                                        {entry.notes || "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </Modal>
    );
}
