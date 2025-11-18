import { Prisma } from "@prisma/client";

export interface WarehouseStockRecord {
  article_id: bigint;
  warehouse_id: number;
  quantity_retail: Prisma.Decimal | number;
  quantity_storage: Prisma.Decimal | number;
  updated_at: Date;
}

export interface IWarehouseStockRepository {
  getArticleStock(articleId: bigint, warehouseId: number, tx?: Prisma.TransactionClient): Promise<WarehouseStockRecord | null>;
  upsertArticleStock(data: {
    article_id: bigint;
    warehouse_id: number;
    quantity_retail: Prisma.Decimal | number;
    quantity_storage: Prisma.Decimal | number;
  }, tx?: Prisma.TransactionClient): Promise<WarehouseStockRecord>;
  ensureArticleWarehouseAssociation(
    articleId: bigint,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<void>;
}
