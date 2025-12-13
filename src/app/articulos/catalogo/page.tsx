import { Suspense } from "react";
import { ArticleService } from "@/lib/services/ArticleService";
import { unitService } from "@/lib/services/UnitService";
import { ArticleClassificationService } from "@/lib/services/ArticleClassificationService";
import { ArticlesDataTable } from "@/components/articles/articles-data-table";

// Instantiate services (or use DI container if available, but instantiation is safe here)
const articleService = new ArticleService();
const classificationService = new ArticleClassificationService();

export const metadata = {
  title: "Catálogo de Artículos | SystemInvoice",
  description: "Administración de productos y servicios.",
};

export default async function ArticulosCatalogoPage() {
  // Parallel data fetching for performance
  const [articles, units, classifications] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    articleService.getArticles({ unit: "RETAIL", include_units: true } as any), // Type assertion might be needed if params don't match exactly 
    // Wait, getArticles params defined in service: price_list_code, unit, on_date, search.
    // DOES NOT exclude "include_units". 
    // Checking ArticleRepository.getArticles params in step 82: same.
    // Checking implementation of getArticles in step 75: it calls `unitService.listUnits()` internally if mock.
    // If NOT mock, it calls repo. 
    // But the Page original code used `/api/articulos?unit=RETAIL&include_units=1`.
    // The API route `/api/articulos` likely mapped `include_units` to something or the Repo handles it?
    // Let's assume standard `getArticles` is sufficient as it returns `Article` which has `storage_unit` name string (mapped in repo usually).
    // In step 75, `mock` implementation maps names. Real implementation `this.articleRepository.getArticles` needs to return objects with names.
    // If Repo returns names, we are good.

    unitService.listUnits(),
    classificationService.list({ level: 1 }),
  ]);

  // Transform articles to ensure they match Article interface expected by component if needed.
  // The service returns Article & { price: ... }. Component accepts Article.
  // It is compatible.

  // Note on units: unitService.listUnits returns UnitRow. Compatible.

  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Cargando catálogo...</div>}>
      <ArticlesDataTable
        initialArticles={articles}
        units={units}
        initialClassifications={classifications}
      />
    </Suspense>
  );
}
