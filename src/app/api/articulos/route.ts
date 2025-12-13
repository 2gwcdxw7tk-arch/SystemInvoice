import { NextRequest, NextResponse } from "next/server";
import { requireAdministrator, requireSession } from "@/lib/auth/access";
import { ArticleService } from "@/lib/services/ArticleService";
import { ArticleRepository } from "@/lib/repositories/ArticleRepository";
import { unitService } from "@/lib/services/UnitService";
import { inventoryService } from "@/lib/services/InventoryService";
import { articleInputSchema } from "@/lib/schemas/articles";
import { handleApiError, zodErrorResponse, createdResponse, successResponse } from "@/lib/api";
import { notFoundError } from "@/lib/errors";

const articleService = new ArticleService(new ArticleRepository());

export async function GET(request: NextRequest) {
  const sessionResult = await requireSession(request);
  if ("response" in sessionResult) return sessionResult.response;

  const { searchParams } = new URL(request.url);
  const article_code = searchParams.get("article_code");
  const price_list_code = searchParams.get("price_list_code") || undefined;
  const unit = (searchParams.get("unit") as "RETAIL" | "STORAGE" | null) || undefined;
  const on_date = searchParams.get("on_date") || undefined;
  const include_units = searchParams.get("include_units") === "1";
  const search = searchParams.get("search") || undefined;
  const warehouse_code = searchParams.get("warehouse_code")?.trim()?.toUpperCase() || undefined;

  try {
    // Single article lookup
    if (article_code) {
      const item = await articleService.getArticleByCode(article_code);
      if (!item) {
        throw notFoundError("Artículo");
      }
      return successResponse({ item });
    }

    // List articles
    const data = await articleService.getArticles({ price_list_code, unit, on_date, search });

    // Optional stock lookup
    let stockMap: Record<string, number> | undefined;
    if (warehouse_code) {
      try {
        const stocks = await inventoryService.getStockSummary({ warehouse_code });
        if (stocks.length > 0) {
          stockMap = stocks.reduce<Record<string, number>>((acc, item) => {
            const code = item.article_code?.toUpperCase();
            if (code && Number.isFinite(item.available_retail)) {
              acc[code] = item.available_retail;
            }
            return acc;
          }, {});
        }
      } catch (error) {
        // Log but don't fail the request
        console.error("GET /api/articulos stock lookup error", error);
      }
    }

    // Include units if requested
    if (include_units) {
      const units = await unitService.listUnits();
      return successResponse(stockMap ? { items: data, units, stock: stockMap } : { items: data, units });
    }

    return successResponse(stockMap ? { items: data, stock: stockMap } : { items: data });
  } catch (error) {
    return handleApiError(error, { operation: "GET /api/articulos" });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar artículos");
  if ("response" in access) return access.response;

  const body = await request.json().catch(() => null);
  const parsed = articleInputSchema.safeParse(body);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, "Datos de artículo inválidos");
  }

  try {
    const result = await articleService.upsertArticle(parsed.data);
    return createdResponse({ id: result.id }, "Artículo guardado exitosamente");
  } catch (error) {
    return handleApiError(error, { operation: "POST /api/articulos" });
  }
}

export async function DELETE(request: NextRequest) {
  const access = await requireAdministrator(request, "Solo un administrador puede administrar artículos");
  if ("response" in access) return access.response;

  const { searchParams } = new URL(request.url);
  const article_code = searchParams.get("article_code");

  if (!article_code) {
    return NextResponse.json({ success: false, message: "Falta article_code" }, { status: 400 });
  }

  try {
    const res = await articleService.deleteArticle(article_code);
    if (!res.deleted) {
      throw notFoundError("Artículo");
    }
    return successResponse(undefined, "Artículo eliminado");
  } catch (error) {
    return handleApiError(error, { operation: "DELETE /api/articulos" });
  }
}
