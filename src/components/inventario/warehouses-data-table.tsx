"use client";

import { useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/ui/data-table";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { useToast } from "@/components/ui/toast-provider";
import { WarehouseForm } from "@/components/inventario/warehouse-form";
import type { WarehouseRecord } from "@/lib/services/WarehouseService";

interface WarehousesDataTableProps {
    data: WarehouseRecord[];
}

export function WarehousesDataTable({ data }: WarehousesDataTableProps) {
    const router = useRouter();
    const { toast } = useToast();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Local filters
    const [searchTerm, setSearchTerm] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<WarehouseRecord | null>(null);

    // URL State for includeInactive
    const includeInactive = searchParams.get("includeInactive") === "true";

    const filteredData = data.filter(item => {
        const term = searchTerm.toLowerCase();
        return item.code.toLowerCase().includes(term) || item.name.toLowerCase().includes(term);
    });

    const handleToggleIncludeInactive = (checked: boolean) => {
        const params = new URLSearchParams(searchParams);
        if (checked) params.set("includeInactive", "true");
        else params.delete("includeInactive");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.replace(`${pathname}?${params.toString()}` as any);
    };

    const handleCreate = () => {
        setEditingItem(null);
        setModalOpen(true);
    };

    const handleEdit = (item: WarehouseRecord) => {
        setEditingItem(item);
        setModalOpen(true);
    };

    const handleToggleStatus = async (item: WarehouseRecord) => {
        try {
            const response = await fetch(`/api/inventario/warehouses/${encodeURIComponent(item.code)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: !item.isActive }),
            });
            if (!response.ok) throw new Error("Error al cambiar estado");
            toast({ variant: "success", title: "Bodegas", description: `Bodega ${item.isActive ? 'desactivada' : 'activada'}` });
            router.refresh();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_err) {
            toast({ variant: "error", title: "Error", description: "No se pudo cambiar el estado de la bodega" });
        }
    };

    const columns: ColumnDef<WarehouseRecord>[] = [
        {
            accessorKey: "code",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Código" />,
            cell: ({ row }) => <span className="font-mono text-xs font-semibold">{row.original.code}</span>
        },
        {
            accessorKey: "name",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Nombre" />,
        },
        {
            accessorKey: "isActive",
            header: ({ column }) => <DataTableColumnHeader column={column} title="Estado" />,
            cell: ({ row }) => (
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${row.original.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {row.original.isActive ? "Activa" : "Inactiva"}
                </span>
            )
        },
        {
            id: "actions",
            cell: ({ row }) => {
                const item = row.original;
                return (
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="h-8 rounded-xl px-3 text-xs" onClick={() => handleEdit(item)}>
                            Editar
                        </Button>
                        <Button
                            size="sm"
                            variant={item.isActive ? "destructive" : "secondary"}
                            className="h-8 rounded-xl px-3 text-xs"
                            onClick={() => void handleToggleStatus(item)}
                        >
                            {item.isActive ? "Desactivar" : "Activar"}
                        </Button>
                    </div>
                );
            }
        }
    ];

    return (
        <section className="space-y-10 pb-16">
            <header className="space-y-2">
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
                            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Bodegas</h1>
                            <p className="max-w-2xl text-sm text-muted-foreground">
                                Administra el catálogo de bodegas para inventarios, cajas y traspasos.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button onClick={handleCreate} className="rounded-2xl">
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva bodega
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                        <Label className="text-xs uppercase text-muted-foreground" htmlFor="warehouse-search">
                            Buscar
                        </Label>
                        <Input
                            id="warehouse-search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Código o nombre"
                            className="w-full rounded-2xl md:w-72"
                        />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={includeInactive}
                            onChange={(e) => handleToggleIncludeInactive(e.target.checked)}
                            className="h-4 w-4 rounded border-muted bg-background"
                        />
                        Mostrar inactivas
                    </label>
                </div>
            </header>

            <Card className="rounded-3xl border bg-background/95 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-xl font-semibold">Catálogo de bodegas</CardTitle>
                    <CardDescription>
                        Total: {filteredData.length} bodegas visibles
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={filteredData} />
                </CardContent>
            </Card>

            <WarehouseForm
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={() => { router.refresh(); }}
                initialData={editingItem}
            />
        </section>
    );
}
