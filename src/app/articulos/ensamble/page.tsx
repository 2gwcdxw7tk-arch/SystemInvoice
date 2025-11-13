"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { KitBuilder } from "@/components/articles/kit-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-provider";

interface KitModel {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  componentsCount: number;
  lastUpdated: string;
}

const DEFAULT_KITS: KitModel[] = [
  { code: "KIT-BARISTA", name: "Kit barista", description: "Incluye taza, filtro metálico y café 250g", isActive: true, componentsCount: 5, lastUpdated: "2025-11-04 09:12" },
  { code: "KIT-DESAYUNO", name: "Desayuno continental", description: "Café americano, croissant y fruta", isActive: true, componentsCount: 3, lastUpdated: "2025-11-06 15:37" },
  { code: "KIT-REGALO", name: "Caja regalo gourmet", description: "Selección de salsas y botanas", isActive: false, componentsCount: 7, lastUpdated: "2025-10-29 18:05" },
];

interface KitFormState {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface KitArticleOption {
  article_code: string;
  name: string;
  retail_unit?: string | null;
  article_type?: "TERMINADO" | "KIT";
}

export default function EnsamblePage() {
  const { toast } = useToast();
  const [kits, setKits] = useState<KitModel[]>(DEFAULT_KITS);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [builderModalOpen, setBuilderModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [builderKitCode, setBuilderKitCode] = useState<string | null>(null);
  const [form, setForm] = useState<KitFormState>({ code: "", name: "", description: "", isActive: true });
  const [articles, setArticles] = useState<KitArticleOption[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(false);

  const filteredKits = useMemo(() => {
    return kits.filter((kit) => {
      const matchesQuery = `${kit.code} ${kit.name}`.toLowerCase().includes(filter.trim().toLowerCase());
      const matchesActive = showInactive ? true : kit.isActive;
      return matchesQuery && matchesActive;
    });
  }, [kits, filter, showInactive]);

  const openInfoModal = (kit?: KitModel) => {
    if (kit) {
      setEditingCode(kit.code);
      setForm({ code: kit.code, name: kit.name, description: kit.description, isActive: kit.isActive });
    } else {
      setEditingCode(null);
      setForm({ code: "", name: "", description: "", isActive: true });
    }
    setInfoModalOpen(true);
  };

  const openBuilderModal = (kit: KitModel) => {
    setBuilderKitCode(kit.code);
    setBuilderModalOpen(true);
  };

  const loadArticles = async () => {
    setArticlesLoading(true);
    try {
      const res = await fetch(`/api/articulos?unit=RETAIL&include_units=1`);
      if (!res.ok) throw new Error("No se pudo obtener el catálogo");
      const data = (await res.json()) as { items?: KitArticleOption[] };
      setArticles(data.items ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el catálogo";
      toast({ variant: "warning", title: "Catálogo", description: message });
    } finally {
      setArticlesLoading(false);
    }
  };

  useEffect(() => {
    loadArticles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveKit = () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ variant: "warning", title: "Kits", description: "Código y nombre son obligatorios." });
      return;
    }
    setSaving(true);
    setKits((prev) => {
      const timestamp = new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
      const normalized: KitModel = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim(),
        isActive: form.isActive,
        componentsCount: prev.find((kit) => kit.code === form.code.trim().toUpperCase())?.componentsCount ?? 0,
        lastUpdated: timestamp,
      };
      const exists = prev.some((kit) => kit.code === normalized.code);
      if (exists) {
        return prev.map((kit) => (kit.code === normalized.code ? normalized : kit));
      }
      return [normalized, ...prev];
    });
    setSaving(false);
    setInfoModalOpen(false);
    toast({ variant: "success", title: "Kits", description: editingCode ? "Kit actualizado" : "Kit registrado" });
  };

  const handleToggleActive = (code: string) => {
    setKits((prev) => prev.map((kit) => (kit.code === code ? { ...kit, isActive: !kit.isActive } : kit)));
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
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Ensamble de kits</h1>
              <p className="text-sm text-muted-foreground">Gestiona la composición y vigencia de kits o combos vendidos.</p>
            </div>
          </div>
          <Button type="button" className="rounded-2xl" onClick={() => openInfoModal()}>Nuevo kit</Button>
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
            Mostrar inactivos
          </label>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado</CardTitle>
          <CardDescription>Los kits persisten en memoria cuando MOCK_DATA=true y se sincronizarán con la base de datos más adelante.</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredKits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay kits disponibles con los filtros actuales.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm text-foreground">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Componentes</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Actualización</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredKits.map((kit) => (
                    <tr key={kit.code} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{kit.code}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">{kit.name}</span>
                          <span className="text-xs text-muted-foreground">{kit.description}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{kit.componentsCount}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${kit.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                          <span className="h-2 w-2 rounded-full bg-current" />
                          {kit.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{kit.lastUpdated}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => openInfoModal(kit)}>Editar</Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => openBuilderModal(kit)}>
                            Configurar componentes
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => handleToggleActive(kit.code)}>
                            {kit.isActive ? "Desactivar" : "Activar"}
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
        open={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        title={editingCode ? `Editar kit (${editingCode})` : "Nuevo kit"}
        description="Define el kit, su descripción comercial y estado general."
        contentClassName="max-w-3xl"
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Código</Label>
              <Input
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: editingCode ? prev.code : event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                placeholder="EJ. KIT-CAF"
                className="rounded-2xl"
                disabled={!!editingCode}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Kit barista" className="rounded-2xl" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Descripción</Label>
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-muted bg-background/90 p-3 text-sm"
              placeholder="Detalle de componentes o notas comerciales"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-muted bg-background"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Kit activo
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setInfoModalOpen(false)}>Cancelar</Button>
            <Button type="button" className="rounded-2xl" disabled={saving || !form.code.trim() || !form.name.trim()} onClick={handleSaveKit}>
              {saving ? "Guardando..." : editingCode ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={builderModalOpen}
        onClose={() => setBuilderModalOpen(false)}
        title={builderKitCode ? `Componentes del kit (${builderKitCode})` : "Componentes del kit"}
        description="Define unidades, cantidades y jerarquía de componentes."
        contentClassName="max-w-6xl"
      >
        {articlesLoading ? (
          <p className="text-sm text-muted-foreground">Cargando catálogo...</p>
        ) : (
          <KitBuilder kitCode={builderKitCode} availableArticles={articles} hideHeader suppressLoadToast />
        )}
      </Modal>
    </section>
  );
}
