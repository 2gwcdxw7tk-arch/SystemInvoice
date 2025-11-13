"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface UnitFormState {
  code: string;
  name: string;
}

interface UnitRow {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
}

export default function UnidadesPage() {
  const { toast } = useToast();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UnitFormState>({ code: "", name: "" });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [unitModalOpen, setUnitModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/unidades");
      if (!res.ok) throw new Error("No se pudieron cargar las unidades");
      const data = (await res.json()) as { items?: UnitRow[] };
      setUnits(Array.isArray(data.items) ? data.items : []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar las unidades";
      toast({ variant: "error", title: "Unidades", description: message });
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  async function save() {
    setSaving(true);
    try {
      const payload = { code: form.code.trim(), name: form.name.trim(), is_active: true };
      const res = await fetch("/api/unidades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        toast({ variant: "success", title: "Unidad", description: editingCode ? "Actualizada" : "Creada" });
        setForm({ code: "", name: "" });
        setEditingCode(null);
        setUnitModalOpen(false);
  await load();
      } else {
        const message = await res.text().catch(() => "");
        toast({ variant: "error", title: "Unidad", description: "No se pudo guardar" });
        if (message) console.error("Error al guardar unidad", message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(code: string, name: string) {
    if (!confirm(`¿Eliminar unidad ${code}?`)) return;
    const res = await fetch("/api/unidades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name, is_active: false }) });
    if (res.ok) {
      toast({ variant: "success", title: "Unidad", description: "Eliminada" });
      await load();
    } else {
      const message = await res.text().catch(() => "");
      toast({ variant: "error", title: "Eliminar", description: "No se pudo eliminar" });
      if (message) console.error("Error al eliminar unidad", message);
    }
  }

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Unidades</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">Administra las unidades de medida que se usarán en los artículos (almacén y detalle). Evita errores de captura obligando a seleccionar desde catálogo.</p>
          </div>
          <Button
            type="button"
            onClick={() => { setEditingCode(null); setForm({ code: "", name: "" }); setUnitModalOpen(true); }}
            className="rounded-2xl"
          >
            Agregar
          </Button>
        </div>
      </header>

      <Modal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        title={editingCode ? `Editar unidad (${editingCode})` : "Nueva unidad"}
        contentClassName="max-w-md"
      >
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Código</Label>
            <Input value={form.code} disabled={!!editingCode} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="UND" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Unidad" className="rounded-2xl" />
          </div>
          <div className="flex gap-3">
            <Button type="button" disabled={saving || !form.code || !form.name} onClick={save} className="rounded-2xl">
              {saving ? "Guardando..." : editingCode ? "Actualizar" : "Guardar unidad"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setUnitModalOpen(false)} className="rounded-2xl">Cerrar</Button>
          </div>
        </div>
      </Modal>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado</CardTitle>
          <CardDescription>Unidades activas disponibles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Nombre</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando...</td>
                  </tr>
                ) : units.length > 0 ? (
                  units.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs">{u.code}</td>
                      <td className="px-3 py-2">{u.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCode(u.code);
                              setForm({ code: u.code, name: u.name });
                              setUnitModalOpen(true);
                            }}
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={loading}
                          >
                            Editar
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => deactivate(u.code, u.name)}
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={loading}
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">Sin unidades.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="outline" onClick={load} className="rounded-2xl" disabled={loading}>Refrescar</Button>
        </CardContent>
      </Card>
    </section>
  );
}
