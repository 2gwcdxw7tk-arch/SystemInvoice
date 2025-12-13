"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { KitBuilder } from "@/components/articles/kit-builder";
import { useToast } from "@/components/ui/toast-provider";
import { Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

import type { Article } from "@/lib/repositories/IArticleRepository";
import type { UnitRow } from "@/lib/repositories/units/IUnitRepository";
import type { ArticleClassificationRow } from "@/lib/repositories/IArticleClassificationRepository";

interface ArticlesDataTableProps {
  initialArticles: Article[];
  units: UnitRow[];
  initialClassifications: ArticleClassificationRow[];
}

interface ArticleFormState {
  article_code: string;
  name: string;
  storage_unit_id: string;
  retail_unit_id: string;
  conversion_factor: string;
  article_type: "TERMINADO" | "KIT";
  classification_level1_id?: string;
  classification_level2_id?: string;
  classification_level3_id?: string;
}

export function ArticlesDataTable({ initialArticles, units, initialClassifications }: ArticlesDataTableProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Local state for list (syncs with props)
  const [articles, setArticles] = useState<Article[]>(initialArticles);

  // Sync props to state when server revalidates
  useEffect(() => {
    setArticles(initialArticles);
  }, [initialArticles]);

  const [filterCode, setFilterCode] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterType, setFilterType] = useState("");

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<ArticleFormState>({
    article_code: "",
    name: "",
    storage_unit_id: units[0]?.id?.toString() || "1",
    retail_unit_id: units[0]?.id?.toString() || "1",
    conversion_factor: "1",
    article_type: "TERMINADO",
  });

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [articleModalOpen, setArticleModalOpen] = useState(false);

  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [kitModalCode, setKitModalCode] = useState<string | null>(null);

  // Classifications state
  const [class1, setClass1] = useState<ArticleClassificationRow[]>(initialClassifications);
  const [class2, setClass2] = useState<ArticleClassificationRow[]>([]);
  const [class3, setClass3] = useState<ArticleClassificationRow[]>([]);

  async function fetchClassifications(level: 1 | 2 | 3, parent_full_code?: string) {
    const url = new URL(`/api/clasificaciones`, window.location.origin);
    url.searchParams.set("level", String(level));
    if (typeof parent_full_code !== "undefined") url.searchParams.set("parent_full_code", parent_full_code);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("No se pudieron obtener clasificaciones");
    const data = (await res.json()) as { items?: ArticleClassificationRow[] };
    return data.items ?? [];
  }

  async function loadClassifications(level: 1 | 2 | 3, parent_full_code?: string) {
    try {
      const items = await fetchClassifications(level, parent_full_code);
      if (level === 1) setClass1(items);
      if (level === 2) setClass2(items);
      if (level === 3) setClass3(items);
    } catch {
      toast({ variant: "warning", title: "Clasificaciones", description: "No se pudieron cargar clasificaciones" });
    }
  }

  async function loadForEdit(code: string, fallback?: Article) {
    setLoading(true);
    try {
      const res = await fetch(`/api/articulos?article_code=${encodeURIComponent(code)}`);

      const setupForm = async (it: Article) => {
        setForm({
          article_code: it.article_code,
          name: it.name,
          storage_unit_id: String(it.storage_unit_id || ""),
          retail_unit_id: String(it.retail_unit_id || ""),
          conversion_factor: String(it.conversion_factor),
          article_type: String(it.article_type || "TERMINADO").toUpperCase() as "TERMINADO" | "KIT",
          classification_level1_id: it.classification_level1_id ? String(it.classification_level1_id) : "",
          classification_level2_id: it.classification_level2_id ? String(it.classification_level2_id) : "",
          classification_level3_id: it.classification_level3_id ? String(it.classification_level3_id) : "",
        });
        setEditingCode(code);
        setArticleModalOpen(true);

        if (it.classification_level1_id) {
          const parent1 = class1.find((c) => String(c.id) === String(it.classification_level1_id));
          const l2 = await fetchClassifications(2, parent1?.fullCode);
          setClass2(l2);

          if (it.classification_level2_id) {
            const parent2 = l2.find((c) => String(c.id) === String(it.classification_level2_id));
            const l3 = await fetchClassifications(3, parent2?.fullCode);
            setClass3(l3);
          } else {
            setClass3([]);
          }
        } else {
          setClass2([]);
          setClass3([]);
        }
      };

      if (res.status === 404 && fallback) {
        await setupForm(fallback);
        toast({ variant: "warning", title: "Artículo", description: `Detalle no encontrado, usando datos del listado` });
        return;
      }

      if (!res.ok) throw new Error("No se pudo cargar artículo");
      const data = (await res.json()) as { item?: Article };

      if (data.item) {
        await setupForm(data.item);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast({ variant: "error", title: "Error", description: error.message || "No se pudo cargar" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteArticleCode(code: string) {
    if (!confirm(`¿Eliminar artículo ${code}? Esta acción es irreversible.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/articulos?article_code=${encodeURIComponent(code)}`, { method: "DELETE" });
      if (res.ok) {
        toast({ variant: "success", title: "Artículo", description: `Eliminado ${code}` });
        router.refresh(); // Refresh server data
      } else {
        toast({ variant: "error", title: "Eliminar", description: "No se pudo eliminar el artículo" });
      }
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const payload = {
        article_code: form.article_code.trim(),
        name: form.name.trim(),
        storage_unit_id: Number(form.storage_unit_id),
        retail_unit_id: Number(form.retail_unit_id),
        conversion_factor: Number(form.conversion_factor) || 1,
        article_type: (form.article_type || "TERMINADO").toUpperCase(),
        classification_level1_id: form.classification_level1_id ? Number(form.classification_level1_id) : null,
        classification_level2_id: form.classification_level2_id ? Number(form.classification_level2_id) : null,
        classification_level3_id: form.classification_level3_id ? Number(form.classification_level3_id) : null,
      };

      const res = await fetch("/api/articulos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.ok) {
        setForm({ article_code: "", name: "", storage_unit_id: units[0]?.id?.toString() || "1", retail_unit_id: units[0]?.id?.toString() || "1", conversion_factor: "1", article_type: "TERMINADO" });
        setArticleModalOpen(false);
        router.refresh();
        toast({ variant: "success", title: "Artículo", description: editingCode ? "Actualizado" : "Creado" });
      } else {
        toast({ variant: "error", title: "Artículo", description: "No se pudo guardar" });
      }
    } catch {
      toast({ variant: "error", title: "Error", description: "Fallo de red" });
    } finally {
      setCreating(false);
    }
  }

  const columns: ColumnDef<Article>[] = [
    {
      accessorKey: "article_code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.getValue("article_code")}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
      cell: ({ row }) => <span className="font-semibold">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "storage_unit",
      header: "Almacén",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("storage_unit")}</span>,
    },
    {
      accessorKey: "retail_unit",
      header: "Detalle",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("retail_unit")}</span>,
    },
    {
      accessorKey: "conversion_factor",
      header: "Factor",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("conversion_factor")}</span>,
    },
    {
      accessorKey: "article_type",
      header: "Tipo",
      cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("article_type")}</span>,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const a = row.original;
        return (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={async () => { await loadForEdit(a.article_code, a); }} className="h-8 rounded-xl px-3 text-xs">Editar</Button>
            <Button
              type="button"
              size="sm"
              variant={a.article_type === "KIT" ? "default" : "outline"}
              disabled={a.article_type !== "KIT"}
              title={a.article_type !== "KIT" ? "Disponible solo para artículos KIT" : undefined}
              onClick={() => { if (a.article_type === "KIT") { setKitModalCode(a.article_code); setKitModalOpen(true); } }}
              className="h-8 rounded-xl px-3 text-xs"
            >
              Armado
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => deleteArticleCode(a.article_code)} className="h-8 rounded-xl px-3 text-xs">Eliminar</Button>
          </div>
        )
      }
    }
  ];

  // Client-side filtering combined with generic table
  const filteredArticles = articles.filter(a => {
    if (filterCode && !a.article_code.toLowerCase().includes(filterCode.toLowerCase())) return false;
    if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;
    if (filterType && a.article_type !== filterType) return false;
    return true;
  });

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
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Catálogo de artículos</h1>
            <p className="text-sm text-muted-foreground">Administra altas, ediciones y clasificaciones de tus productos.</p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setEditingCode(null);
              setForm({ article_code: "", name: "", storage_unit_id: units[0]?.id?.toString() || "1", retail_unit_id: units[0]?.id?.toString() || "1", conversion_factor: "1", article_type: "TERMINADO" });
              setArticleModalOpen(true);
            }}
            className="h-11 rounded-2xl px-6"
          >
            Agregar
          </Button>
        </div>
      </header>

      <Modal
        open={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        title={editingCode ? `Editar artículo (${editingCode})` : "Nuevo artículo"}
        contentClassName="max-w-5xl"
      >
        <div className="grid gap-4">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Código</Label>
            <Input value={form.article_code} disabled={!!editingCode} onChange={(e) => setForm(f => ({ ...f, article_code: e.target.value }))} placeholder="COD-001" className="rounded-2xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre del producto" className="rounded-2xl" />
          </div>
          <div className="grid gap-4 xl:grid-cols-5 lg:grid-cols-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <select value={form.article_type} onChange={(e) => setForm(f => ({ ...f, article_type: e.target.value as "TERMINADO" | "KIT" }))} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                <option value="TERMINADO">Terminado</option>
                <option value="KIT">Kit</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Unidad almacén</Label>
              <select value={form.storage_unit_id} onChange={(e) => setForm(f => ({ ...f, storage_unit_id: e.target.value }))} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                {units.map((u) => <option key={u.id} value={u.id}>{u.code} - {u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Unidad detalle</Label>
              <select value={form.retail_unit_id} onChange={(e) => setForm(f => ({ ...f, retail_unit_id: e.target.value }))} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                {units.map((u) => <option key={u.id} value={u.id}>{u.code} - {u.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Factor conversión</Label>
              <Input value={form.conversion_factor} onChange={(e) => setForm(f => ({ ...f, conversion_factor: e.target.value.replace(/[^0-9.]/g, "") }))} className="rounded-2xl" />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Clasificación nivel 1</Label>
              <select value={form.classification_level1_id || ""} onChange={async (e) => {
                const val = e.target.value;
                setForm(f => ({ ...f, classification_level1_id: val, classification_level2_id: "", classification_level3_id: "" }));
                const selected = class1.find((c) => String(c.id) === val);
                await loadClassifications(2, selected?.fullCode);
                setClass3([]);
              }} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                <option value="">- Selecciona -</option>
                {class1.map((c) => <option key={c.id} value={c.id}>{c.fullCode} - {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Clasificación nivel 2</Label>
              <select value={form.classification_level2_id || ""} onChange={async (e) => {
                const val = e.target.value;
                setForm(f => ({ ...f, classification_level2_id: val, classification_level3_id: "" }));
                const selected = class2.find((c) => String(c.id) === val);
                await loadClassifications(3, selected?.fullCode);
              }} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm" disabled={!form.classification_level1_id}>
                <option value="">- Selecciona -</option>
                {class2.map((c) => <option key={c.id} value={c.id}>{c.fullCode} - {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Clasificación nivel 3</Label>
              <select value={form.classification_level3_id || ""} onChange={(e) => setForm(f => ({ ...f, classification_level3_id: e.target.value }))} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm" disabled={!form.classification_level2_id}>
                <option value="">- Selecciona -</option>
                {class3.map((c) => <option key={c.id} value={c.id}>{c.fullCode} - {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={creating || !form.article_code || !form.name} onClick={async () => { await handleCreate(); }} className="rounded-2xl">
              {creating ? "Guardando..." : editingCode ? "Actualizar" : "Guardar artículo"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setArticleModalOpen(false)} className="rounded-2xl">Cerrar</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!editingCode) return;
                router.push(`/articulos/${encodeURIComponent(editingCode)}/almacenes`);
              }}
              disabled={!editingCode}
              className="rounded-2xl px-4"
            >
              {editingCode ? "Administrar bodegas" : "Guarda para asociar bodegas"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={kitModalOpen}
        onClose={() => setKitModalOpen(false)}
        title={kitModalCode ? `Armado del kit (${kitModalCode})` : "Armado del kit"}
        description="Define componentes y cantidades en unidad detalle."
        contentClassName="max-w-6xl"
      >
        <KitBuilder kitCode={kitModalCode} availableArticles={articles} hideHeader suppressLoadToast />
      </Modal>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Listado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Filtrar código</Label>
              <Input value={filterCode} onChange={(e) => setFilterCode(e.target.value)} placeholder="Código" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Filtrar nombre</Label>
              <Input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Nombre" className="rounded-2xl" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                <option value="">Todos</option>
                <option value="TERMINADO">Terminado</option>
                <option value="KIT">Kit</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" onClick={() => { router.refresh(); toast({ variant: "info", title: "Actualizando", description: "Refrescando datos..." }) }} className="rounded-2xl">Refrescar</Button>
              <Button type="button" variant="ghost" onClick={() => { setFilterCode(""); setFilterName(""); setFilterType(""); }} className="rounded-2xl">Limpiar</Button>
            </div>
          </div>
          {loading || deleting ? <p className="text-sm text-muted-foreground">Procesando...</p> : filteredArticles.length === 0 ? <p className="text-sm text-muted-foreground">Sin artículos registrados.</p> : (
            <DataTable columns={columns} data={filteredArticles} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
