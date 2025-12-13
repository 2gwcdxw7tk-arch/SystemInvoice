"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { KardexMovementRow } from "@/lib/types/inventory";

export interface KardexGroupEntry extends KardexMovementRow {
    delta_retail: number;
}

export interface KardexGroup {
    key: string;
    article_code: string;
    article_name: string;
    retail_unit: string | null;
    warehouse_code: string;
    warehouse_name: string;
    initial_balance: number;
    movements: KardexGroupEntry[];
}

interface KardexTableProps {
    groups: KardexGroup[];
    isPending: boolean;
}

const numberFormatter = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 4 });

const transactionTypeLabel: Record<string, string> = {
    PURCHASE: "Compra",
    CONSUMPTION: "Venta",
    ADJUSTMENT: "Ajuste",
    TRANSFER: "Traspaso",
};

function formatDateParts(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { day: iso, time: "" };
    return {
        day: date.toLocaleDateString("es-MX"),
        time: date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    };
}

function KardexGroupRow({ movement, retailUnit }: { movement: KardexGroupEntry; retailUnit: string | null }) {
    const parts = formatDateParts(movement.occurred_at || movement.created_at);
    const nature = movement.direction === "IN" ? "Entrada" : "Salida";
    const quantityLabel = `${movement.delta_retail >= 0 ? "+" : "-"}${numberFormatter.format(Math.abs(movement.delta_retail))}${retailUnit ? ` ${retailUnit}` : ""}`;
    const balanceLabel = `${numberFormatter.format(movement.balance_retail)}${retailUnit ? ` ${retailUnit}` : ""}`;

    return (
        <tr className="hover:bg-muted/20">
            <td className="px-3 py-3 whitespace-nowrap">
                <div className="font-medium text-foreground">{parts.day}</div>
                {parts.time && <div className="text-xs text-muted-foreground">{parts.time} hrs</div>}
            </td>
            <td className="px-3 py-3 whitespace-nowrap">
                <div className="font-medium text-foreground">{movement.warehouse_code}</div>
                <div className="text-xs text-muted-foreground">{movement.warehouse_name}</div>
            </td>
            <td className="px-3 py-3 whitespace-nowrap">
                {transactionTypeLabel[movement.transaction_type] ?? movement.transaction_type}
            </td>
            <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                {movement.reference ? (
                    <div className="font-medium text-foreground">{movement.reference}</div>
                ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                )}
                <div className="text-xs text-muted-foreground">Folio: {movement.transaction_code}</div>
            </td>
            <td className="px-3 py-3 whitespace-nowrap">
                <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${movement.direction === "IN" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                        }`}
                >
                    {nature}
                </span>
            </td>
            <td
                className={`px-3 py-3 text-right font-semibold ${movement.delta_retail >= 0 ? "text-emerald-600" : "text-destructive"
                    }`}
            >
                {quantityLabel}
            </td>
            <td className="px-3 py-3 text-right font-semibold text-foreground">{balanceLabel}</td>
        </tr>
    );
}

function KardexGroupCard({ group }: { group: KardexGroup }) {
    const saldoInicial = numberFormatter.format(group.initial_balance);
    const saldoFinal = numberFormatter.format(group.movements.at(-1)?.balance_retail ?? group.initial_balance);

    return (
        <div className="space-y-4">
            {/* Header Group */}
            <div className="flex flex-col gap-2 border-l-4 border-primary pl-4">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">
                            {group.article_code} • {group.article_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Almacén {group.warehouse_code} • {group.warehouse_name}
                        </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        <span className="mr-4">
                            Saldo inicial:{" "}
                            <span className="font-semibold text-foreground">
                                {saldoInicial}
                                {group.retail_unit ? ` ${group.retail_unit}` : ""}
                            </span>
                        </span>
                        <span>
                            Saldo final:{" "}
                            <span className="font-semibold text-foreground">
                                {saldoFinal}
                                {group.retail_unit ? ` ${group.retail_unit}` : ""}
                            </span>
                        </span>
                    </div>
                </div>
            </div>
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full table-auto text-left text-sm text-foreground">
                    <thead className="border-b text-xs uppercase text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 whitespace-nowrap">Fecha</th>
                            <th className="px-3 py-2 whitespace-nowrap">Bodega</th>
                            <th className="px-3 py-2 whitespace-nowrap">Tipo</th>
                            <th className="px-3 py-2 whitespace-nowrap">Documento</th>
                            <th className="px-3 py-2 whitespace-nowrap">Naturaleza</th>
                            <th className="px-3 py-2 whitespace-nowrap text-right">Cantidad</th>
                            <th className="px-3 py-2 whitespace-nowrap text-right">Saldo cantidad</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr className="bg-muted/30">
                            <td colSpan={7} className="px-3 py-3 text-sm font-medium text-muted-foreground">
                                Saldo inicial al periodo: {saldoInicial}
                                {group.retail_unit ? ` ${group.retail_unit}` : ""}
                            </td>
                        </tr>
                        {group.movements.map((movement) => (
                            <KardexGroupRow key={movement.id} movement={movement} retailUnit={group.retail_unit} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function KardexTable({ groups, isPending }: KardexTableProps) {
    const totalMovements = groups.reduce((sum, group) => sum + group.movements.length, 0);

    return (
        <Card className="rounded-3xl border bg-background/95 shadow-sm">
            <CardHeader>
                <CardTitle className="text-xl font-semibold">Movimientos recientes</CardTitle>
                <CardDescription>
                    {isPending ? "Consultando información..." : `Total de movimientos: ${totalMovements}`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No hay movimientos que coincidan con los filtros seleccionados.
                    </p>
                ) : (
                    <div className="space-y-10">
                        {groups.map((group) => (
                            <KardexGroupCard key={group.key} group={group} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
