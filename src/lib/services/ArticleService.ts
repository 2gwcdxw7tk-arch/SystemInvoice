import { env } from "@/lib/env";
import { IArticleRepository, Article } from "@/lib/repositories/IArticleRepository";
import { ArticleRepository } from "@/lib/repositories/ArticleRepository";
import { unitService } from "@/lib/services/UnitService"; // usar servicio para unidades en modo MOCK
import { priceListService } from "@/lib/services/PriceListService"; // Reemplaza helper legacy (usado en resolver por defecto)

// Mock stores (copia de src/lib/db/articles.ts para el modo MOCK)
type MockArticle = Omit<Article, "storage_unit"|"retail_unit"> & {
  storage_unit_id: number;
  retail_unit_id: number;
  storage_unit: string;
  retail_unit: string;
  default_warehouse_id?: number | null;
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
};

const mockArticles: MockArticle[] = [];
const mockPriceLists: { id: number; code: string; name: string; start_date: string; end_date: string | null; is_active: boolean }[] = [];
const mockPrices: { id: number; article_id: number; price_list_id: number; price: number; start_date: string; end_date: string | null }[] = [];

async function resolveDefaultPriceListCode(): Promise<string> {
  if (env.useMockData) {
    return process.env.DEFAULT_PRICE_LIST_CODE || "BASE";
  }
  const fromDb = await priceListService.getDefaultCode();
  return fromDb ?? process.env.DEFAULT_PRICE_LIST_CODE ?? "BASE";
}

export class ArticleService {
  private articleRepository: IArticleRepository;

  constructor(articleRepository: IArticleRepository = new ArticleRepository()) {
    this.articleRepository = articleRepository;
  }

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
    if (env.useMockData) {
      let row = mockArticles.find(a => a.article_code === input.article_code);
      if (!row) {
        row = {
          id: mockArticles.length + 1,
          article_code: input.article_code,
          name: input.name,
          classification_full_code: input.classification_full_code ?? null,
          storage_unit: String(input.storage_unit_id),
          retail_unit: String(input.retail_unit_id),
          storage_unit_id: input.storage_unit_id,
          retail_unit_id: input.retail_unit_id,
          conversion_factor: input.conversion_factor,
          article_type: input.article_type,
          is_active: true,
          default_warehouse_id: input.default_warehouse_id ?? null,
          classification_level1_id: input.classification_level1_id ?? null,
          classification_level2_id: input.classification_level2_id ?? null,
          classification_level3_id: input.classification_level3_id ?? null,
        };
        mockArticles.push(row);
      } else {
        row.name = input.name;
        row.classification_full_code = input.classification_full_code ?? null;
        row.storage_unit_id = input.storage_unit_id;
        row.retail_unit_id = input.retail_unit_id;
        row.storage_unit = String(input.storage_unit_id);
        row.retail_unit = String(input.retail_unit_id);
        row.conversion_factor = input.conversion_factor;
        row.article_type = input.article_type;
        row.default_warehouse_id = input.default_warehouse_id ?? null;
        row.classification_level1_id = input.classification_level1_id ?? null;
        row.classification_level2_id = input.classification_level2_id ?? null;
        row.classification_level3_id = input.classification_level3_id ?? null;
      }
      return { id: row.id };
    }
    return this.articleRepository.upsertArticle(input);
  }

  async getArticles(params: {
    price_list_code?: string;
    unit?: "RETAIL" | "STORAGE";
    on_date?: string;
  }): Promise<Array<Article & { price: { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null }>> {
    if (env.useMockData) {
      const priceListCode = (params.price_list_code ? params.price_list_code : await resolveDefaultPriceListCode()).toUpperCase();
      const today = params.on_date || new Date().toISOString().slice(0,10);
      const preferUnit = params.unit || "RETAIL";

      const pl = mockPriceLists.find(p => p.code.toUpperCase() === priceListCode);
      // Resolver nombres de unidades desde el catálogo de unidades
      const units = await unitService.listUnits();
      const out: Array<Article & { price: { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null }> = mockArticles.map(a => {
        const suName = units.find(u => u.id === a.storage_unit_id)?.name ?? String(a.storage_unit_id);
        const ruName = units.find(u => u.id === a.retail_unit_id)?.name ?? String(a.retail_unit_id);
        let base = mockPrices
          .filter(p => p.article_id === a.id && (!pl || p.price_list_id === pl.id) && (!p.end_date || p.end_date >= today) && p.start_date <= today)
          .sort((a,b) => b.start_date.localeCompare(a.start_date))[0];
        if (!base && pl) {
          base = mockPrices
            .filter(p => p.article_id === a.id && p.price_list_id === pl.id)
            .sort((a,b) => b.start_date.localeCompare(a.start_date))[0];
        }
        if (!base) return { ...a, storage_unit: suName, retail_unit: ruName, price: null };
        // Precio base se almacena en unidad detalle; convertir si se pide almacenamiento
        let price = base.price;
        const unit: "RETAIL" | "STORAGE" = preferUnit;
        if (preferUnit === "STORAGE") price = price * a.conversion_factor;
        return { ...a, storage_unit: suName, retail_unit: ruName, price: { unit, base_price: price, start_date: base.start_date, end_date: base.end_date } };
      });
      return out;
    }
    return this.articleRepository.getArticles(params);
  }

  async getArticleByCode(article_code: string): Promise<Article | null> {
    if (env.useMockData) {
      const row = mockArticles.find(a => a.article_code === article_code);
      if (!row) return null;
      const units = await unitService.listUnits();
      const su = units.find(u => u.id === row.storage_unit_id)?.name || null;
      const ru = units.find(u => u.id === row.retail_unit_id)?.name || null;
      return {
        id: row.id,
        article_code: row.article_code,
        name: row.name,
        classification_full_code: row.classification_full_code ?? null,
        is_active: row.is_active ?? true,
        article_type: row.article_type,
        storage_unit_id: row.storage_unit_id,
        retail_unit_id: row.retail_unit_id,
        storage_unit: su,
        retail_unit: ru,
        conversion_factor: row.conversion_factor,
        default_warehouse_id: row.default_warehouse_id ?? null,
        classification_level1_id: row.classification_level1_id ?? null,
        classification_level2_id: row.classification_level2_id ?? null,
        classification_level3_id: row.classification_level3_id ?? null,
        c1_full_code: null,
        c2_full_code: null,
        c3_full_code: null,
      };
    }
    return this.articleRepository.getArticleByCode(article_code);
  }

  async deleteArticle(article_code: string): Promise<{ deleted: boolean }> {
    if (env.useMockData) {
      const idx = mockArticles.findIndex(a => a.article_code === article_code);
      if (idx >= 0) {
        mockArticles.splice(idx, 1);
        return { deleted: true };
      }
      return { deleted: false };
    }
    return this.articleRepository.deleteArticle(article_code);
  }
}
