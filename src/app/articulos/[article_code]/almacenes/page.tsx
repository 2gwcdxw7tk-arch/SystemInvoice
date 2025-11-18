"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-provider";

type WarehouseOverviewItem = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  is_associated: boolean;
  is_primary: boolean;
  associated_at: string | null;
};

type OverviewPayload = {
  success: boolean;
  article?: {
    id: number;
    code: string;
    name: string;
    default_warehouse_id: number | null;
  };
  warehouses?: WarehouseOverviewItem[];
  message?: string;
};

type PendingAction = {
  code: string;
  type: "associate" | "primary" | "remove";
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export default function ArticleWarehousePage() {
  const { toast } = useToast();
  const params = useParams<{ article_code: string }>();
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [filter, setFilter] = useState("");

  const articleCode = useMemo(() => {
    const code = params?.article_code ?? "";
    try {
      return decodeURIComponent(code);
    } catch {
      return code;
    }
  }, [params]);

  async function refreshOverview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/articulos/${encodeURIComponent(articleCode)}/almacenes`);
      if (res.status === 404) {
        const payload = (await res.json()) as OverviewPayload;
        setOverview(null);
        setError(payload.message ?? "El artículo no existe");
        return;
      }
      if (!res.ok) {
        throw new Error("No se pudo obtener el detalle de bodegas");
      }
      const payload = (await res.json()) as OverviewPayload;
      setOverview(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las bodegas";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!articleCode) {
      setError("Código de artículo inválido");
      setLoading(false);
      return;
    }
    refreshOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleCode]);

  const filteredWarehouses = useMemo(() => {
    if (!overview?.warehouses) return [];
    if (!filter.trim()) return overview.warehouses;
    const term = filter.trim().toLowerCase();
    return overview.warehouses.filter(
      (warehouse) =>
        warehouse.code.toLowerCase().includes(term) ||
        warehouse.name.toLowerCase().includes(term)
    );
  }, [overview, filter]);

  async function handleAssociate(code: string, makePrimary = false) {
    setPending({ code, type: makePrimary ? "primary" : "associate" });
    try {
      const res = await fetch(`/api/articulos/${encodeURIComponent(articleCode)}/almacenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_code: code, is_primary: makePrimary }),
      });
      if (!res.ok) {
        const payload = (await res.json()) as OverviewPayload;
        throw new Error(payload.message ?? "No se pudo asociar la bodega");
      }
      const payload = (await res.json()) as OverviewPayload;
      setOverview(payload);
      toast({ variant: "success", title: "Asociación", description: makePrimary ? "Bodega marcada como primaria" : "Bodega asociada" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo asociar la bodega";
      toast({ variant: "error", title: "Asociación", description: message });
    } finally {
      setPending(null);
    }
  }

  async function handleRemove(code: string) {
    if (!confirm(`¿Desasociar la bodega ${code}?`)) return;
    setPending({ code, type: "remove" });
    try {
      const res = await fetch(`/api/articulos/${encodeURIComponent(articleCode)}/almacenes?warehouse_code=${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = (await res.json()) as OverviewPayload;
        throw new Error(payload.message ?? "No se pudo desasociar la bodega");
      }
      const payload = (await res.json()) as OverviewPayload;
      setOverview(payload);
      toast({ variant: "success", title: "Asociación", description: "Bodega desasociada" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo desasociar la bodega";
      toast({ variant: "error", title: "Asociación", description: message });
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <section className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto flex max-w-4xl flex-col gap-6 py-10">
        <Button type="button" variant="outline" className="w-fit rounded-2xl px-3" onClick={() => router.back()}>
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </span>
        </Button>
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Asociaciones de bodegas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!overview?.article) {
    return null;
  }

  return (
    <section className="space-y-10 pb-16">
      <header className="space-y-4">
        <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
          <Link href="/articulos/catalogo" aria-label="Volver al catálogo de artículos">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Volver al catálogo
            </span>
          </Link>
        </Button>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Asociar bodegas — {overview.article.code}
          </h1>
          <p className="text-sm text-muted-foreground">{overview.article.name}</p>
        </div>
      </header>

      <Card className="rounded-3xl border bg-background/95 shadow-sm">
        <CardHeader className="space-y-4">
          <CardTitle className="text-xl font-semibold">Bodegas disponibles</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Filtrar</Label>
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Busca por código o nombre"
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground">Bodega primaria actual</Label>
              <div className="h-10 rounded-2xl border border-dashed border-muted px-3 text-sm leading-10 text-muted-foreground">
                {overview.warehouses?.find((warehouse) => warehouse.is_primary)?.name ?? "Ninguna"}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredWarehouses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay bodegas registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Asociación</th>
                    <th className="px-3 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredWarehouses.map((warehouse) => {
                    const isPending = pending?.code === warehouse.code;
                    return (
                      <tr key={warehouse.id} className="hover:bg-muted/40">
                        <td className="px-3 py-2 font-mono text-xs">{warehouse.code}</td>
                        <td className="px-3 py-2 font-semibold">{warehouse.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {warehouse.is_active ? "Activa" : "Inactiva"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {warehouse.is_associated ? (
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                                Asociada
                              </span>
                              {warehouse.is_primary ? (
                                <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                  <Star className="h-3 w-3" /> Primaria
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                              Sin asociación
                            </span>
                          )}
                          {warehouse.associated_at ? (
                            <p className="mt-1 text-[0.65rem] text-muted-foreground/80">
                              {`Desde ${formatDate(warehouse.associated_at)}`}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {warehouse.is_associated ? (
                              <>
                                {!warehouse.is_primary ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isPending}
                                    className="h-8 rounded-xl px-3 text-xs"
                                    onClick={() => handleAssociate(warehouse.code, true)}
                                  >
                                    {isPending && pending?.type === "primary" ? "Marcando..." : "Marcar primaria"}
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  disabled={isPending}
                                  className="h-8 rounded-xl px-3 text-xs"
                                  onClick={() => handleRemove(warehouse.code)}
                                >
                                  {isPending && pending?.type === "remove" ? "Quitando..." : "Quitar"}
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={isPending}
                                className="h-8 rounded-xl px-3 text-xs"
                                onClick={() => handleAssociate(warehouse.code)}
                              >
                                {isPending ? "Asociando..." : "Asociar"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
