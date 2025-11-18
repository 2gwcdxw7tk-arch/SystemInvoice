import type { Decimal } from "@prisma/client/runtime/library";

import { IArticleRepository, Article } from "./IArticleRepository";
import { priceListRepository } from "@/lib/repositories/prices/PriceListRepository";
import { prisma } from "@/lib/db/prisma";

type ArticlePriceEntry = {
  price: Decimal;
  start_date: Date;
  end_date: Date | null;
};

type ArticleRow = {
  id: number | bigint;
  article_code: string;
  name: string;
  classification_full_code: string | null;
  storage_unit: string | null;
  retail_unit: string | null;
  storage_unit_id: number | null;
  retail_unit_id: number | null;
  conversion_factor: Decimal;
  is_active: boolean;
  article_type: string | null;
  classification_level1_id: number | null;
  classification_level2_id: number | null;
  classification_level3_id: number | null;
  default_warehouse_id: number | null;
  units_articles_storage_unit_idTounits: { name: string } | null;
  units_articles_retail_unit_idTounits: { name: string } | null;
  article_prices: ArticlePriceEntry[];
};

function mapPriceEntry(entry: ArticlePriceEntry | undefined, preferUnit: "RETAIL" | "STORAGE", conversionFactor: Decimal): { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null {
  if (!entry) {
    return null;
  }

  let basePrice = Number(entry.price);
  if (preferUnit === "STORAGE") {
    basePrice *= Number(conversionFactor);
  }

  return {
    unit: preferUnit,
    base_price: basePrice,
    start_date: entry.start_date.toISOString().slice(0, 10),
    end_date: entry.end_date ? entry.end_date.toISOString().slice(0, 10) : null,
  };
}

function normalizeDateInput(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export class ArticleRepository implements IArticleRepository {
  async upsertArticle(input: {
    article_code: string;
    name: string;
    classification_full_code?: string | null;
    storage_unit_id: number;
    retail_unit_id: number;
    conversion_factor: number;
    article_type: "TERMINADO" | "KIT";
    default_warehouse_id?: number | null;
    classification_level1_id?: number | null;
    classification_level2_id?: number | null;
    classification_level3_id?: number | null;
  }): Promise<{ id: number }> {
    const normalizedCode = input.article_code.trim().toUpperCase();
    const normalizedName = input.name.trim();
    const classificationFullCode = input.classification_full_code?.trim() ?? null;

    const article = await prisma.articles.upsert({
      where: { article_code: normalizedCode },
      update: {
        name: normalizedName,
        classification_full_code: classificationFullCode,
        storage_unit_id: input.storage_unit_id,
        retail_unit_id: input.retail_unit_id,
        storage_unit: String(input.storage_unit_id),
        retail_unit: String(input.retail_unit_id),
        conversion_factor: input.conversion_factor,
        article_type: input.article_type,
        default_warehouse_id: input.default_warehouse_id ?? null,
        classification_level1_id: input.classification_level1_id ?? null,
        classification_level2_id: input.classification_level2_id ?? null,
        classification_level3_id: input.classification_level3_id ?? null,
      },
      create: {
        article_code: normalizedCode,
        name: normalizedName,
        classification_full_code: classificationFullCode,
        storage_unit_id: input.storage_unit_id,
        retail_unit_id: input.retail_unit_id,
        storage_unit: String(input.storage_unit_id),
        retail_unit: String(input.retail_unit_id),
        conversion_factor: input.conversion_factor,
        article_type: input.article_type,
        default_warehouse_id: input.default_warehouse_id ?? null,
        classification_level1_id: input.classification_level1_id ?? null,
        classification_level2_id: input.classification_level2_id ?? null,
        classification_level3_id: input.classification_level3_id ?? null,
      },
      select: { id: true },
    });

    return { id: Number(article.id) };
  }

  async getArticles(params: {
    price_list_code?: string;
    unit?: "RETAIL" | "STORAGE";
    on_date?: string;
    search?: string;
  }): Promise<Array<Article & { price: { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null }>> {
    const resolvedCode = params.price_list_code ?? (await priceListRepository.getDefaultPriceListCode());
    if (!resolvedCode) {
      throw new Error("No se encontró una lista de precios predeterminada");
    }

    const priceListCode = resolvedCode.toUpperCase();
    const referenceDate = normalizeDateInput(params.on_date);
    const preferUnit = params.unit ?? "RETAIL";
    const searchTerm = params.search?.trim();

    const articlesWithPrice = await prisma.articles.findMany({
      where: {
        is_active: true,
        ...(searchTerm
          ? {
              OR: [
                { article_code: { contains: searchTerm, mode: "insensitive" } },
                { name: { contains: searchTerm, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        article_code: true,
        name: true,
        classification_full_code: true,
        storage_unit: true,
        retail_unit: true,
        storage_unit_id: true,
        retail_unit_id: true,
        conversion_factor: true,
        is_active: true,
        article_type: true,
        classification_level1_id: true,
        classification_level2_id: true,
        classification_level3_id: true,
        default_warehouse_id: true,
        units_articles_storage_unit_idTounits: { select: { name: true } },
        units_articles_retail_unit_idTounits: { select: { name: true } },
        article_prices: {
          select: {
            price: true,
            start_date: true,
            end_date: true,
          },
          where: {
            price_lists: { code: priceListCode },
            is_active: true,
            start_date: { lte: referenceDate },
            OR: [{ end_date: null }, { end_date: { gte: referenceDate } }],
          },
          orderBy: { start_date: "desc" },
          take: 1,
        },
      },
    });

    return articlesWithPrice.map((article: ArticleRow) => {
      const priceEntry = article.article_prices[0];
      const price = mapPriceEntry(priceEntry, preferUnit, article.conversion_factor);

      return {
        id: Number(article.id),
        article_code: article.article_code,
        name: article.name,
        classification_full_code: article.classification_full_code,
        storage_unit: article.units_articles_storage_unit_idTounits?.name ?? article.storage_unit ?? null,
        retail_unit: article.units_articles_retail_unit_idTounits?.name ?? article.retail_unit ?? null,
        storage_unit_id: article.storage_unit_id ?? null,
        retail_unit_id: article.retail_unit_id ?? null,
        conversion_factor: Number(article.conversion_factor),
        is_active: article.is_active,
        article_type: (article.article_type as "TERMINADO" | "KIT") ?? "TERMINADO",
        classification_level1_id: article.classification_level1_id ?? null,
        classification_level2_id: article.classification_level2_id ?? null,
        classification_level3_id: article.classification_level3_id ?? null,
        default_warehouse_id: article.default_warehouse_id ?? null,
        price,
      } satisfies Article & { price: { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null };
    });
  }

  async getArticleByCode(article_code: string): Promise<Article | null> {
    const article = await prisma.articles.findUnique({
      where: { article_code },
      select: {
        id: true,
        article_code: true,
        name: true,
        classification_full_code: true,
        storage_unit: true,
        retail_unit: true,
        storage_unit_id: true,
        retail_unit_id: true,
        conversion_factor: true,
        is_active: true,
        article_type: true,
        classification_level1_id: true,
        classification_level2_id: true,
        classification_level3_id: true,
        default_warehouse_id: true,
        units_articles_storage_unit_idTounits: { select: { name: true } },
        units_articles_retail_unit_idTounits: { select: { name: true } },
        article_classifications_articles_classification_level1_idToarticle_classifications: {
          select: { full_code: true },
        },
        article_classifications_articles_classification_level2_idToarticle_classifications: {
          select: { full_code: true },
        },
        article_classifications_articles_classification_level3_idToarticle_classifications: {
          select: { full_code: true },
        },
      },
    });

    if (!article) {
      return null;
    }

    return {
      id: Number(article.id),
      article_code: article.article_code,
      name: article.name,
      classification_full_code: article.classification_full_code,
      storage_unit: article.units_articles_storage_unit_idTounits?.name ?? article.storage_unit ?? null,
      retail_unit: article.units_articles_retail_unit_idTounits?.name ?? article.retail_unit ?? null,
      storage_unit_id: article.storage_unit_id ?? null,
      retail_unit_id: article.retail_unit_id ?? null,
      conversion_factor: Number(article.conversion_factor),
      is_active: article.is_active,
      article_type: (article.article_type as "TERMINADO" | "KIT") ?? "TERMINADO",
      classification_level1_id: article.classification_level1_id ?? null,
      classification_level2_id: article.classification_level2_id ?? null,
      classification_level3_id: article.classification_level3_id ?? null,
      default_warehouse_id: article.default_warehouse_id ?? null,
      c1_full_code:
        article.article_classifications_articles_classification_level1_idToarticle_classifications?.full_code ?? null,
      c2_full_code:
        article.article_classifications_articles_classification_level2_idToarticle_classifications?.full_code ?? null,
      c3_full_code:
        article.article_classifications_articles_classification_level3_idToarticle_classifications?.full_code ?? null,
    };
  }

  async deleteArticle(article_code: string): Promise<{ deleted: boolean }> {
    try {
      await prisma.articles.delete({ where: { article_code } });
      return { deleted: true };
    } catch (error) {
      console.error("Error deleting article:", error);
      return { deleted: false };
    }
  }
}
