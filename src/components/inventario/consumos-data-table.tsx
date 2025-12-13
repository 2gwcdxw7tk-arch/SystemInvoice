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
import type { ConsumptionMovementRow } from "@/lib/types/inventory";

interface ConsumosDataTableProps {
    data: ConsumptionMovementRow[];
    onNewConsumption: () => void;
    initialFilters: {
        article: string;
        from?: Date;
        to?: Date;
    };
}

function formatDateParts(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
    return {
        day: date.toLocaleDateString("es-MX", { day: '2-digit', month: 'short', year: 'numeric' }),
        time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    };
}

export function ConsumosDataTable({ data, onNewConsumption, initialFilters }: ConsumosDataTableProps) {
    const router = useRouter();
    const pathname = usePathname();

    // Local state for filters
    const [article, setArticle] = useState(initialFilters.article);
    const [from, setFrom] = useState<string>(initialFilters.from ? initialFilters.from.toISOString().split('T')[0] : "");
    const [to, setTo] = useState<string>(initialFilters.to ? initialFilters.to.toISOString().split('T')[0] : "");

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (article) params.set("article", article);
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const handleClear = () => {
        setArticle("");
        setFrom("");
        setTo("");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(pathname as any);
    };

    const quantityFormatter = new Intl.NumberFormat("es-MX", {
        maximumFractionDigits: 3,
        minimumFractionDigits: 0,
    });

    const columns: ColumnDef<ConsumptionMovementRow>[] = [
        {
            accessorKey: "occurred_at",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Fecha" />,
            cell: ({ row }) => {
                const parts = formatDateParts(row.original.occurred_at);
                return (
                    <div className="flex flex-col">
                        <span className="font-medium">{parts.day}</span>
                        <span className="text-xs text-muted-foreground">{parts.time} hrs</span>
                    </div>
                );
            }
        },
        {
            accessorKey: "article_name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Artículo" />,
            cell: ({ row }) => (
                <div className="flex flex-col max-w-[250px]">
                    <span className="truncate font-semibold text-foreground" title={row.original.article_name}>{row.original.article_name}</span>
                    <span className="text-xs text-muted-foreground">Código {row.original.article_code}</span>
                    {row.original.source_kit_code && (
                        <div className="text-xs text-muted-foreground">Derivado del kit {row.original.source_kit_code}</div>
                    )}
                </div>
            )
        },
        {
            accessorKey: "reason",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Motivo" />,
            cell: ({ row }) => (
                <div className="font-medium text-foreground">{row.original.reason || "Sin motivo registrado"}</div>
            )
        },
        {
            accessorKey: "quantity_retail",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Cantidad" />,
            cell: ({ row }) => {
                const retailLabel = row.original.retail_unit || "Unidad detalle";
                const storageLabel = row.original.storage_unit || "Unidad almacén";
                return (
                    <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                            {quantityFormatter.format(row.original.quantity_retail)} {retailLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {quantityFormatter.format(row.original.quantity_storage)} {storageLabel}
                        </span>
                    </div>
                );
            }
        },
        {
            accessorKey: "area",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Área" />,
            cell: ({ row }) => (
                <span className="text-sm text-foreground">{row.original.area || "No especificada"}</span>
            )
        },
        {
            accessorKey: "authorized_by",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Autorizó" />,
            cell: ({ row }) => (
                <span className="text-sm text-foreground">{row.original.authorized_by || "No registrado"}</span>
            )
        }
    ];

    return (
        <section className="space-y-8 pb-16">
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
                            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Registro de consumos</h1>
                            <p className="text-sm text-muted-foreground">
                                Controla mermas y salidas de producción registrando consumos por artículo y almacén.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-start gap-2">
                        <Button
                            type="button"
                            onClick={onNewConsumption}
                            className="h-11 rounded-2xl bg-primary px-4 font-semibold text-primary-foreground"
                        >
                            + Nuevo consumo
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                        <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
                        <Input
                            value={article}
                            onChange={(e) => setArticle(e.target.value)}
                            placeholder="Código o nombre"
                            className="rounded-2xl"
                        />
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
                    <CardTitle className="text-xl font-semibold">Historial de consumos</CardTitle>
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
