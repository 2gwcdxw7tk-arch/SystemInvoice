import { PrismaClient, prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import type { IWarehouseStockRepository, WarehouseStockRecord } from "./IWarehouseStockRepository";

export class WarehouseStockRepository implements IWarehouseStockRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async getArticleStock(
    articleId: number,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<WarehouseStockRecord | null> {
    const client = tx ?? this.prisma;
    const stock = await client.warehouse_stock.findUnique({
      where: {
        article_id_warehouse_id: {
          article_id: BigInt(articleId),
          warehouse_id: warehouseId,
        },
      },
    });

    if (!stock) return null;

    return {
      article_id: Number(stock.article_id),
      warehouse_id: stock.warehouse_id,
      quantity_retail: Number(stock.quantity_retail),
      quantity_storage: Number(stock.quantity_storage),
      updated_at: stock.updated_at,
    };
  }

  async upsertArticleStock(
    data: {
      article_id: number;
      warehouse_id: number;
      quantity_retail: Decimal | number;
      quantity_storage: Decimal | number;
    },
    tx?: Prisma.TransactionClient
  ): Promise<WarehouseStockRecord> {
    const client = tx ?? this.prisma;

    const upsertedStock = await client.warehouse_stock.upsert({
      where: {
        article_id_warehouse_id: {
          article_id: BigInt(data.article_id),
          warehouse_id: data.warehouse_id,
        },
      },
      update: {
        quantity_retail: data.quantity_retail,
        quantity_storage: data.quantity_storage,
        updated_at: new Date(),
      },
      create: {
        article_id: BigInt(data.article_id),
        warehouse_id: data.warehouse_id,
        quantity_retail: data.quantity_retail,
        quantity_storage: data.quantity_storage,
      },
    });

    return {
      article_id: Number(upsertedStock.article_id),
      warehouse_id: upsertedStock.warehouse_id,
      quantity_retail: Number(upsertedStock.quantity_retail),
      quantity_storage: Number(upsertedStock.quantity_storage),
      updated_at: upsertedStock.updated_at,
    };
  }

  async ensureArticleWarehouseAssociation(
    articleId: number,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const association = await client.article_warehouses.findUnique({
      where: {
        article_id_warehouse_id: {
          article_id: BigInt(articleId),
          warehouse_id: warehouseId,
        },
      },
    });

    if (!association) {
      const [article, warehouse] = await Promise.all([
        client.articles.findUnique({
          where: { id: BigInt(articleId) },
          select: { article_code: true, name: true },
        }),
        client.warehouses.findUnique({
          where: { id: warehouseId },
          select: { code: true, name: true },
        }),
      ]);

      const articleLabel = article ? `${article.article_code} — ${article.name}` : `ID ${articleId}`;
      const warehouseLabel = warehouse ? `${warehouse.code} (${warehouse.name})` : `ID ${warehouseId}`;

      throw new Error(`El artículo ${articleLabel} no está asociado al almacén ${warehouseLabel}.`);
    }
  }
}
