"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface WarehouseFormProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: {
        code: string;
        name: string;
        isActive: boolean;
    } | null;
}

export function WarehouseForm({ open, onClose, onSuccess, initialData }: WarehouseFormProps) {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        code: "",
        name: "",
        isActive: true,
    });

    useEffect(() => {
        if (open) {
            setForm({
                code: initialData?.code || "",
                name: initialData?.name || "",
                isActive: initialData?.isActive ?? true,
            });
        }
    }, [open, initialData]);

    function normalizeCode(value: string) {
        return value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase();
    }

    async function handleSubmit() {
        const code = normalizeCode(form.code);
        const name = form.name.trim();

        if (!code || !name) {
            toast({ variant: "warning", title: "Validación", description: "Código y nombre son obligatorios." });
            return;
        }

        setSaving(true);
        try {
            if (initialData) {
                // Update
                const response = await fetch(`/api/inventario/warehouses/${encodeURIComponent(initialData.code)}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, is_active: form.isActive }),
                });
                if (!response.ok) throw new Error("No se pudo actualizar la bodega");
                toast({ variant: "success", title: "Bodegas", description: "Bodega actualizada correctamente." });
            } else {
                // Create
                const response = await fetch("/api/inventario/warehouses", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code, name, is_active: form.isActive }),
                });
                if (!response.ok) throw new Error("No se pudo registrar la bodega");
                toast({ variant: "success", title: "Bodegas", description: "Bodega registrada correctamente." });
            }
            onSuccess();
            onClose();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Error al guardar";
            toast({ variant: "error", title: "Error", description: message });
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={() => { if (!saving) onClose(); }}
            title={initialData ? `Editar bodega (${initialData.code})` : "Nueva bodega"}
            description="Define códigos cortos y nombres claros para identificar rápidamente cada almacén."
            contentClassName="max-w-lg"
        >
            <div className="grid gap-4">
                <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">Código</Label>
                    <Input
                        value={form.code}
                        onChange={(e) => setForm(prev => ({ ...prev, code: normalizeCode(e.target.value) }))}
                        placeholder="PRINCIPAL"
                        maxLength={20}
                        disabled={!!initialData}
                        className="rounded-2xl"
                    />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
                    <Input
                        value={form.name}
                        onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Almacén principal"
                        maxLength={100}
                        className="rounded-2xl"
                    />
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-muted px-3 py-2 text-sm text-foreground">
                    <span>Estado</span>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl px-3 text-xs"
                        onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                    >
                        {form.isActive ? "Activa" : "Inactiva"}
                    </Button>
                </div>
                <div className="flex gap-3 justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => {
                            if (!saving) onClose();
                        }}
                        disabled={saving}
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        className="rounded-2xl"
                        onClick={() => void handleSubmit()}
                        disabled={saving || !form.code || !form.name}
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {saving ? "Guardando..." : initialData ? "Actualizar" : "Guardar bodega"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
