import { env } from "@/lib/env";
import { IArticleKitRepository, KitComponentInput, KitComponentRow } from "@/lib/repositories/IArticleKitRepository";
import { ArticleKitRepository } from "@/lib/repositories/ArticleKitRepository";

// Mock stores (copia de src/lib/db/articleKits.ts para el modo MOCK)
const mockKits: { [kitCode: string]: KitComponentRow[] } = {};
const mockArticlesIndex: { [code: string]: { id: number; name: string } } = {};

export class ArticleKitService {
  private articleKitRepository: IArticleKitRepository;

  constructor(articleKitRepository: IArticleKitRepository = new ArticleKitRepository()) {
    this.articleKitRepository = articleKitRepository;
  }

  async getKitComponents(kit_article_code: string): Promise<KitComponentRow[]> {
    if (env.useMockData) {
      return mockKits[kit_article_code] || [];
    }
    return this.articleKitRepository.getKitComponents(kit_article_code);
  }

  async upsertKitComponents(kit_article_code: string, components: KitComponentInput[]): Promise<{ count: number }> {
    if (env.useMockData) {
      const mapped: KitComponentRow[] = components.map(c => ({
        component_article_id: mockArticlesIndex[c.component_article_code]?.id || 0,
        component_article_code: c.component_article_code,
        component_article_name: mockArticlesIndex[c.component_article_code]?.name || c.component_article_code,
        component_qty_retail: c.component_qty_retail,
      }));
      mockKits[kit_article_code] = mapped;
      return { count: mapped.length };
    }
    return this.articleKitRepository.upsertKitComponents(kit_article_code, components);
  }
}
