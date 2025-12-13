import { Suspense } from "react";
import { Metadata } from "next";

import { inventoryService } from "@/lib/services/InventoryService";
import { warehouseService } from "@/lib/services/WarehouseService";
import { ConsumosClient } from "@/components/inventario/consumos-client";
import { ConsumptionListFilter } from "@/lib/types/inventory";

export const metadata: Metadata = {
  title: "Registro de Consumos | Inventario",
  description: "Control de mermas y salidas de producción.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

function getTodayIso() {
  return new Date().toISOString().split("T")[0];
}

export default async function RegistroConsumosPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const from = (params.from as string) || getTodayIso();
  const to = (params.to as string) || getTodayIso();
  const article = (params.article as string) || "";

  const filter: ConsumptionListFilter = {
    from,
    to,
    article: article || undefined,
  };

  const [consumptions, warehouses] = await Promise.all([
    inventoryService.listConsumptions(filter),
    warehouseService.listWarehouses({ includeInactive: false }),
  ]);

  const warehouseOptions = warehouses.map(w => ({ code: w.code, name: w.name }));

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando consumos...</div>}>
      <div className="container mx-auto py-6">
        <ConsumosClient
          initialData={consumptions}
          warehouses={warehouseOptions}
        />
      </div>
    </Suspense>
  );
}
