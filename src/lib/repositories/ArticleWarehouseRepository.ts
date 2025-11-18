import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { IArticleWarehouseRepository, ArticleWarehouseAssociationRecord } from "@/lib/repositories/IArticleWarehouseRepository";

type ArticleWarehouseRow = {
  article_id: bigint | number;
  warehouse_id: number;
  is_primary: boolean;
  created_at: Date;
  warehouses: {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
  };
};

function mapAssociation(row: ArticleWarehouseRow): ArticleWarehouseAssociationRecord {
  return {
    articleId: Number(row.article_id),
    warehouseId: row.warehouse_id,
    warehouseCode: row.warehouses.code,
    warehouseName: row.warehouses.name,
    warehouseIsActive: Boolean(row.warehouses.is_active),
    isPrimary: Boolean(row.is_primary),
    associatedAt: row.created_at.toISOString(),
  } satisfies ArticleWarehouseAssociationRecord;
}

export class ArticleWarehouseRepository implements IArticleWarehouseRepository {
  async listAssociations(
    articleId: number,
    tx?: Prisma.TransactionClient
  ): Promise<ArticleWarehouseAssociationRecord[]> {
    const client = tx ?? prisma;

    const rows = await client.article_warehouses.findMany({
      where: { article_id: BigInt(articleId) },
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            is_active: true,
          },
        },
      },
      orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
    });

    return rows.map((row) => mapAssociation(row as ArticleWarehouseRow));
  }

  async upsertAssociation(
    params: { articleId: number; warehouseId: number; isPrimary: boolean },
    tx?: Prisma.TransactionClient
  ): Promise<ArticleWarehouseAssociationRecord> {
    const client = tx ?? prisma;

    const row = await client.article_warehouses.upsert({
      where: {
        article_id_warehouse_id: {
          article_id: BigInt(params.articleId),
          warehouse_id: params.warehouseId,
        },
      },
      update: {
        is_primary: params.isPrimary,
      },
      create: {
        article_id: BigInt(params.articleId),
        warehouse_id: params.warehouseId,
        is_primary: params.isPrimary,
      },
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            is_active: true,
          },
        },
      },
    });

    return mapAssociation(row as ArticleWarehouseRow);
  }

  async clearPrimary(articleId: number, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? prisma;

    await client.article_warehouses.updateMany({
      where: { article_id: BigInt(articleId), is_primary: true },
      data: { is_primary: false },
    });
  }

  async removeAssociation(
    params: { articleId: number; warehouseId: number },
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma;

    await client.article_warehouses.delete({
      where: {
        article_id_warehouse_id: {
          article_id: BigInt(params.articleId),
          warehouse_id: params.warehouseId,
        },
      },
    });
  }

  async updateArticleDefaultWarehouse(
    params: { articleId: number; warehouseId: number | null },
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma;

    await client.articles.update({
      where: { id: BigInt(params.articleId) },
      data: {
        default_warehouse_id: params.warehouseId,
      },
    });
  }
}
