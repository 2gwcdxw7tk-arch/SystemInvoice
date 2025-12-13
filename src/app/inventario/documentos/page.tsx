import { Suspense } from "react";
import { Metadata } from "next";

import { inventoryService } from "@/lib/services/InventoryService";
import { warehouseService } from "@/lib/services/WarehouseService";
import { DocumentsClient } from "@/components/inventario/documents-client";
import { InventoryDocumentListFilter } from "@/lib/types/inventory";

export const metadata: Metadata = {
  title: "Documentos de Inventario | Inventario",
  description: "Consulta de folios de compras, consumos y traspasos.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

function getTodayIso() {
  return new Date().toISOString().split("T")[0];
}

export default async function DocumentosPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // Default to today if no dates provided, OR if performing a search/folio lookup might want to relax?
  // User requirement was: "Define al menos un rango de fechas".
  // Let's default to today like the original client component.
  const from = (params.from as string) || getTodayIso();
  const to = (params.to as string) || getTodayIso();
  const search = (params.search as string) || "";
  const type = (params.type as string) || "";
  const warehouse = (params.warehouse as string) || "";

  // If a specific folio is requested via ?folio=..., we might want to ensure it's found even if outside date range?
  // But usually the list shows the filtered range. The detail modal fetches dependent on the ID regardless of list.
  // So we just fetch the list based on filters.

  const filter: InventoryDocumentListFilter = {
    from,
    to,
    search,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction_types: type ? [type as any] : undefined,
    warehouse_codes: warehouse ? [warehouse] : undefined,
    limit: 100, // Reasonable limit
  };

  const [documents, warehouses] = await Promise.all([
    inventoryService.listTransactionHeaders(filter),
    warehouseService.listWarehouses({ includeInactive: false }),
  ]);

  const warehouseOptions = warehouses.map(w => ({ code: w.code, name: w.name }));

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando documentos...</div>}>
      <div className="container mx-auto py-6">
        <DocumentsClient
          initialData={documents}
          warehouses={warehouseOptions}
        />
      </div>
    </Suspense>
  );
}
