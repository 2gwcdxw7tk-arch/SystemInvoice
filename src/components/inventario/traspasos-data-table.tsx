"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft, Plus, ArrowRightLeft } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import type { TransferListItem } from "@/lib/types/inventory";

interface WarehouseOption {
    code: string;
    name: string;
}

interface TransfersDataTableProps {
    data: TransferListItem[];
    warehouses: WarehouseOption[];
    onCreateClick: () => void;
}

function formatDateParts(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
    // Native replacement for date-fns format if needed, but we can usage simple logic
    return {
        day: date.toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    };
}

export function TransfersDataTable({ data, warehouses, onCreateClick }: TransfersDataTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Local state
    const [articleFilter, setArticleFilter] = useState(searchParams.get("article") || "");
    const [fromWarehouseFilter, setFromWarehouseFilter] = useState(searchParams.get("fromWarehouse") || "");
    const [toWarehouseFilter, setToWarehouseFilter] = useState(searchParams.get("toWarehouse") || "");

    const updateFilters = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value) params.set(key, value);
        else params.delete(key);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const handleClear = () => {
        setArticleFilter("");
        setFromWarehouseFilter("");
        setToWarehouseFilter("");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(pathname as any);
    };

    const columns: ColumnDef<TransferListItem>[] = [
        {
            accessorKey: "occurred_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
            cell: ({ row }) => {
                const parts = formatDateParts(row.original.occurred_at);
                return (
                    <div className="flex flex-col">
                        <span className="font-medium capitalize">{parts.day}</span>
                        <span className="text-xs text-muted-foreground">{parts.time}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: "transaction_code",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Folio" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium">{row.original.transaction_code}</span>
                    <span className="text-xs text-muted-foreground">{row.original.lines_count} líneas</span>
                </div>
            ),
        },
        {
            accessorKey: "from_warehouse_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Origen" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{row.original.from_warehouse_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{row.original.from_warehouse_code}</span>
                </div>
            ),
        },
        {
            accessorKey: "to_warehouse_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Destino" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium">{row.original.to_warehouse_name}</span>
                    <span className="text-xs text-muted-foreground">{row.original.to_warehouse_code}</span>
                </div>
            ),
        },
        {
            accessorKey: "authorized_by",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Autorizó" />,
        },
        {
            accessorKey: "notes",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Notas" />,
            cell: ({ row }) => <span className="text-muted-foreground italic truncate max-w-[200px] block">{row.original.notes || "—"}</span>
        }
    ];

    return (
        <section className="space-y-10 pb-16">
            <header className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
                            <Link href="/inventario" aria-label="Volver al menú principal de inventario">
                                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <ArrowLeft className="h-4 w-4" />
                                    Volver al menú
                                </span>
                            </Link>
                        </Button>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight">Traspasos entre almacenes</h1>
                            <p className="text-sm text-muted-foreground">
                                Registra y consulta movimientos de traslado, manteniendo folio, autorización y detalle de líneas.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Button onClick={onCreateClick} className="h-11 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground">
                            <Plus className="mr-2 h-4 w-4" />
                            Registrar traspaso
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 items-end">
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
                        <Input
                            value={articleFilter}
                            onChange={(e) => {
                                setArticleFilter(e.target.value);
                                updateFilters("article", e.target.value);
                            }}
                            placeholder="Código o nombre"
                            className="rounded-2xl"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Origen</Label>
                        <select
                            value={fromWarehouseFilter}
                            onChange={(e) => {
                                setFromWarehouseFilter(e.target.value);
                                updateFilters("fromWarehouse", e.target.value);
                            }}
                            className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <option value="">Todos</option>
                            {warehouses.map(w => <option key={w.code} value={w.code}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Destino</Label>
                        <select
                            value={toWarehouseFilter}
                            onChange={(e) => {
                                setToWarehouseFilter(e.target.value);
                                updateFilters("toWarehouse", e.target.value);
                            }}
                            className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <option value="">Todos</option>
                            {warehouses.map(w => <option key={w.code} value={w.code}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleClear} variant="outline" className="rounded-2xl">
                            Limpiar
                        </Button>
                    </div>
                </div>
            </header>

            <Card className="rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl font-semibold">Historial de traspasos</CardTitle>
                    <CardDescription>Mostrando {data.length} registros.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data} />
                </CardContent>
            </Card>
        </section>
    );
}
