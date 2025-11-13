"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface UnitModel {
  code: string;
  name: string;
  symbol: string;
  type: "ALMACEN" | "DETALLE";
  isActive: boolean;
  description?: string;
}

const DEFAULT_UNITS: UnitModel[] = [
  { code: "UND", name: "Unidad", symbol: "und", type: "DETALLE", isActive: true },
  { code: "KG", name: "Kilogramo", symbol: "kg", type: "ALMACEN", isActive: true },
  { code: "LT", name: "Litro", symbol: "L", type: "ALMACEN", isActive: true },
  { code: "PZ", name: "Pieza", symbol: "pz", type: "DETALLE", isActive: false },
];

interface UnitFormState {
  code: string;
  name: string;
  symbol: string;
  type: "ALMACEN" | "DETALLE";
  description: string;
  isActive: boolean;
}

export default function UnidadesPage() {
  const { toast } = useToast();
  const [units, setUnits] = useState<UnitModel[]>(DEFAULT_UNITS);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UnitFormState>({ code: "", name: "", symbol: "", type: "DETALLE", description: "", isActive: true });

  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      const matchesQuery = `${unit.code} ${unit.name}`.toLowerCase().includes(filter.trim().toLowerCase());
      const matchesActive = showInactive ? true : unit.isActive;
      return matchesQuery && matchesActive;
    });
  }, [units, filter, showInactive]);

  const handleOpenModal = (unit?: UnitModel) => {
    if (unit) {
      setEditingCode(unit.code);
      setForm({ code: unit.code, name: unit.name, symbol: unit.symbol, type: unit.type, description: unit.description ?? "", isActive: unit.isActive });
    } else {
      setEditingCode(null);
      setForm({ code: "", name: "", symbol: "", type: "DETALLE", description: "", isActive: true });
    }
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ variant: "warning", title: "Unidades", description: "Código y nombre son obligatorios." });
      return;
    }
    setSaving(true);
    setUnits((prev) => {
      const exists = prev.some((unit) => unit.code === form.code.trim().toUpperCase());
      const updated: UnitModel = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        symbol: form.symbol.trim() || form.code.trim().toLowerCase(),
        type: form.type,
        description: form.description.trim() || undefined,
        isActive: form.isActive,
      };
      if (exists) {
        return prev.map((unit) => (unit.code === updated.code ? updated : unit));
      }
      return [updated, ...prev];
    });
    setSaving(false);
    setModalOpen(false);
    toast({ variant: "success", title: "Unidades", description: editingCode ? "Unidad actualizada" : "Unidad creada" });
  };

  const handleToggleActive = (code: string) => {
    setUnits((prev) => prev.map((unit) => (unit.code === code ? { ...unit, isActive: !unit.isActive } : unit)));
  };

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
              <Link href="/articulos" aria-label="Volver al menú principal de artículos">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Volver al menú
                </span>
              </Link>
            </Button>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Unidades de medida</h1>
              <p className="text-sm text-muted-foreground">Centraliza equivalencias empleadas en almacenes y puntos de venta.</p>
            </div>
          </div>
          <Button type="button" className="rounded-2xl" onClick={() => handleOpenModal()}>Nueva unidad</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
            <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Código o nombre" className="rounded-2xl" />
          </div>
          <label className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-muted bg-background"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Mostrar inactivas
          </label>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado</CardTitle>
          <CardDescription>Se mantiene en memoria cuando MOCK_DATA=true y será persistido al sincronizar con SQL.</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUnits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay unidades que cumplan con los filtros establecidos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Símbolo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredUnits.map((unit) => (
                    <tr key={unit.code} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{unit.code}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{unit.name}</span>
                          {unit.description && <span className="text-xs text-muted-foreground">{unit.description}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{unit.symbol}</td>
                      <td className="px-3 py-2 text-muted-foreground">{unit.type === "ALMACEN" ? "Almacén" : "Detalle"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${unit.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {unit.isActive ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => handleOpenModal(unit)}>Editar</Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => handleToggleActive(unit.code)}>
                            {unit.isActive ? "Desactivar" : "Activar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCode ? `Editar unidad (${editingCode})` : "Nueva unidad"}
        description="Define los parámetros de la unidad empleada en inventario y ventas."
        contentClassName="max-w-3xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Código</Label>
              <Input
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: editingCode ? prev.code : event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                placeholder="EJ. UND"
                className="rounded-2xl"
                disabled={!!editingCode}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Unidad" className="rounded-2xl" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Símbolo</Label>
              <Input value={form.symbol} onChange={(event) => setForm((prev) => ({ ...prev, symbol: event.target.value }))} placeholder="und" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as "ALMACEN" | "DETALLE" }))}
                className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
              >
                <option value="DETALLE">Detalle (venta)</option>
                <option value="ALMACEN">Almacén</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Descripción</Label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-muted bg-background/90 p-3 text-sm"
              placeholder="Uso o equivalencias opcionales"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-muted bg-background"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Unidad activa
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="button" className="rounded-2xl" disabled={saving || !form.code.trim() || !form.name.trim()} onClick={handleSave}>
              {saving ? "Guardando..." : editingCode ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
