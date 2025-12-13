"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DocumentsDataTable } from "@/components/inventario/documents-data-table";
import { DocumentDetailModal } from "@/components/inventario/document-detail-modal";
import type { InventoryTransactionHeader } from "@/lib/types/inventory";

interface WarehouseOption {
    code: string;
    name: string;
}

interface DocumentsClientProps {
    initialData: InventoryTransactionHeader[];
    warehouses: WarehouseOption[];
}

export function DocumentsClient({ initialData, warehouses }: DocumentsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Filters state derived from URL
    const filters = {
        search: searchParams.get("search") || "",
        type: searchParams.get("type") || "",
        warehouse: searchParams.get("warehouse") || "",
        from: searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined,
        to: searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined,
    };

    // Modal state
    const [detailOpen, setDetailOpen] = useState(false);
    const [activeFolio, setActiveFolio] = useState<string | null>(null);

    // Sync modal state with URL param 'folio'
    useEffect(() => {
        const folio = searchParams.get("folio");
        if (folio) {
            setActiveFolio(folio);
            setDetailOpen(true);
        } else {
            setDetailOpen(false);
            setActiveFolio(null);
        }
    }, [searchParams]);

    const handleRowClick = (transactionCode: string) => {
        // Update URL to include folio, allowing sharing/refreshing
        const params = new URLSearchParams(searchParams);
        params.set("folio", transactionCode);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`${pathname}?${params.toString()}` as any, { scroll: false });
    };

    const handleCloseModal = () => {
        const params = new URLSearchParams(searchParams);
        params.delete("folio");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push(`${pathname}?${params.toString()}` as any, { scroll: false });
    };

    return (
        <>
            <DocumentsDataTable
                data={initialData}
                warehouses={warehouses}
                onRowClick={handleRowClick}
                initialFilters={filters}
            />
            <DocumentDetailModal
                transactionCode={activeFolio}
                open={detailOpen}
                onClose={handleCloseModal}
            />
        </>
    );
}
