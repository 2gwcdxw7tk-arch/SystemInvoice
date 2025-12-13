import { Suspense } from "react";
import { Metadata } from "next";

import { inventoryService } from "@/lib/services/InventoryService";
import { warehouseService } from "@/lib/services/WarehouseService";
import { TraspasosClient } from "@/components/inventario/traspasos-client";

export const metadata: Metadata = {
  title: "Traspasos | Inventario",
  description: "Movimientos entre almacenes.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

export default async function TraspasosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const article = typeof params.article === 'string' ? params.article : undefined;
  const fromWarehouse = typeof params.fromWarehouse === 'string' ? params.fromWarehouse : undefined;
  const toWarehouse = typeof params.toWarehouse === 'string' ? params.toWarehouse : undefined;

  const [transfers, warehouses] = await Promise.all([
    inventoryService.listTransfers({
      article,
      from_warehouse_code: fromWarehouse,
      to_warehouse_code: toWarehouse,
    }),
    warehouseService.listWarehouses()
  ]);

  // Map warehouses to simplified option format if needed, but the service returns suitable objects usually.
  const warehouseOptions = warehouses.map(w => ({ code: w.code, name: w.name }));

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando traspasos...</div>}>
      <div className="container mx-auto py-6">
        <TraspasosClient data={transfers} warehouses={warehouseOptions} />
      </div>
    </Suspense>
  );
}
