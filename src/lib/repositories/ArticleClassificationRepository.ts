import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  ArticleClassificationFilters,
  ArticleClassificationRow,
  CreateArticleClassificationInput,
  IArticleClassificationRepository,
  UpdateArticleClassificationInput,
} from "@/lib/repositories/IArticleClassificationRepository";

function mapRow(row: {
  id: number;
  level: number;
  code: string;
  full_code: string;
  name: string;
  parent_full_code: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date | null;
}): ArticleClassificationRow {
  return {
    id: row.id,
    level: row.level,
    code: row.code,
    fullCode: row.full_code,
    name: row.name,
    parentFullCode: row.parent_full_code,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
  };
}

export class ArticleClassificationRepository implements IArticleClassificationRepository {
  async listClassifications(filters: ArticleClassificationFilters = {}): Promise<ArticleClassificationRow[]> {
    const includeInactive = filters.includeInactive ?? false;
    const where: Prisma.article_classificationsWhereInput = {};

    if (!includeInactive) {
      where.is_active = true;
    }

    if (typeof filters.level === "number") {
      where.level = filters.level;
    }

    if (filters.parentFullCode !== undefined) {
      where.parent_full_code = filters.parentFullCode ?? null;
    }

    const rows = await prisma.article_classifications.findMany({
      where,
      orderBy: [{ full_code: "asc" }],
    });

    return rows.map(mapRow);
  }

  async getById(id: number): Promise<ArticleClassificationRow | null> {
    const row = await prisma.article_classifications.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async getByFullCode(fullCode: string): Promise<ArticleClassificationRow | null> {
    const row = await prisma.article_classifications.findUnique({ where: { full_code: fullCode } });
    return row ? mapRow(row) : null;
  }

  async createClassification(input: CreateArticleClassificationInput): Promise<ArticleClassificationRow> {
    const created = await prisma.article_classifications.create({
      data: {
        level: input.level,
        code: input.code,
        full_code: input.fullCode,
        name: input.name,
        parent_full_code: input.parentFullCode,
        is_active: input.isActive ?? true,
        // created_at handled by DB default, updated_at default as well
      },
    });

    return mapRow(created);
  }

  async updateClassification(id: number, input: UpdateArticleClassificationInput): Promise<ArticleClassificationRow> {
    const data: {
      name?: string;
      is_active?: boolean;
      updated_at: Date;
    } = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.isActive !== undefined) {
      data.is_active = input.isActive;
    }

    const updated = await prisma.article_classifications.update({
      where: { id },
      data,
    });

    return mapRow(updated);
  }
}
