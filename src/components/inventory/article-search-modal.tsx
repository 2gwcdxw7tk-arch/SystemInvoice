"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export interface ArticleLookupItem {
  article_code: string;
  name: string;
  storage_unit?: string | null;
  retail_unit?: string | null;
}

interface ArticleSearchModalProps {
  open: boolean;
  onClose: () => void;
  articles: ArticleLookupItem[];
  loading?: boolean;
  onSelect: (articleCode: string) => void;
  selectedCode?: string | null;
  onReload?: () => void;
  title?: string;
  description?: string;
}

export function ArticleSearchModal({
  open,
  onClose,
  articles,
  loading = false,
  onSelect,
  selectedCode,
  onReload,
  title = "Buscar artículo",
  description = "Filtra por código o nombre y asigna el artículo a la línea seleccionada.",
}: ArticleSearchModalProps) {
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!open) {
      setSearchTerm("");
    }
  }, [open]);

  const filteredArticles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return articles;
    return articles.filter((item) =>
      item.article_code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term)
    );
  }, [articles, searchTerm]);

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} contentClassName="max-w-3xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Código o nombre"
            className="rounded-2xl"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl"
            onClick={() => setSearchTerm("")}
            disabled={searchTerm.length === 0}
          >
            Limpiar
          </Button>
          {onReload ? (
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2 rounded-2xl"
              onClick={onReload}
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4" />
              Recargar
            </Button>
          ) : null}
        </div>
        <div className="rounded-3xl border">
          <div className="max-h-[26rem] overflow-y-auto">
            <table className="min-w-full table-auto text-left text-sm">
              <thead className="sticky top-0 border-b bg-background/95 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Artículo</th>
                  <th className="px-4 py-2">Unidades</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" /> Cargando artículos...
                      </span>
                    </td>
                  </tr>
                ) : filteredArticles.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-16 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Search className="h-5 w-5" />
                        <span>No encontramos coincidencias.</span>
                        {articles.length === 0 && onReload ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-2xl"
                            onClick={onReload}
                            disabled={loading}
                          >
                            Reintentar carga
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredArticles.map((item) => {
                    const isSelected = selectedCode === item.article_code;
                    return (
                      <tr
                        key={item.article_code}
                        className={cn(
                          "cursor-pointer transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          isSelected && "bg-primary/5"
                        )}
                        tabIndex={0}
                        onDoubleClick={() => onSelect(item.article_code)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onSelect(item.article_code);
                          }
                        }}
                      >
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-foreground">{item.name}</p>
                          <p className="font-mono text-xs text-muted-foreground">{item.article_code}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                          <p>Detalle: {item.retail_unit || "N/D"}</p>
                          <p>Almacén: {item.storage_unit || "N/D"}</p>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
