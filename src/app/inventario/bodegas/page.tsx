import { Suspense } from "react";
import { Metadata } from "next";

import { warehouseService } from "@/lib/services/WarehouseService";
import { WarehousesDataTable } from "@/components/inventario/warehouses-data-table";

export const metadata: Metadata = {
  title: "Bodegas | Inventario",
  description: "Administración de bodegas y sucursales.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

export default async function WarehousesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const includeInactive = params.includeInactive === "true";

  const warehouses = await warehouseService.listWarehouses({ includeInactive });

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando bodegas...</div>}>
      <div className="container mx-auto py-6">
        <WarehousesDataTable data={warehouses} />
      </div>
    </Suspense>
  );
}
