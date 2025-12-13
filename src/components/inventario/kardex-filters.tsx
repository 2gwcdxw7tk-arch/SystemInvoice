"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export interface KardexFiltersProps {
    // Article filter state
    articleInputValue: string;
    onArticleInputChange: (value: string) => void;
    onArticleInputDoubleClick: () => void;

    // Warehouse filter state
    warehouseInputValue: string;
    onWarehouseInputChange: (value: string) => void;
    onWarehouseInputDoubleClick: () => void;

    // Date filter state
    fromDate: string;
    onFromDateChange: (date: string) => void;
    toDate: string;
    onToDateChange: (date: string) => void;

    // Actions
    onApplyFilters: () => void;
    onClearFilters: () => void;
    onPrintClick: () => void;

    // Loading state
    isPending: boolean;
}

export function KardexFilters({
    articleInputValue,
    onArticleInputChange,
    onArticleInputDoubleClick,
    warehouseInputValue,
    onWarehouseInputChange,
    onWarehouseInputDoubleClick,
    fromDate,
    onFromDateChange,
    toDate,
    onToDateChange,
    onApplyFilters,
    onClearFilters,
    onPrintClick,
    isPending,
}: KardexFiltersProps) {
    return (
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
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Kardex</h1>
                        <p className="text-sm text-muted-foreground">
                            Consulta los movimientos de entrada y salida por artículo y valida el saldo acumulado.
                        </p>
                    </div>
                </div>
                <div className="flex items-start gap-2">
                    <Button type="button" variant="outline" onClick={onPrintClick} className="h-11 rounded-2xl px-4">
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                    </Button>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-6">
                <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs uppercase text-muted-foreground">Artículo</Label>
                    <Input
                        value={articleInputValue}
                        onChange={(event) => onArticleInputChange(event.target.value)}
                        onDoubleClick={onArticleInputDoubleClick}
                        placeholder="Código(s) de artículo"
                        className="rounded-2xl"
                        title="Doble clic para abrir el catálogo"
                    />
                    <p className="text-xs text-muted-foreground">Deja vacío para incluir todos. Doble clic abre catálogo.</p>
                </div>
                <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">Desde</Label>
                    <DatePicker value={fromDate} onChange={onFromDateChange} className="rounded-2xl" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">Hasta</Label>
                    <DatePicker value={toDate} onChange={onToDateChange} className="rounded-2xl" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">Bodega</Label>
                    <Input
                        value={warehouseInputValue}
                        onChange={(event) => onWarehouseInputChange(event.target.value)}
                        onDoubleClick={onWarehouseInputDoubleClick}
                        placeholder="Código(s) de bodega"
                        className="rounded-2xl"
                        title="Doble clic para abrir el catálogo"
                    />
                    <p className="text-xs text-muted-foreground">Deja vacío para incluir todas.</p>
                </div>
                <div className="flex h-full items-end justify-end gap-2 md:col-span-1">
                    <Button type="button" onClick={onApplyFilters} disabled={isPending} className="h-10 rounded-2xl px-4">
                        {isPending ? "Cargando..." : "Buscar"}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClearFilters}
                        className="h-10 rounded-2xl px-4"
                    >
                        Limpiar
                    </Button>
                </div>
            </div>
        </header>
    );
}
