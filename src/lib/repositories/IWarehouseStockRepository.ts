import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export interface WarehouseStockRecord {
  article_id: number;
  warehouse_id: number;
  quantity_retail: Decimal | number;
  quantity_storage: Decimal | number;
  updated_at: Date;
}

export interface IWarehouseStockRepository {
  getArticleStock(articleId: number, warehouseId: number, tx?: Prisma.TransactionClient): Promise<WarehouseStockRecord | null>;
  upsertArticleStock(data: {
    article_id: number;
    warehouse_id: number;
    quantity_retail: Decimal | number;
    quantity_storage: Decimal | number;
  }, tx?: Prisma.TransactionClient): Promise<WarehouseStockRecord>;
  ensureArticleWarehouseAssociation(
    articleId: number,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<void>;
}
