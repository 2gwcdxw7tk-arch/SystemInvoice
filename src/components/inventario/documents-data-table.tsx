"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, Filter, Search } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DatePicker } from "@/components/ui/date-picker";
import type { InventoryTransactionHeader } from "@/lib/types/inventory";
import { formatCurrency } from "@/config/currency";

interface WarehouseOption {
    code: string;
    name: string;
}

interface DocumentsDataTableProps {
    data: InventoryTransactionHeader[];
    warehouses: WarehouseOption[];
    onRowClick: (transactionCode: string) => void;
    initialFilters: {
        search: string;
        type: string;
        warehouse: string;
        from?: Date;
        to?: Date;
    };
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
    PURCHASE: "Compra",
    CONSUMPTION: "Consumo",
    TRANSFER: "Traspaso",
    ADJUSTMENT: "Ajuste",
};

function formatDateParts(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
    return {
        day: date.toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    };
}

export function DocumentsDataTable({ data, warehouses, onRowClick, initialFilters }: DocumentsDataTableProps) {
    const router = useRouter();
    const pathname = usePathname();

    // Local state for filters
    // Use string state for DatePicker (YYYY-MM-DD)
    const [search, setSearch] = useState(initialFilters.search);
    const [type, setType] = useState(initialFilters.type);
    const [warehouse, setWarehouse] = useState(initialFilters.warehouse);
    const [from, setFrom] = useState<string>(initialFilters.from ? initialFilters.from.toISOString().split('T')[0] : "");
    const [to, setTo] = useState<string>(initialFilters.to ? initialFilters.to.toISOString().split('T')[0] : "");

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (type) params.set("type", type);
        if (warehouse) params.set("warehouse", warehouse);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const handleClear = () => {
        setSearch("");
        setType("");
        setWarehouse("");
        setFrom("");
        setTo("");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(pathname as any);
    };

    const columns: ColumnDef<InventoryTransactionHeader>[] = [
        {
            accessorKey: "transaction_code",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Folio" />,
            cell: ({ row }) => (
                <button
                    type="button"
                    onClick={() => onRowClick(row.original.transaction_code)}
                    className="flex flex-col items-start text-left hover:underline group"
                >
                    <span className="font-semibold text-primary group-hover:text-primary/80">{row.original.transaction_code}</span>
                    <span className="text-xs text-muted-foreground">{row.original.status}</span>
                </button>
            )
        },
        {
            accessorKey: "transaction_type",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Tipo" />,
            cell: ({ row }) => {
                const type = row.original.transaction_type;
                const label = TRANSACTION_TYPE_LABELS[type] || type;
                return (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                        {label}
                    </span>
                );
            }
        },
        {
            accessorKey: "occurred_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
            cell: ({ row }) => {
                const parts = formatDateParts(row.original.occurred_at);
                return (
                    <div className="flex flex-col">
                        <span>{parts.day}</span>
                        <span className="text-xs text-muted-foreground">{parts.time}</span>
                    </div>
                );
            }
        },
        {
            accessorKey: "warehouse_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Almacén" />,
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="font-medium">{row.original.warehouse_name}</span>
                    <span className="text-xs text-muted-foreground">{row.original.warehouse_code}</span>
                </div>
            )
        },
        {
            accessorKey: "reference",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Referencia" />,
            cell: ({ row }) => (
                <div className="flex flex-col max-w-[150px]">
                    <span className="truncate font-medium" title={row.original.reference || ""}>{row.original.reference || "Sin ref"}</span>
                    <span className="truncate text-xs text-muted-foreground" title={row.original.counterparty_name || ""}>{row.original.counterparty_name || "—"}</span>
                </div>
            )
        },
        {
            accessorKey: "entries_count",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Movs" />,
            cell: ({ row }) => (
                <div className="text-xs">
                    <p><span className="font-semibold">{row.original.entries_in}</span> Ent</p>
                    <p><span className="font-semibold">{row.original.entries_out}</span> Sal</p>
                </div>
            )
        },
        {
            accessorKey: "total_amount",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
            cell: ({ row }) => <span className="font-semibold">{row.original.total_amount != null ? formatCurrency(row.original.total_amount) : "—"}</span>
        }
    ];

    return (
        <section className="space-y-8 pb-16">
            <header className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                        <Button type="button" variant="outline" size="sm" className="w-fit rounded-2xl px-3" asChild>
                            <Link href="/inventario" aria-label="Volver al menú de inventario">
                                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <ArrowLeft className="h-4 w-4" />
                                    Volver
                                </span>
                            </Link>
                        </Button>
                        <div className="space-y-2">
                            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Documentos de inventario</h1>
                            <p className="text-sm text-muted-foreground">Consulta el historial completo de movimientos, busca folios y revisa detalles.</p>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                        <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Folio, referencia o proveedor"
                            className="rounded-2xl"
                        />
                    </div>
                    <div className="flex min-w-[160px] flex-col gap-1">
                        <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="h-10 rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <option value="">Todos</option>
                            <option value="PURCHASE">Compras</option>
                            <option value="CONSUMPTION">Consumos</option>
                            <option value="TRANSFER">Traspasos</option>
                            <option value="ADJUSTMENT">Ajustes</option>
                        </select>
                    </div>
                    <div className="flex min-w-[180px] flex-col gap-1">
                        <Label className="text-xs uppercase text-muted-foreground">Almacén</Label>
                        <select
                            value={warehouse}
                            onChange={(e) => setWarehouse(e.target.value)}
                            className="h-10 rounded-2xl border border-muted bg-background/90 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            <option value="">Todos</option>
                            {warehouses.map(w => <option key={w.code} value={w.code}>{w.name}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-1 gap-2 min-w-[280px]">
                        <div className="flex-1 flex-col gap-1">
                            <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
                            <DatePicker value={from} onChange={setFrom} className="rounded-2xl w-full" />
                        </div>
                        <div className="flex-1 flex-col gap-1">
                            <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
                            <DatePicker value={to} onChange={setTo} className="rounded-2xl w-full" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleSearch} className="h-10 rounded-2xl px-4">
                            <Search className="mr-2 h-4 w-4" /> Buscar
                        </Button>
                        <Button onClick={handleClear} variant="outline" className="h-10 rounded-2xl px-4">
                            Limpiar
                        </Button>
                    </div>
                </div>
            </header>

            <Card className="rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl font-semibold">Foliador</CardTitle>
                    <CardDescription>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Filter className="h-4 w-4" />
                            Mostrando {data.length} registros
                        </span>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={data}
                    />
                </CardContent>
            </Card>
        </section>
    );
}
