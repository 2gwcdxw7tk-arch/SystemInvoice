"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface WarehouseFormState {
  code: string;
  name: string;
  isActive: boolean;
}

interface WarehouseListItem {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

const EMPTY_FORM: WarehouseFormState = {
  code: "",
  name: "",
  isActive: true,
};

function normalizeCode(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase();
}

export default function WarehousesPage() {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseFormState>(EMPTY_FORM);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const loadWarehouses = useCallback(async () => {
    setLoading(true);
    try {
      const query = includeInactive ? "?include_inactive=1" : "";
      const response = await fetch(`/api/inventario/warehouses${query}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar las bodegas");
      }
      const data = (await response.json()) as { items?: WarehouseListItem[] };
      setWarehouses(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las bodegas";
      toast({ variant: "error", title: "Bodegas", description: message });
      setWarehouses([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, toast]);

  const filteredWarehouses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return warehouses.filter((warehouse) => {
      if (!includeInactive && !warehouse.is_active) {
        return false;
      }
      if (!term) return true;
      return `${warehouse.code} ${warehouse.name}`.toLowerCase().includes(term);
    });
  }, [includeInactive, searchTerm, warehouses]);

  const openCreateModal = () => {
    setEditingCode(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEditModal = (warehouse: WarehouseListItem) => {
    setEditingCode(warehouse.code);
    setForm({
      code: warehouse.code,
      name: warehouse.name,
      isActive: warehouse.is_active,
    });
    setModalOpen(true);
  };

  async function handleSave() {
    const code = normalizeCode(form.code);
    const name = form.name.trim();
    if (!code || !name) {
      toast({ variant: "warning", title: "Validación", description: "Código y nombre son obligatorios." });
      return;
    }

    setSaving(true);
    try {
      if (editingCode) {
        const response = await fetch(`/api/inventario/warehouses/${encodeURIComponent(editingCode)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, is_active: form.isActive }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.message ?? "No se pudo actualizar la bodega");
        }
        toast({ variant: "success", title: "Bodegas", description: "Bodega actualizada correctamente." });
      } else {
        const response = await fetch("/api/inventario/warehouses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code, name, is_active: form.isActive }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.message ?? "No se pudo registrar la bodega");
        }
        toast({ variant: "success", title: "Bodegas", description: "Bodega registrada correctamente." });
      }

      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditingCode(null);
      await loadWarehouses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar la bodega";
      toast({ variant: "error", title: "Bodegas", description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(warehouse: WarehouseListItem) {
    try {
      const response = await fetch(`/api/inventario/warehouses/${encodeURIComponent(warehouse.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ is_active: !warehouse.is_active }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.message ?? "No se pudo actualizar el estado");
      }
      toast({
        variant: "success",
        title: "Bodegas",
        description: `La bodega ${warehouse.code} ahora está ${warehouse.is_active ? "inactiva" : "activa"}.`,
      });
      await loadWarehouses();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el estado";
      toast({ variant: "error", title: "Bodegas", description: message });
    }
  }

  useEffect(() => {
    void loadWarehouses();
  }, [loadWarehouses]);

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Bodegas</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Administra el catálogo de bodegas para inventarios, cajas y traspasos. Mantén códigos únicos y nombres claros para evitar confusiones al mover existencias.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" onClick={() => void loadWarehouses()} className="rounded-2xl" disabled={loading}>
              {loading ? "Actualizando..." : "Refrescar"}
            </Button>
            <Button type="button" onClick={openCreateModal} className="rounded-2xl">
              Nueva bodega
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <Label className="text-xs uppercase text-muted-foreground" htmlFor="warehouse-search">
              Buscar
            </Label>
            <Input
              id="warehouse-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Código o nombre"
              className="w-full rounded-2xl md:w-72"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-muted bg-background"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Mostrar inactivas
          </label>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Catálogo de bodegas</CardTitle>
          <CardDescription>
            {loading ? "Cargando información..." : `Total: ${filteredWarehouses.length} bodegas visibles`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm text-foreground">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      Cargando bodegas...
                    </td>
                  </tr>
                ) : filteredWarehouses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No hay bodegas que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredWarehouses.map((warehouse) => (
                    <tr key={warehouse.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs">{warehouse.code}</td>
                      <td className="px-3 py-2">{warehouse.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-xs font-semibold ${
                            warehouse.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {warehouse.is_active ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => openEditModal(warehouse)}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={warehouse.is_active ? "destructive" : "secondary"}
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => void handleToggleStatus(warehouse)}
                          >
                            {warehouse.is_active ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
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
        title={editingCode ? `Editar bodega (${editingCode})` : "Nueva bodega"}
        description="Define códigos cortos y nombres claros para identificar rápidamente cada almacén."
        contentClassName="max-w-lg"
      >
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Código</Label>
            <Input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: normalizeCode(event.target.value) }))}
              placeholder="PRINCIPAL"
              maxLength={20}
              disabled={!!editingCode}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Almacén principal"
              maxLength={100}
              className="rounded-2xl"
            />
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-muted px-3 py-2 text-sm text-foreground">
            <span>Estado</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-xl px-3 text-xs"
              onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
            >
              {form.isActive ? "Activa" : "Inactiva"}
            </Button>
          </label>
          <div className="flex gap-3">
            <Button
              type="button"
              className="rounded-2xl"
              onClick={() => void handleSave()}
              disabled={saving || !form.code || !form.name}
            >
              {saving ? "Guardando..." : editingCode ? "Actualizar" : "Guardar bodega"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                if (saving) return;
                setModalOpen(false);
                setForm(EMPTY_FORM);
                setEditingCode(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
