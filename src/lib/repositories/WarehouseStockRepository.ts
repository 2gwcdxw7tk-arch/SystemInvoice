import { PrismaClient } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import type { IWarehouseStockRepository, WarehouseStockRecord } from "./IWarehouseStockRepository";

function normalizeQuantity(value: number, epsilon = 1e-6): number {
  if (Math.abs(value) < epsilon) {
    return 0;
  }
  return value;
}

export class WarehouseStockRepository implements IWarehouseStockRepository {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

  async getArticleStock(
    articleId: bigint,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<WarehouseStockRecord | null> {
    const client = tx ?? this.prisma;
    const stock = await client.warehouse_stock.findUnique({
      where: {
        article_id_warehouse_id: {
          article_id: articleId,
          warehouse_id: warehouseId,
        },
      },
    });

    if (!stock) return null;

    return {
      article_id: stock.article_id,
      warehouse_id: stock.warehouse_id,
      quantity_retail: Number(stock.quantity_retail),
      quantity_storage: Number(stock.quantity_storage),
      updated_at: stock.updated_at,
    };
  }

  async upsertArticleStock(
    data: {
      article_id: bigint;
      warehouse_id: number;
      quantity_retail: Prisma.Decimal | number;
      quantity_storage: Prisma.Decimal | number;
    },
    tx?: Prisma.TransactionClient
  ): Promise<WarehouseStockRecord> {
    const client = tx ?? this.prisma;

    const upsertedStock = await client.warehouse_stock.upsert({
      where: {
        article_id_warehouse_id: {
          article_id: data.article_id,
          warehouse_id: data.warehouse_id,
        },
      },
      update: {
        quantity_retail: data.quantity_retail,
        quantity_storage: data.quantity_storage,
        updated_at: new Date(),
      },
      create: {
        article_id: data.article_id,
        warehouse_id: data.warehouse_id,
        quantity_retail: data.quantity_retail,
        quantity_storage: data.quantity_storage,
      },
    });

    return {
      article_id: upsertedStock.article_id,
      warehouse_id: upsertedStock.warehouse_id,
      quantity_retail: Number(upsertedStock.quantity_retail),
      quantity_storage: Number(upsertedStock.quantity_storage),
      updated_at: upsertedStock.updated_at,
    };
  }

  async ensureArticleWarehouseAssociation(
    articleId: bigint,
    warehouseId: number,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const association = await client.article_warehouses.findUnique({
      where: {
        article_id_warehouse_id: {
          article_id: articleId,
          warehouse_id: warehouseId,
        },
      },
    });

    if (!association) {
      throw new Error(
        `El artículo ${articleId} no está asociado a la bodega ${warehouseId}.`
      );
    }
  }
}
