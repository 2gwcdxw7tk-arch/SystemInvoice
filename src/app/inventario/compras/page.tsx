import { Suspense } from "react";
import { Metadata } from "next";

import { inventoryService } from "@/lib/services/InventoryService";
import { PurchasesDataTable } from "@/components/inventario/purchases-data-table";
import type { PurchaseStatus } from "@/lib/types/inventory";

export const metadata: Metadata = {
  title: "Compras | Inventario",
  description: "Gestión de órdenes de compra y proveedores.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

export default async function ComprasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search : undefined;
  const status = typeof params.status === 'string' ? params.status as PurchaseStatus : undefined;

  const purchases = await inventoryService.listPurchases({
    supplier: search, // The Service search logic seems to map 'supplier' filter to 'contains'.
    status,
  });

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando compras...</div>}>
      <div className="container mx-auto py-6">
        <PurchasesDataTable data={purchases} />
      </div>
    </Suspense>
  );
}
