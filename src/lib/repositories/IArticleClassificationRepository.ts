export interface ArticleClassificationRow {
  id: number;
  level: number;
  code: string;
  fullCode: string;
  name: string;
  parentFullCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ArticleClassificationFilters {
  level?: number;
  parentFullCode?: string | null;
  includeInactive?: boolean;
}

export interface CreateArticleClassificationInput {
  code: string;
  name: string;
  level: number;
  fullCode: string;
  parentFullCode: string | null;
  isActive?: boolean;
}

export interface UpdateArticleClassificationInput {
  name?: string;
  isActive?: boolean;
}

export interface IArticleClassificationRepository {
  listClassifications(filters?: ArticleClassificationFilters): Promise<ArticleClassificationRow[]>;
  getById(id: number): Promise<ArticleClassificationRow | null>;
  getByFullCode(fullCode: string): Promise<ArticleClassificationRow | null>;
  createClassification(input: CreateArticleClassificationInput): Promise<ArticleClassificationRow>;
  updateClassification(id: number, input: UpdateArticleClassificationInput): Promise<ArticleClassificationRow>;
}
