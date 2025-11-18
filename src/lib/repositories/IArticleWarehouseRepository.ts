import type { Prisma } from "@prisma/client";

export type ArticleWarehouseAssociationRecord = {
  articleId: number;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  warehouseIsActive: boolean;
  isPrimary: boolean;
  associatedAt: string;
};

export interface IArticleWarehouseRepository {
  listAssociations(
    articleId: number,
    tx?: Prisma.TransactionClient
  ): Promise<ArticleWarehouseAssociationRecord[]>;
  upsertAssociation(
    params: { articleId: number; warehouseId: number; isPrimary: boolean },
    tx?: Prisma.TransactionClient
  ): Promise<ArticleWarehouseAssociationRecord>;
  clearPrimary(articleId: number, tx?: Prisma.TransactionClient): Promise<void>;
  removeAssociation(
    params: { articleId: number; warehouseId: number },
    tx?: Prisma.TransactionClient
  ): Promise<void>;
  updateArticleDefaultWarehouse(
    params: { articleId: number; warehouseId: number | null },
    tx?: Prisma.TransactionClient
  ): Promise<void>;
}
