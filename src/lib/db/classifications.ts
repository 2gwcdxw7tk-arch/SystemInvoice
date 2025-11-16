import "server-only";

import { ArticleClassificationService } from "@/lib/services/ArticleClassificationService";

export interface ClassificationRow {
  id: number;
  level: number;
  code: string;
  full_code: string;
  name: string;
  parent_full_code: string | null;
  is_active: boolean;
}

const classificationService = new ArticleClassificationService();

export async function listClassifications(params: { level?: number; parent_full_code?: string | null } = {}): Promise<ClassificationRow[]> {
  const items = await classificationService.list({
    level: params.level,
    parentFullCode: params.parent_full_code,
    includeInactive: false,
  });

  return items.map((row) => ({
    id: row.id,
    level: row.level,
    code: row.code,
    full_code: row.fullCode,
    name: row.name,
    parent_full_code: row.parentFullCode,
    is_active: row.isActive,
  }));
}
