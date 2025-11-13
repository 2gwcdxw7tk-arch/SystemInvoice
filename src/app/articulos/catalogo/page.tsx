"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { KitBuilder } from "@/components/articles/kit-builder";
import { useToast } from "@/components/ui/toast-provider";
import { Modal } from "@/components/ui/modal";

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

interface ArticleListItem {
  id?: number;
  article_code: string;
  name: string;
  storage_unit?: string | null;
  retail_unit?: string | null;
  storage_unit_id?: number | null;
  retail_unit_id?: number | null;
  conversion_factor: number;
  article_type: "TERMINADO" | "KIT";
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
}

interface UnitOption {
  id: number;
  code: string;
  name: string;
}

interface ClassificationOption {
  id: number;
  name: string;
  full_code: string;
}

interface ArticlesResponse {
  items?: ArticleListItem[];
  units?: UnitOption[];
}

interface ArticleDetailResponse {
  item?: ArticleListItem;
}

export default function ArticulosCatalogoPage() {
  const { toast } = useToast();
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [filterCode, setFilterCode] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterType, setFilterType] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ArticleFormState>({
    article_code: "",
    name: "",
    storage_unit_id: "1",
    retail_unit_id: "1",
    conversion_factor: "1",
    article_type: "TERMINADO",
  });
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [kitModalCode, setKitModalCode] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [class1, setClass1] = useState<ClassificationOption[]>([]);
  const [class2, setClass2] = useState<ClassificationOption[]>([]);
  const [class3, setClass3] = useState<ClassificationOption[]>([]);

  async function loadArticles() {
    setLoading(true);
    try {
      const res = await fetch(`/api/articulos?unit=RETAIL&include_units=1`);
      if (!res.ok) throw new Error("No se pudo obtener artículos");
      const data = (await res.json()) as ArticlesResponse;
      setArticles(data.items ?? []);
      setUnits(data.units ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchClassifications(level: 1 | 2 | 3, parent_full_code?: string) {
    const url = new URL(`/api/clasificaciones`, window.location.origin);
    url.searchParams.set("level", String(level));
    if (typeof parent_full_code !== "undefined") url.searchParams.set("parent_full_code", parent_full_code);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("No se pudieron obtener clasificaciones");
    const data = (await res.json()) as { items?: ClassificationOption[] };
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

  async function loadForEdit(code: string, fallback?: ArticleListItem) {
    setLoading(true);
    try {
      const res = await fetch(`/api/articulos?article_code=${encodeURIComponent(code)}`);
      if (res.status === 404 && fallback) {
        const it = fallback;
        setForm({
          article_code: it.article_code,
          name: it.name,
          storage_unit_id: String(it.storage_unit_id || ""),
          retail_unit_id: String(it.retail_unit_id || ""),
          conversion_factor: String(it.conversion_factor),
          article_type: String(it.article_type || "").toUpperCase() as "TERMINADO" | "KIT",
          classification_level1_id: it.classification_level1_id ? String(it.classification_level1_id) : "",
          classification_level2_id: it.classification_level2_id ? String(it.classification_level2_id) : "",
          classification_level3_id: it.classification_level3_id ? String(it.classification_level3_id) : "",
        });
        setEditingCode(code);
        setArticleModalOpen(true);
        const l1 = await fetchClassifications(1);
        setClass1(l1);
        if (it.classification_level1_id) {
          const parent1 = l1.find((c) => String(c.id) === String(it.classification_level1_id));
          const l2 = await fetchClassifications(2, parent1?.full_code);
          setClass2(l2);
          if (it.classification_level2_id) {
            const parent2 = l2.find((c) => String(c.id) === String(it.classification_level2_id));
            const l3 = await fetchClassifications(3, parent2?.full_code);
            setClass3(l3);
          } else {
            setClass3([]);
          }
        } else {
          setClass2([]);
          setClass3([]);
        }
        toast({ variant: "warning", title: "Artículo", description: `Detalle no encontrado, usando datos del listado (${it.article_code})` });
        return;
      }
      if (!res.ok) throw new Error("No se pudo cargar artículo");
      const data = (await res.json()) as ArticleDetailResponse;
      if (data.item) {
        const it = data.item;
        setForm({
          article_code: it.article_code,
          name: it.name,
          storage_unit_id: String(it.storage_unit_id || ""),
          retail_unit_id: String(it.retail_unit_id || ""),
          conversion_factor: String(it.conversion_factor),
          article_type: String(it.article_type || "").toUpperCase() as "TERMINADO" | "KIT",
          classification_level1_id: it.classification_level1_id ? String(it.classification_level1_id) : "",
          classification_level2_id: it.classification_level2_id ? String(it.classification_level2_id) : "",
          classification_level3_id: it.classification_level3_id ? String(it.classification_level3_id) : "",
        });
        setEditingCode(code);
        setArticleModalOpen(true);
        const l1 = await fetchClassifications(1);
        setClass1(l1);
        if (it.classification_level1_id) {
          const parent1 = l1.find((c) => String(c.id) === String(it.classification_level1_id));
          const l2 = await fetchClassifications(2, parent1?.full_code);
          setClass2(l2);
          if (it.classification_level2_id) {
            const parent2 = l2.find((c) => String(c.id) === String(it.classification_level2_id));
            const l3 = await fetchClassifications(3, parent2?.full_code);
            setClass3(l3);
          } else {
            setClass3([]);
          }
        } else {
          setClass2([]);
          setClass3([]);
        }
        toast({ variant: "success", title: "Artículo", description: `Cargado ${it.article_code}` });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el artículo";
      toast({ variant: "error", title: "Error", description: message });
    } finally {
      setLoading(false);
    }
  }

  async function deleteArticleCode(code: string) {
    if (!confirm(`¿Eliminar artículo ${code}? Esta acción es irreversible.`)) return;
    const res = await fetch(`/api/articulos?article_code=${encodeURIComponent(code)}`, { method: "DELETE" });
    if (res.ok) {
      toast({ variant: "success", title: "Artículo", description: `Eliminado ${code}` });
      await loadArticles();
    } else {
      toast({ variant: "error", title: "Eliminar", description: "No se pudo eliminar el artículo" });
    }
  }

  useEffect(() => { loadArticles(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { loadClassifications(1); }, []);

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
        await loadArticles();
        toast({ variant: "success", title: "Artículo", description: editingCode ? "Actualizado" : "Creado" });
      } else {
        toast({ variant: "error", title: "Artículo", description: "No se pudo guardar" });
      }
    } finally {
      setCreating(false);
    }
  }

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
                await loadClassifications(2, selected?.full_code);
                setClass3([]);
              }} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm">
                <option value="">- Selecciona -</option>
                {class1.map((c) => <option key={c.id} value={c.id}>{c.full_code} - {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Clasificación nivel 2</Label>
              <select value={form.classification_level2_id || ""} onChange={async (e) => {
                const val = e.target.value;
                setForm(f => ({ ...f, classification_level2_id: val, classification_level3_id: "" }));
                const selected = class2.find((c) => String(c.id) === val);
                await loadClassifications(3, selected?.full_code);
              }} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm" disabled={!form.classification_level1_id}>
                <option value="">- Selecciona -</option>
                {class2.map((c) => <option key={c.id} value={c.id}>{c.full_code} - {c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Clasificación nivel 3</Label>
              <select value={form.classification_level3_id || ""} onChange={(e) => setForm(f => ({ ...f, classification_level3_id: e.target.value }))} className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm" disabled={!form.classification_level2_id}>
                <option value="">- Selecciona -</option>
                {class3.map((c) => <option key={c.id} value={c.id}>{c.full_code} - {c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="button" disabled={creating || !form.article_code || !form.name} onClick={async ()=>{ await handleCreate(); setArticleModalOpen(false); }} className="rounded-2xl">
              {creating ? "Guardando..." : editingCode ? "Actualizar" : "Guardar artículo"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setArticleModalOpen(false)} className="rounded-2xl">Cerrar</Button>
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
              <Button type="button" variant="outline" onClick={() => { loadArticles().catch(() => toast({ variant: "warning", title: "Artículos", description: "No se pudieron refrescar" })); }} className="rounded-2xl">Refrescar</Button>
              <Button type="button" variant="ghost" onClick={() => { setFilterCode(""); setFilterName(""); setFilterType(""); }} className="rounded-2xl">Limpiar</Button>
            </div>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">Cargando...</p> : articles.length === 0 ? <p className="text-sm text-muted-foreground">Sin artículos registrados.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Almacén</th>
                    <th className="px-3 py-2">Detalle</th>
                    <th className="px-3 py-2">Factor</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {articles.filter(a => {
                    if (filterCode && !a.article_code.toLowerCase().includes(filterCode.toLowerCase())) return false;
                    if (filterName && !a.name.toLowerCase().includes(filterName.toLowerCase())) return false;
                    if (filterType && a.article_type !== filterType) return false;
                    return true;
                  }).map(a => (
                    <tr key={a.id} className="hover:bg-muted/40">
                      <td className="px-3 py-2 font-mono text-xs">{a.article_code}</td>
                      <td className="px-3 py-2 font-semibold">{a.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.storage_unit}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.retail_unit}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.conversion_factor}</td>
                      <td className="px-3 py-2 text-muted-foreground">{a.article_type}</td>
                      <td className="px-3 py-2">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
