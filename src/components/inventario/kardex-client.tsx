"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { Modal } from "@/components/ui/modal";

import { KardexFilters } from "@/components/inventario/kardex-filters";
import { KardexTable, type KardexGroup, type KardexGroupEntry } from "@/components/inventario/kardex-table";
import { KardexPickerModal } from "@/components/inventario/kardex-picker-modal";

import type { KardexMovementRow } from "@/lib/types/inventory";

interface ArticleOption {
    code: string;
    name: string;
    unit: string | null;
}

interface WarehouseOption {
    code: string;
    name: string;
    isActive: boolean;
}

interface KardexClientProps {
    initialMovements: KardexMovementRow[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    articles: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warehouses: any[];
}

function getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function KardexClient({ initialMovements, articles, warehouses }: KardexClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Date filters
    const [fromDate, setFromDate] = useState(searchParams.get("from") || getTodayIsoDate());
    const [toDate, setToDate] = useState(searchParams.get("to") || getTodayIsoDate());

    // Article filters
    const initialArticleCodes = searchParams.getAll("article");
    const [articleCodes, setArticleCodes] = useState<string[]>(initialArticleCodes);
    const [articleInputValue, setArticleInputValue] = useState(initialArticleCodes.join(", "));

    // Warehouse filters
    const initialWarehouseCodes = searchParams.getAll("warehouse_code");
    const [warehouseCodes, setWarehouseCodes] = useState<string[]>(initialWarehouseCodes);
    const [warehouseInputValue, setWarehouseInputValue] = useState(initialWarehouseCodes.join(", "));

    // Modal states
    const [articleModalOpen, setArticleModalOpen] = useState(false);
    const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [printUrl, setPrintUrl] = useState<string | null>(null);

    // Loading state
    const [isPending, setIsPending] = useState(false);

    // Options from props
    const articleOptions: ArticleOption[] = useMemo(
        () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            articles.map((a: any) => ({
                code: a.article_code.toUpperCase(),
                name: a.name,
                unit: a.retail_unit || a.unit || "und",
            })),
        [articles]
    );

    const warehouseOptions: WarehouseOption[] = useMemo(
        () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            warehouses.map((w: any) => ({
                code: w.code.toUpperCase(),
                name: w.name,
                isActive: w.is_active !== false,
            })),
        [warehouses]
    );

    // Handlers
    const handleArticleInputChange = (value: string) => {
        const uppercase = value.toUpperCase();
        setArticleInputValue(uppercase);
        setArticleCodes(
            uppercase
                .split(/[\s,;]+/)
                .map((s) => s.trim())
                .filter(Boolean)
        );
    };

    const handleWarehouseInputChange = (value: string) => {
        const uppercase = value.toUpperCase();
        setWarehouseInputValue(uppercase);
        setWarehouseCodes(
            uppercase
                .split(/[\s,;]+/)
                .map((s) => s.trim())
                .filter(Boolean)
        );
    };

    const handleArticleSelectionChange = (codes: string[]) => {
        setArticleCodes(codes);
        setArticleInputValue(codes.join(", "));
    };

    const handleWarehouseSelectionChange = (codes: string[]) => {
        setWarehouseCodes(codes);
        setWarehouseInputValue(codes.join(", "));
    };

    const applyFilters = () => {
        setIsPending(true);
        const params = new URLSearchParams();
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);

        articleCodes.forEach((c) => params.append("article", c));
        warehouseCodes.forEach((c) => params.append("warehouse_code", c));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`${pathname}?${params.toString()}` as any);
        setTimeout(() => setIsPending(false), 1000);
    };

    const handleClearFilters = () => {
        setFromDate(getTodayIsoDate());
        setToDate(getTodayIsoDate());
        setArticleCodes([]);
        setArticleInputValue("");
        setWarehouseCodes([]);
        setWarehouseInputValue("");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(pathname as any);
    };

    const openPrintPreview = () => {
        const params = new URLSearchParams();
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        articleCodes.forEach((c) => params.append("article", c));
        warehouseCodes.forEach((c) => params.append("warehouse_code", c));
        params.set("format", "html");

        const url = `/api/inventario/kardex?${params.toString()}`;
        setPrintUrl(url);
        setPrintModalOpen(true);
    };

    // Grouping Logic (Memoized)
    const groupedMovements = useMemo<KardexGroup[]>(() => {
        if (!Array.isArray(initialMovements) || initialMovements.length === 0) {
            return [];
        }

        const groups: KardexGroup[] = [];
        const ledger = new Map<string, { group: KardexGroup; running: number }>();

        const sorted = [...initialMovements].sort((a, b) => {
            const firstCreated = new Date(a.created_at || a.occurred_at).getTime();
            const secondCreated = new Date(b.created_at || b.occurred_at).getTime();
            if (firstCreated !== secondCreated) return firstCreated - secondCreated;
            return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
        });

        for (const movement of sorted) {
            const key = `${movement.article_code}__${movement.warehouse_code}`;
            let entry = ledger.get(key);
            const qty = Number(movement.quantity_retail);
            const balance = Number(movement.balance_retail);

            if (!entry) {
                const delta = movement.direction === "IN" ? qty : -qty;
                const initial = balance - delta;
                const group: KardexGroup = {
                    key,
                    article_code: movement.article_code,
                    article_name: movement.article_name,
                    retail_unit: movement.retail_unit,
                    warehouse_code: movement.warehouse_code,
                    warehouse_name: movement.warehouse_name,
                    initial_balance: initial,
                    movements: [],
                };
                entry = { group, running: balance };
                ledger.set(key, entry);
                groups.push(group);
                group.movements.push({ ...movement, delta_retail: delta } as KardexGroupEntry);
            } else {
                const delta = movement.direction === "IN" ? qty : -qty;
                entry.running = balance;
                entry.group.movements.push({ ...movement, delta_retail: delta } as KardexGroupEntry);
            }
        }

        return groups;
    }, [initialMovements]);

    return (
        <section className="space-y-10 pb-16">
            <KardexFilters
                articleInputValue={articleInputValue}
                onArticleInputChange={handleArticleInputChange}
                onArticleInputDoubleClick={() => setArticleModalOpen(true)}
                warehouseInputValue={warehouseInputValue}
                onWarehouseInputChange={handleWarehouseInputChange}
                onWarehouseInputDoubleClick={() => setWarehouseModalOpen(true)}
                fromDate={fromDate}
                onFromDateChange={setFromDate}
                toDate={toDate}
                onToDateChange={setToDate}
                onApplyFilters={applyFilters}
                onClearFilters={handleClearFilters}
                onPrintClick={openPrintPreview}
                isPending={isPending}
            />

            <KardexPickerModal
                open={articleModalOpen}
                onClose={() => setArticleModalOpen(false)}
                title="Seleccionar artículo"
                options={articleOptions}
                selectedCodes={articleCodes}
                onSelectionChange={handleArticleSelectionChange}
            />

            <KardexPickerModal
                open={warehouseModalOpen}
                onClose={() => setWarehouseModalOpen(false)}
                title="Seleccionar bodega"
                options={warehouseOptions}
                selectedCodes={warehouseCodes}
                onSelectionChange={handleWarehouseSelectionChange}
            />

            <Modal open={printModalOpen} onClose={() => setPrintModalOpen(false)} title="Imprimir" contentClassName="max-w-5xl">
                {printUrl && <iframe src={printUrl} className="w-full h-[70vh] border rounded-xl" />}
            </Modal>

            <KardexTable groups={groupedMovements} isPending={isPending} />
        </section>
    );
}
