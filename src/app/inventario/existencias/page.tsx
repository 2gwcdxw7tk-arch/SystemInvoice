import { Suspense } from "react";
import { ExistenciasDataTable } from "@/components/inventario/existencias-data-table";
import { inventoryService } from "@/lib/services/InventoryService";
import { warehouseService } from "@/lib/services/WarehouseService";
import { ArticleService } from "@/lib/services/ArticleService";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Existencias | Inventario",
  description: "Consulta de existencias y movimientos de inventario",
};

// Instantiate ArticleService since it's not exported as a singleton
const articleService = new ArticleService();

export const dynamic = "force-dynamic";

export default async function ExistenciasPage() {
  // Fetch initial data
  // Note: We fetch all articles and warehouses for the pickers
  const [initialData, articles, warehouses] = await Promise.all([
    inventoryService.getStockSummary({}),
    articleService.getArticles({}),
    warehouseService.listWarehouses()
  ]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Existencias</h1>
          <p className="text-muted-foreground">
            Consulta el stock actual y movimientos de artículos por bodega.
          </p>
        </div>
      </div>

      <Suspense fallback={<div>Cargando existencias...</div>}>
        <ExistenciasDataTable
          initialData={initialData}
          articles={articles}
          warehouses={warehouses}
        />
      </Suspense>
    </div>
  );
}
