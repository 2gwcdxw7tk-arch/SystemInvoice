"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
// Removed date-fns imports

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
// Removed Badge import, using span

import type { PurchaseListItem } from "@/lib/types/inventory";

interface PurchasesDataTableProps {
    data: PurchaseListItem[];
}

const formatCurrency = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

function getStatusBadgeClass(status: string) {
    switch (status) {
        case "RECIBIDA": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
        case "APROBADA": return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300";
        case "ENVIADA": return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
        default: return "bg-muted text-muted-foreground";
    }
}

export function PurchasesDataTable({ data }: PurchasesDataTableProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Local state for inputs to avoid stuttering on every keystroke
    const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");

    const handleSearch = (term: string) => {
        setSearchTerm(term);
        // Debounce could be added here
        const params = new URLSearchParams(searchParams);
        if (term) params.set("search", term);
        else params.delete("search");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const handleStatusFilter = (status: string) => {
        setStatusFilter(status);
        const params = new URLSearchParams(searchParams);
        if (status) params.set("status", status);
        else params.delete("status");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const columns: ColumnDef<PurchaseListItem>[] = [
        {
            accessorKey: "transaction_code",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Orden" />,
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.document_number || row.original.transaction_code}</span>,
        },
        {
            accessorKey: "supplier_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />,
            cell: ({ row }) => <span className="font-medium">{row.original.supplier_name || "Sin proveedor"}</span>,
        },
        {
            accessorKey: "occurred_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
            cell: ({ row }) => {
                const date = new Date(row.original.occurred_at);
                // Native formatting
                const dateStr = isNaN(date.getTime()) ? row.original.occurred_at : date.toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' });
                return (
                    <span className="text-muted-foreground capitalize">
                        {dateStr}
                    </span>
                );
            },
        },
        {
            accessorKey: "total_amount",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
            cell: ({ row }) => (
                <span className="font-semibold text-right block">
                    {formatCurrency.format(row.original.total_amount)}
                </span>
            ),
        },
        {
            accessorKey: "status",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
            cell: ({ row }) => {
                const status = row.original.status;
                const className = getStatusBadgeClass(status);
                return (
                    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${className}`}>
                        {status.toLowerCase()}
                    </span>
                );
            },
        },
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
                            <h1 className="text-3xl font-semibold tracking-tight">Compras</h1>
                            <p className="text-sm text-muted-foreground">Gestiona la planificación y seguimiento de órdenes a proveedores.</p>
                        </div>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 sm:grid-cols-2">
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Buscar</Label>
                        <Input
                            value={searchTerm}
                            onChange={(e) => handleSearch(e.target.value)}
                            placeholder="Orden o proveedor"
                            className="rounded-2xl"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
                        <select
                            value={statusFilter}
                            onChange={(e) => handleStatusFilter(e.target.value)}
                            className="h-10 w-full rounded-2xl border border-muted bg-background/90 px-3 text-sm"
                        >
                            <option value="">Todos</option>
                            <option value="BORRADOR">Borrador</option>
                            <option value="ENVIADA">Enviada</option>
                            <option value="APROBADA">Aprobada</option>
                            <option value="RECIBIDA">Recibida</option>
                        </select>
                    </div>
                </div>
            </header>

            <Card className="rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl font-semibold">Órdenes de compra</CardTitle>
                    <CardDescription>Mostrando {data.length} órdenes registradas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={data} />
                </CardContent>
            </Card>
        </section>
    );
}
