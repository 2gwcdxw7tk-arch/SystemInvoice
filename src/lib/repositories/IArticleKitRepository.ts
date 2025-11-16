export interface KitComponentInput {
  component_article_code: string;
  component_qty_retail: number;
}

export interface KitComponentRow {
  component_article_id: number;
  component_article_code: string;
  component_article_name: string;
  component_qty_retail: number;
}

export interface IArticleKitRepository {
  getKitComponents(kit_article_code: string): Promise<KitComponentRow[]>;
  upsertKitComponents(kit_article_code: string, components: KitComponentInput[]): Promise<{ count: number }>;
}
