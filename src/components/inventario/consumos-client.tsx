"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ConsumosDataTable } from "@/components/inventario/consumos-data-table";
import { ConsumptionFormModal } from "@/components/inventario/consumption-form-modal";
import { RecentInventoryTransactionBanner } from "@/components/inventory/recent-transaction-banner";
import type { ConsumptionMovementRow } from "@/lib/types/inventory";

interface WarehouseOption {
    code: string;
    name: string;
}

interface ConsumosClientProps {
    initialData: ConsumptionMovementRow[];
    warehouses: WarehouseOption[];
}

export function ConsumosClient({ initialData, warehouses }: ConsumosClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [modalOpen, setModalOpen] = useState(false);
    const [recentTransactionCode, setRecentTransactionCode] = useState<string | null>(null);

    const initialFilters = {
        article: searchParams.get("article") || "",
        from: searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined,
        to: searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined,
    };

    const handleSuccess = (transactionCode?: string) => {
        if (transactionCode) {
            setRecentTransactionCode(transactionCode);
        }
        router.refresh();
    };

    return (
        <div className="space-y-6">
            {recentTransactionCode && (
                <RecentInventoryTransactionBanner
                    code={recentTransactionCode}
                    message="Consulta el detalle del consumo o genera el formato imprimible desde aquí."
                    onDismiss={() => setRecentTransactionCode(null)}
                />
            )}

            <ConsumosDataTable
                data={initialData}
                onNewConsumption={() => setModalOpen(true)}
                initialFilters={initialFilters}
            />

            <ConsumptionFormModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                warehouses={warehouses}
            />
        </div>
    );
}
