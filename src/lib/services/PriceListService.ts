import { env } from "@/lib/env";
import { PriceListRepository, priceListRepository, type PriceListItemRow, type PriceListRow } from "@/lib/repositories/prices/PriceListRepository";

// Mock stores para modo MOCK (simple y en memoria)
const mockLists: PriceListRow[] = [
  {
    id: 1,
    code: process.env.DEFAULT_PRICE_LIST_CODE || "BASE",
    name: process.env.DEFAULT_PRICE_LIST_CODE || "BASE",
    description: "Lista predeterminada",
    currency_code: process.env.NEXT_PUBLIC_LOCAL_CURRENCY_CODE || "NIO",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: null,
    is_active: true,
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
const mockItems: PriceListItemRow[] = [];

export class PriceListService {
  constructor(private readonly repo: PriceListRepository = priceListRepository) {}

  async getDefaultCode(): Promise<string | null> {
    if (env.useMockData) {
      const match = mockLists.find((l) => l.is_default) ?? mockLists[0] ?? null;
      return match ? match.code : null;
    }
    return this.repo.getDefaultPriceListCode();
  }

  async list(): Promise<PriceListRow[]> {
    if (env.useMockData) return mockLists.slice();
    return this.repo.listPriceLists();
  }

  async getByCode(code: string): Promise<PriceListRow | null> {
    if (env.useMockData) return mockLists.find((l) => l.code === code.trim().toUpperCase()) ?? null;
    return this.repo.getPriceListByCode(code);
  }

  async listItems(code: string): Promise<PriceListItemRow[]> {
    if (env.useMockData) return mockItems.filter((i) => i.currency_code === code);
    return this.repo.listPriceListItems(code);
  }

  async upsert(input: {
    code: string;
    name?: string;
    description?: string | null;
    currency_code?: string | null;
    start_date?: string;
    end_date?: string | null;
    is_active?: boolean;
    is_default?: boolean;
  }): Promise<{ id: number }> {
    if (env.useMockData) {
      const code = input.code.trim().toUpperCase();
      const idx = mockLists.findIndex((l) => l.code === code);
      const now = new Date();
      const base: PriceListRow = {
        id: idx >= 0 ? mockLists[idx].id : mockLists.length + 1,
        code,
        name: (input.name ?? code).trim(),
        description: input.description ?? null,
        currency_code: (input.currency_code ?? "NIO").trim().toUpperCase(),
        start_date: (input.start_date ? new Date(input.start_date) : now).toISOString().slice(0, 10),
        end_date: input.end_date ? new Date(input.end_date).toISOString().slice(0, 10) : null,
        is_active: typeof input.is_active === "boolean" ? input.is_active : true,
        is_default: !!input.is_default,
        created_at: idx >= 0 ? mockLists[idx].created_at : now.toISOString(),
        updated_at: now.toISOString(),
      };
      if (base.is_default) {
        mockLists.forEach((l) => (l.is_default = l.code === base.code));
      }
      if (idx >= 0) mockLists[idx] = base; else mockLists.push(base);
      return { id: base.id };
    }
    return this.repo.upsertPriceList(input);
  }

  async setActive(code: string, isActive: boolean): Promise<void> {
    if (env.useMockData) {
      const row = mockLists.find((l) => l.code === code.trim().toUpperCase());
      if (row) row.is_active = !!isActive;
      return;
    }
    return this.repo.setPriceListActiveState(code, isActive);
  }

  async setDefault(code: string): Promise<void> {
    if (env.useMockData) {
      const normalized = code.trim().toUpperCase();
      mockLists.forEach((l) => (l.is_default = l.code === normalized));
      return;
    }
    return this.repo.setPriceListAsDefault(code);
  }

  async setArticlePrice(input: { article_code: string; price_list_code: string; price: number; start_date?: string; end_date?: string | null }): Promise<{ success: true }> {
    if (env.useMockData) {
      const row: PriceListItemRow = {
        article_id: 0,
        article_code: input.article_code.trim().toUpperCase(),
        name: input.article_code.trim().toUpperCase(),
        unit: "UNIDAD",
        price: input.price,
        currency_code: "NIO",
        is_active: true,
        start_date: (input.start_date ? new Date(input.start_date) : new Date()).toISOString().slice(0, 10),
        end_date: input.end_date ? new Date(input.end_date).toISOString().slice(0, 10) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const idx = mockItems.findIndex((i) => i.article_code === row.article_code);
      if (idx >= 0) mockItems[idx] = row; else mockItems.push(row);
      return { success: true } as const;
    }
    return this.repo.setArticlePrice(input);
  }

  async setArticleActive(params: { article_code: string; price_list_code: string; is_active: boolean }): Promise<void> {
    if (env.useMockData) {
      // Simple toggle en mockItems según article_code
      const idx = mockItems.findIndex((i) => i.article_code === params.article_code.trim().toUpperCase());
      if (idx >= 0) mockItems[idx].is_active = !!params.is_active;
      return;
    }
    return this.repo.setArticlePriceActive(params);
  }

  async removeArticle(params: { article_code: string; price_list_code: string }): Promise<void> {
    if (env.useMockData) {
      const idx = mockItems.findIndex((i) => i.article_code === params.article_code.trim().toUpperCase());
      if (idx >= 0) mockItems.splice(idx, 1);
      return;
    }
    return this.repo.removeArticleFromPriceList(params);
  }
}

export const priceListService = new PriceListService();
