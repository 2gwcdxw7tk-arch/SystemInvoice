"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";

import type { StockSummaryRow } from "@/lib/types/inventory";

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

interface ExistenciasDataTableProps {
    initialData: StockSummaryRow[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    articles: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    warehouses: any[];
}

export function ExistenciasDataTable({ initialData, articles, warehouses }: ExistenciasDataTableProps) {
    // State from original page
    const [articleCodes, setArticleCodes] = useState<string[]>([]);
    const [articleInputValue, setArticleInputValue] = useState("");
    const [articleModalOpen, setArticleModalOpen] = useState(false);

    const [warehouseCodes, setWarehouseCodes] = useState<string[]>([]);
    const [warehouseInputValue, setWarehouseInputValue] = useState("");
    const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);

    // Picker states - Initialized from props
    const [articleSearchTerm, setArticleSearchTerm] = useState("");
    const [articleOptions] = useState<ArticleOption[]>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        articles.map((i: any) => ({
            code: i.article_code.toUpperCase(),
            name: i.name,
            unit: i.retail_unit || i.unit || "und" // Adjust mapping based on actual object shape from service
        }))
    );

    const [warehouseSearchTerm, setWarehouseSearchTerm] = useState("");
    const [warehouseOptions] = useState<WarehouseOption[]>(() =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warehouses.map((i: any) => ({
            code: i.code.toUpperCase(),
            name: i.name,
            isActive: i.is_active !== false
        }))
    );

    // Print state
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [printUrl, setPrintUrl] = useState<string | null>(null);

    // We process the passed initialData based on local filters.
    // Note: Original page fetched filtered stock from server.
    // If we want "Server Component" to handle initial load, we did that.
    // BUT the user might filter further.
    // Option A: Client-side filter of the initialData (if initialData is ALL items).
    // Option B: Server-side refetch on filter change.
    // The original implementation fetched on button click.
    // To provide instant UX, if `initialData` contains EVERYTHING, client filter is best.
    // However, large inventories might be too big.
    // Let's implement Client-side filtering of the `initialData` provided by the server page.
    // Assuming the Server Page fetches ALL stock (which might be heavy but let's assume it fits for now or we limit it).
    // Actually, standard usually is Filter -> Server Query.
    // But standard DataTable usually implies Client Sort/Paginate of loaded data.
    // I will implement CLIENT filtering of the `initialData` prop for now to match the "Instant" goal.
    // And I will NOT implement the "Search Button" that refetches, but rather reactive filtering?
    // Original page had explicit "Buscar" button.
    // I will keep logic: Filter inputs filter the `initialData` (which effectively acts as the "loaded data").
    // If the user wants to reload from server with different params, we would need to standard Next.js SearchParams navigation.
    // For this Refactor Phase 3, let's stick to: Server loads DEFAULT stock (maybe all?), Client filters it.

    const applyArticleCodes = (codes: string[]) => {
        const normalized = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0)));
        setArticleCodes(normalized);
        setArticleInputValue(normalized.join(", "));
    };

    const applyWarehouseCodes = (codes: string[]) => {
        const normalized = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter((c) => c.length > 0)));
        setWarehouseCodes(normalized);
        setWarehouseInputValue(normalized.join(", "));
    };

    // Data Fetching for Pickers (Client side to avoid huge initial payload if not needed)
    // Removed loadArticleOptions and loadWarehouseOptions as data is passed via props.

    // Filter Logic (Client Side)
    const filteredStock = useMemo(() => {
        let result = initialData;
        if (articleCodes.length > 0) {
            result = result.filter(r => articleCodes.includes(r.article_code));
        }
        if (warehouseCodes.length > 0) {
            result = result.filter(r => warehouseCodes.includes(r.warehouse_code));
        }
        // Also filter by text input if it doesn't match a code list exactly? 
        // The original logic `articleInputValue` parses to `articleCodes`.
        // So `articleCodes` is the source of truth.

        return result;
    }, [initialData, articleCodes, warehouseCodes]);

    // Print Logic
    const openPrintPreview = () => {
        // We need to construct URL for print. 
        // We can still use the API for generating HTML.
        const url = new URL("/api/inventario/existencias", window.location.origin);
        articleCodes.forEach(c => url.searchParams.append("article", c));
        warehouseCodes.forEach(c => url.searchParams.append("warehouse_code", c));
        url.searchParams.set("format", "html");
        setPrintUrl(url.toString());
        setPrintModalOpen(true);
    };

    const articlePickerFiltered = articleOptions.filter(o =>
        !articleSearchTerm ||
        o.code.includes(articleSearchTerm.toUpperCase()) ||
        o.name.toUpperCase().includes(articleSearchTerm.toUpperCase())
    );

    const warehousePickerFiltered = warehouseOptions.filter(o =>
        !warehouseSearchTerm ||
        o.code.includes(warehouseSearchTerm.toUpperCase()) ||
        o.name.toUpperCase().includes(warehouseSearchTerm.toUpperCase())
    );

    // Columns
    const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

    const columns: ColumnDef<StockSummaryRow>[] = [
        {
            accessorKey: "article_code",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Artículo" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-semibold">{row.original.article_code}</span>
                    <span className="text-xs text-muted-foreground">{row.original.article_name}</span>
                </div>
            ),
        },
        {
            accessorKey: "warehouse_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Almacén" />,
            cell: ({ row }) => <span className="text-muted-foreground">{row.getValue("warehouse_name")}</span>,
        },
        {
            accessorKey: "available_retail",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Detalle Disponible" />,
            cell: ({ row }) => (
                <div className="text-right font-semibold">
                    {numberFormatter.format(row.getValue("available_retail"))} {row.original.retail_unit || "und"}
                </div>
            ),
        },
        {
            accessorKey: "available_storage",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Almacén Disponible" />,
            cell: ({ row }) => (
                <div className="text-right font-semibold">
                    {numberFormatter.format(row.getValue("available_storage"))} {row.original.storage_unit || row.original.retail_unit || "und"}
                </div>
            ),
        }
    ];

    return (
        <section className="space-y-10 pb-16">
            <header className="space-y-4">
                {/* Simplified Header */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold tracking-tight">Existencias</h1>
                        <p className="text-sm text-muted-foreground">Consulta de saldos en tiempo real.</p>
                    </div>
                    <Button variant="outline" onClick={openPrintPreview}>
                        <Printer className="mr-2 h-4 w-4" /> Imprimir
                    </Button>
                </div>

                {/* Filters */}
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
                        <Input
                            value={articleInputValue}
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setArticleInputValue(val);
                                setArticleCodes(val.split(/[\s,;]+/).filter(x => x).map(x => x.trim()));
                            }}
                            onDoubleClick={() => { setArticleModalOpen(true); }}
                            placeholder="Filtrar códigos..."
                            className="rounded-2xl"
                        />
                        <p className="text-xs text-muted-foreground">Doble clic para buscar en catálogo.</p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Almacén</Label>
                        <Input
                            value={warehouseInputValue}
                            onChange={(e) => {
                                const val = e.target.value.toUpperCase();
                                setWarehouseInputValue(val);
                                setWarehouseCodes(val.split(/[\s,;]+/).filter(x => x).map(x => x.trim()));
                            }}
                            onDoubleClick={() => { setWarehouseModalOpen(true); }}
                            placeholder="Filtrar almacenes..."
                            className="rounded-2xl"
                        />
                        <p className="text-xs text-muted-foreground">Doble clic para buscar.</p>
                    </div>
                </div>
            </header>

            <Card className="rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader>
                    <CardTitle>Listado</CardTitle>
                    <CardDescription>{filteredStock.length} registros encontrados</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={filteredStock} />
                </CardContent>
            </Card>

            {/* Article Picker Modal */}
            <Modal open={articleModalOpen} onClose={() => setArticleModalOpen(false)} title="Seleccionar Artículo" contentClassName="max-w-3xl">
                <div className="space-y-4">
                    <Input placeholder="Buscar..." value={articleSearchTerm} onChange={e => setArticleSearchTerm(e.target.value)} autoFocus />
                    <div className="max-h-80 overflow-y-auto border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead><tr className="border-b"><th className="p-2">Cod</th><th className="p-2">Nombre</th></tr></thead>
                            <tbody>
                                {articlePickerFiltered.map(item => (
                                    <tr key={item.code}
                                        className={`cursor-pointer hover:bg-muted ${articleCodes.includes(item.code) ? 'bg-primary/20' : ''}`}
                                        onClick={() => {
                                            const next = articleCodes.includes(item.code) ? articleCodes.filter(c => c !== item.code) : [...articleCodes, item.code];
                                            applyArticleCodes(next);
                                        }}
                                    >
                                        <td className="p-2 font-mono">{item.code}</td>
                                        <td className="p-2">{item.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Button onClick={() => setArticleModalOpen(false)} className="w-full">Listo</Button>
                </div>
            </Modal>

            {/* Warehouse Picker Modal - Simplified similar to Article Picker */}
            <Modal open={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} title="Seleccionar Bodega" contentClassName="max-w-3xl">
                <div className="space-y-4">
                    <Input placeholder="Buscar..." value={warehouseSearchTerm} onChange={e => setWarehouseSearchTerm(e.target.value)} autoFocus />
                    <div className="max-h-80 overflow-y-auto border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead><tr className="border-b"><th className="p-2">Cod</th><th className="p-2">Nombre</th></tr></thead>
                            <tbody>
                                {warehousePickerFiltered.map(item => (
                                    <tr key={item.code}
                                        className={`cursor-pointer hover:bg-muted ${warehouseCodes.includes(item.code) ? 'bg-primary/20' : ''}`}
                                        onClick={() => {
                                            const next = warehouseCodes.includes(item.code) ? warehouseCodes.filter(c => c !== item.code) : [...warehouseCodes, item.code];
                                            applyWarehouseCodes(next);
                                        }}
                                    >
                                        <td className="p-2 font-mono">{item.code}</td>
                                        <td className="p-2">{item.name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Button onClick={() => setWarehouseModalOpen(false)} className="w-full">Listo</Button>
                </div>
            </Modal>

            {/* Print Modal */}
            <Modal open={printModalOpen} onClose={() => setPrintModalOpen(false)} title="Vista Previa" contentClassName="max-w-5xl">
                {printUrl && <iframe src={printUrl} className="w-full h-[70vh] border rounded-xl" />}
            </Modal>
        </section>
    );
}
