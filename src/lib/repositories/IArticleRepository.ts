// No importar Article directamente desde @prisma/client
// Definir una interfaz local para Article o usar el tipo generado por Prisma a través del cliente.

export interface Article {
  id: number;
  article_code: string;
  name: string;
  classification_full_code: string | null;
  storage_unit: string | null; // nombre de unidad
  retail_unit: string | null;  // nombre de unidad
  storage_unit_id: number | null; // agregado para fallback de edición
  retail_unit_id: number | null;  // agregado para fallback de edición
  conversion_factor: number;
  is_active: boolean;
  article_type: "TERMINADO" | "KIT";
  classification_level1_id?: number | null;
  classification_level2_id?: number | null;
  classification_level3_id?: number | null;
  default_warehouse_id?: number | null;
  // Propiedades adicionales para getArticleByCode
  c1_full_code?: string | null;
  c2_full_code?: string | null;
  c3_full_code?: string | null;
}

export interface IArticleRepository {
  upsertArticle(input: {
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
  }): Promise<{ id: number }>;
  
  getArticles(params: {
    price_list_code?: string;
    unit?: "RETAIL" | "STORAGE";
    on_date?: string;
  }): Promise<Array<Article & { price: { unit: "RETAIL" | "STORAGE"; base_price: number | null; start_date: string | null; end_date: string | null } | null }>>;

  getArticleByCode(article_code: string): Promise<Article | null>;

  deleteArticle(article_code: string): Promise<{ deleted: boolean }>;
}
