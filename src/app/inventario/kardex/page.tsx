
import { Suspense } from "react";
import { Metadata } from "next";

import { inventoryService } from "@/lib/services/InventoryService";
import { ArticleService } from "@/lib/services/ArticleService";
import { warehouseService } from "@/lib/services/WarehouseService";
import { KardexClient } from "@/components/inventario/kardex-client";

// Instantiate services
const articleService = new ArticleService();

export const metadata: Metadata = {
  title: "Kardex | Inventario",
  description: "Consulta de movimientos de inventario por artículo y bodega.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export const dynamic = "force-dynamic";

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year} -${month} -${day} `;
}

export default async function KardexPage({ searchParams }: PageProps) {
  // Await searchParams in Next.js 15+ (or Treat as promise for future compat)
  // Current environment seems to be Next.js 14 based on previous files, but awaiting is safe or required depending on version.
  // We'll await it to be safe if it's a promise, or just access it. 
  // In Next.js 15 searchParams is a promise. In 14 it's an object. 
  // The interface I defined above 'Promise<...>' suggests I treat it as async.

  const params = await searchParams; // Wait for params

  const from = (Array.isArray(params.from) ? params.from[0] : params.from) || getTodayIsoDate();
  const to = (Array.isArray(params.to) ? params.to[0] : params.to) || getTodayIsoDate();

  // Normalize array params
  const article = params.article;
  const articles = Array.isArray(article) ? article : article ? [article] : undefined;

  const warehouse = params.warehouse_code;
  const warehouse_codes = Array.isArray(warehouse) ? warehouse : warehouse ? [warehouse] : undefined;

  // Fetch Data
  const [initialMovements, articleList, warehouseList] = await Promise.all([
    inventoryService.listKardex({
      from,
      to,
      articles,
      warehouse_codes
    }),
    articleService.getArticles({}), // Fetch basics for picker
    warehouseService.listWarehouses()
  ]);

  return (
    <Suspense fallback={<div className="container mx-auto py-10">Cargando kardex...</div>}>
      <div className="container mx-auto py-6">
        <KardexClient
          initialMovements={initialMovements}
          articles={articleList}
          warehouses={warehouseList}
        />
      </div>
    </Suspense>
  );
}
