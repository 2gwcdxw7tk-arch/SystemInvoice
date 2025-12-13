"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { TransfersDataTable } from "@/components/inventario/traspasos-data-table";
import { TransferForm } from "@/components/inventario/transfer-form";
import { RecentInventoryTransactionBanner } from "@/components/inventory/recent-transaction-banner";
import type { TransferListItem } from "@/lib/types/inventory";
import { useToast } from "@/components/ui/toast-provider";

interface WarehouseOption {
    code: string;
    name: string;
}

interface ArticleLookupItem {
    article_code: string;
    name: string;
    storage_unit?: string | null;
    retail_unit?: string | null;
}

interface TraspasosClientProps {
    data: TransferListItem[];
    warehouses: WarehouseOption[];
}

export function TraspasosClient({ data, warehouses }: TraspasosClientProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [recentTransactionCode, setRecentTransactionCode] = useState<string | null>(null);

    // Articles state (fetched on client for the modal)
    const [articles, setArticles] = useState<ArticleLookupItem[]>([]);
    const [articlesLoading, setArticlesLoading] = useState(false);

    async function loadArticles() {
        setArticlesLoading(true);
        try {
            const url = new URL("/api/articulos", window.location.origin);
            url.searchParams.set("unit", "RETAIL");
            url.searchParams.set("include_units", "1");
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error("No se pudieron cargar artículos");
            const res = await response.json();
            const items = Array.isArray(res.items) ? res.items : [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setArticles(items.map((i: any) => ({
                article_code: i.article_code,
                name: i.name,
                storage_unit: i.storage_unit,
                retail_unit: i.retail_unit
            })));
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_err) {
            toast({ variant: "warning", title: "Artículos", description: "Error cargando catálogo" });
        } finally {
            setArticlesLoading(false);
        }
    }

    const handleCreateClick = () => {
        if (articles.length === 0 && !articlesLoading) {
            void loadArticles();
        }
        setCreateModalOpen(true);
    };

    const handleSuccess = (code?: string) => {
        if (code) setRecentTransactionCode(code);
        setCreateModalOpen(false);
        toast({ variant: "success", title: "Traspasos", description: "Traspaso registrado correctamente" });
        router.refresh();
    };

    return (
        <>
            {recentTransactionCode && (
                <RecentInventoryTransactionBanner
                    code={recentTransactionCode}
                    message="Consulta el folio recién generado o imprime el traspaso para su entrega."
                    onDismiss={() => setRecentTransactionCode(null)}
                />
            )}

            <TransfersDataTable
                data={data}
                warehouses={warehouses}
                onCreateClick={handleCreateClick}
            />

            <TransferForm
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onSuccess={handleSuccess}
                warehouses={warehouses}
                articles={articles}
                articlesLoading={articlesLoading}
                onReloadArticles={loadArticles}
            />
        </>
    );
}
