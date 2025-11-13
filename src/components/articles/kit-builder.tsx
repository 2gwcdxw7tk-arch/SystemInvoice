"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-provider";

type ArticleOption = {
  article_code: string;
  name: string;
  retail_unit?: string | null;
  article_type?: "TERMINADO" | "KIT";
};

type Row = {
  component_article_code: string;
  component_qty_retail: string; // mantener como string para edición segura
};

interface KitBuilderProps {
  kitCode: string | null; // artículo actual siendo editado
  availableArticles: ArticleOption[]; // catálogo para elegir componentes
  hideHeader?: boolean; // ocultar encabezado cuando ya se muestra desde un modal padre
  suppressLoadToast?: boolean; // evitar toast de carga duplicado
}

export function KitBuilder({ kitCode, availableArticles, hideHeader = false, suppressLoadToast = false }: KitBuilderProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Restringir opciones a artículos TERMINADO y que no sean el mismo kit
  const options = useMemo(() => {
    return (availableArticles || []).filter((a) => a.article_code !== kitCode && (a.article_type === undefined || a.article_type === "TERMINADO"));
  }, [availableArticles, kitCode]);

  async function loadComponents(code: string) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const url = new URL("/api/kits", window.location.origin);
      url.searchParams.set("kit_article_code", code);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("No se pudo cargar el armado");
      const data = (await res.json()) as {
        items?: Array<{ component_article_code: string; component_qty_retail: number | string | null }>;
      };
      const mapped: Row[] = Array.isArray(data.items)
        ? data.items.map((it) => ({
            component_article_code: it.component_article_code,
            component_qty_retail: String(it.component_qty_retail ?? "1"),
          }))
        : [];
      setRows(mapped);
      if (!suppressLoadToast) {
        toast({ variant: "success", title: "Kit", description: `Componentes cargados (${mapped.length})` });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el armado";
      setError(message);
      toast({ variant: "error", title: "Kit", description: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (kitCode) {
      loadComponents(kitCode);
    } else {
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitCode]);

  function addRow() {
    const firstOption = options[0]?.article_code || "";
    setRows((r) => [...r, { component_article_code: firstOption, component_qty_retail: "1" }]);
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!kitCode) return; // seguridad
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Validaciones básicas
      if (rows.length === 0) {
        setError("Agrega al menos un componente");
        setSaving(false);
        return;
      }
      const seen = new Set<string>();
      for (const r of rows) {
        if (!r.component_article_code) {
          setError("Hay componentes sin artículo seleccionado");
          setSaving(false);
          return;
        }
        const qty = Number(r.component_qty_retail);
        if (!(qty > 0)) {
          setError("Las cantidades deben ser mayores a 0");
          setSaving(false);
          return;
        }
        if (seen.has(r.component_article_code)) {
          setError("No se permiten componentes duplicados");
          setSaving(false);
          return;
        }
        seen.add(r.component_article_code);
      }

      const payload = {
        kit_article_code: kitCode,
        components: rows.map((r) => ({
          component_article_code: r.component_article_code,
          component_qty_retail: Number(r.component_qty_retail),
        })),
      };
      const res = await fetch("/api/kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("No se pudo guardar el armado");
      const data = (await res.json()) as { updated?: number };
      const updated = typeof data.updated === "number" ? data.updated : rows.length;
      setMessage(`Armado guardado (${updated} componentes)`);
      toast({ variant: "success", title: "Kit", description: `Armado guardado (${updated})` });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "No se pudo guardar el armado";
      setError(message);
      toast({ variant: "error", title: "Kit", description: message });
    } finally {
      setSaving(false);
    }
  }

  if (!kitCode) {
    return hideHeader ? null : (
      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Armado del kit</CardTitle>
          <CardDescription>Guarda el artículo para definir los componentes del kit (BOM).</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border bg-background/95 shadow-sm">
      {!hideHeader && (
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Armado del kit</CardTitle>
          <CardDescription>Define los componentes en cantidades de su unidad detalle.</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

        <div className="space-y-3">
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="border-b text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Artículo</th>
                  <th className="px-3 py-2">Unidad detalle</th>
                  <th className="px-3 py-2">Cantidad</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Cargando componentes...
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row, idx) => {
                    const unit = options.find((o) => o.article_code === row.component_article_code)?.retail_unit || "";
                    return (
                      <tr key={idx} className="hover:bg-muted/40">
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Componente ${idx + 1}`}
                            value={row.component_article_code}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((r) => r.map((it, i) => (i === idx ? { ...it, component_article_code: v } : it)));
                            }}
                            className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
                            disabled={loading}
                          >
                            {options.map((opt) => (
                              <option key={opt.article_code} value={opt.article_code}>
                                {opt.article_code} - {opt.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{unit || "-"}</td>
                        <td className="px-3 py-2">
                          <Input
                            inputMode="decimal"
                            value={row.component_qty_retail}
                            onChange={(e) => {
                              const clean = e.target.value.replace(/[^0-9.]/g, "");
                              setRows((r) => r.map((it, i) => (i === idx ? { ...it, component_qty_retail: clean } : it)));
                            }}
                            className="h-10 w-28 rounded-2xl"
                            disabled={loading}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removeRow(idx)}
                            className="h-8 rounded-xl px-3 text-xs"
                            disabled={loading}
                          >
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Agrega componentes para construir el kit.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addRow} className="rounded-2xl" disabled={loading}>
              Agregar componente
            </Button>
            <Button type="button" onClick={handleSave} disabled={loading || saving || rows.length === 0} className="rounded-2xl">
              {saving ? "Guardando..." : "Guardar armado"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
