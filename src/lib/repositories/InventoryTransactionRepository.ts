import { PrismaClient, prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import type {
  IInventoryTransactionRepository,
  InventoryTransactionCreateInput,
  InventoryTransactionEntryCreateInput,
  InventoryMovementCreateInput,
  InventoryTransactionDocumentRecord,
  InventoryTransactionHeaderFilter,
  InventoryTransactionHeaderRow,
  InventoryTransactionResult,
  MovementDirection,
  TransactionType,
  InventoryUnit,
} from "./IInventoryTransactionRepository";

export class InventoryTransactionRepository implements IInventoryTransactionRepository {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? prisma;
  }

  async createTransaction(
    data: InventoryTransactionCreateInput,
    tx?: Prisma.TransactionClient
  ): Promise<InventoryTransactionResult> {
    const client = tx ?? this.prisma;
    const transaction = await client.inventory_transactions.create({
      data: {
        transaction_code: data.transaction_code,
        transaction_type: data.transaction_type,
        warehouse_id: data.warehouse_id,
        reference: data.reference,
        counterparty_name: data.counterparty_name,
        status: data.status ?? "PENDIENTE",
        notes: data.notes,
        occurred_at: data.occurred_at,
        authorized_by: data.authorized_by,
        created_by: data.created_by,
        total_amount: data.total_amount,
      },
      select: {
        id: true,
        transaction_code: true,
      },
    });
    return { id: Number(transaction.id), transaction_code: transaction.transaction_code };
  }

  async createTransactionEntry(
    data: InventoryTransactionEntryCreateInput,
    tx?: Prisma.TransactionClient
  ): Promise<{ id: number }> {
    const client = tx ?? this.prisma;
    const entry = await client.inventory_transaction_entries.create({
      data: {
        transaction_id: BigInt(data.transaction_id),
        article_id: BigInt(data.article_id),
        quantity_entered: data.quantity_entered,
        entered_unit: data.entered_unit,
        direction: data.direction,
        unit_conversion_factor: data.unit_conversion_factor,
        kit_multiplier: data.kit_multiplier,
        cost_per_unit: data.cost_per_unit,
        subtotal: data.subtotal,
        notes: data.notes,
      },
      select: {
        id: true,
      },
    });
    return { id: Number(entry.id) };
  }

  async createMovement(
    data: InventoryMovementCreateInput,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.inventory_movements.create({
      data: {
        transaction_id: BigInt(data.transaction_id),
        entry_id: BigInt(data.entry_id),
        article_id: BigInt(data.article_id),
        direction: data.direction,
        quantity_retail: data.quantity_retail,
        warehouse_id: data.warehouse_id,
        source_kit_article_id: data.source_kit_article_id,
      },
    });
  }

  async updateTransactionTotalAmount(
    transactionId: number,
    totalAmount: Decimal | number,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.inventory_transactions.update({
      where: { id: BigInt(transactionId) },
      data: { total_amount: totalAmount },
    });
  }

  async findTransactionDocumentByCode(
    transactionCode: string,
    tx?: Prisma.TransactionClient
  ): Promise<InventoryTransactionDocumentRecord | null> {
    const client = tx ?? this.prisma;
    const transaction = await client.inventory_transactions.findUnique({
      where: { transaction_code: transactionCode },
      select: {
        id: true,
        transaction_code: true,
        transaction_type: true,
        occurred_at: true,
        created_at: true,
        reference: true,
        counterparty_name: true,
        status: true,
        notes: true,
        authorized_by: true,
        created_by: true,
        total_amount: true,
        warehouses: { select: { id: true, code: true, name: true } },
        inventory_transaction_entries: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            direction: true,
            entered_unit: true,
            quantity_entered: true,
            unit_conversion_factor: true,
            kit_multiplier: true,
            cost_per_unit: true,
            subtotal: true,
            notes: true,
            articles: {
              select: {
                id: true,
                article_code: true,
                name: true,
                retail_unit: true,
                storage_unit: true,
                conversion_factor: true,
              },
            },
            inventory_movements: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                direction: true,
                quantity_retail: true,
                warehouse_id: true,
                warehouses: { select: { id: true, code: true, name: true } },
                articles_inventory_movements_article_idToarticles: {
                  select: {
                    id: true,
                    article_code: true,
                    name: true,
                    retail_unit: true,
                    storage_unit: true,
                  },
                },
                articles_inventory_movements_source_kit_article_idToarticles: {
                  select: { article_code: true },
                },
              },
            },
          },
        },
      },
    });

    if (!transaction) {
      return null;
    }

    return {
      id: Number(transaction.id),
      transaction_code: transaction.transaction_code,
      transaction_type: transaction.transaction_type as TransactionType,
      occurred_at: transaction.occurred_at,
      created_at: transaction.created_at,
      reference: transaction.reference ?? null,
      counterparty_name: transaction.counterparty_name ?? null,
      status: transaction.status,
      notes: transaction.notes ?? null,
      authorized_by: transaction.authorized_by ?? null,
      created_by: transaction.created_by ?? null,
      total_amount: transaction.total_amount != null ? Number(transaction.total_amount) : null,
      warehouse: {
        id: Number(transaction.warehouses.id),
        code: transaction.warehouses.code,
        name: transaction.warehouses.name,
      },
      entries: transaction.inventory_transaction_entries.map((entry) => ({
        id: Number(entry.id),
        direction: entry.direction as MovementDirection,
        entered_unit: entry.entered_unit as InventoryUnit,
        quantity_entered: Number(entry.quantity_entered),
        unit_conversion_factor: entry.unit_conversion_factor != null ? Number(entry.unit_conversion_factor) : null,
        kit_multiplier: entry.kit_multiplier != null ? Number(entry.kit_multiplier) : null,
        cost_per_unit: entry.cost_per_unit != null ? Number(entry.cost_per_unit) : null,
        subtotal: entry.subtotal != null ? Number(entry.subtotal) : null,
        notes: entry.notes ?? null,
        article: {
          id: Number(entry.articles.id),
          article_code: entry.articles.article_code,
          name: entry.articles.name,
          retail_unit: entry.articles.retail_unit ?? null,
          storage_unit: entry.articles.storage_unit ?? null,
          conversion_factor: Number(entry.articles.conversion_factor ?? 1),
        },
        movements: entry.inventory_movements.map((movement) => ({
          id: Number(movement.id),
          direction: movement.direction as MovementDirection,
          quantity_retail: Number(movement.quantity_retail),
          warehouse: {
            id: Number(movement.warehouses.id),
            code: movement.warehouses.code,
            name: movement.warehouses.name,
          },
          article: {
            id: Number(movement.articles_inventory_movements_article_idToarticles.id),
            article_code: movement.articles_inventory_movements_article_idToarticles.article_code,
            name: movement.articles_inventory_movements_article_idToarticles.name,
            retail_unit: movement.articles_inventory_movements_article_idToarticles.retail_unit ?? null,
            storage_unit: movement.articles_inventory_movements_article_idToarticles.storage_unit ?? null,
          },
          source_kit_article_code:
            movement.articles_inventory_movements_source_kit_article_idToarticles?.article_code ?? null,
        })),
      })),
    } satisfies InventoryTransactionDocumentRecord;
  }

  async listTransactionHeaders(
    filters: InventoryTransactionHeaderFilter,
    tx?: Prisma.TransactionClient
  ): Promise<InventoryTransactionHeaderRow[]> {
    const client = tx ?? this.prisma;
    const where: Prisma.inventory_transactionsWhereInput = {};

    if (filters.transactionTypes && filters.transactionTypes.length > 0) {
      where.transaction_type = { in: filters.transactionTypes };
    }
    if (filters.warehouseCodes && filters.warehouseCodes.length > 0) {
      where.warehouses = { is: { code: { in: filters.warehouseCodes } } };
    }
    if (filters.search && filters.search.length > 0) {
      where.OR = [
        { transaction_code: { contains: filters.search, mode: "insensitive" } },
        { reference: { contains: filters.search, mode: "insensitive" } },
        { counterparty_name: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.from || filters.to) {
      where.occurred_at = {
        gte: filters.from ?? undefined,
        lte: filters.to ?? undefined,
      };
    }

    const take = Math.min(Math.max(filters.limit ?? 50, 1), 200);

    const rows = await client.inventory_transactions.findMany({
      where,
      orderBy: { occurred_at: "desc" },
      take,
      select: {
        id: true,
        transaction_code: true,
        transaction_type: true,
        occurred_at: true,
        reference: true,
        counterparty_name: true,
        status: true,
        notes: true,
        total_amount: true,
        warehouses: { select: { id: true, code: true, name: true } },
        inventory_transaction_entries: {
          select: { direction: true },
        },
      },
    });

    return rows.map((row) => {
      const entriesTotal = row.inventory_transaction_entries.length;
      const entriesIn = row.inventory_transaction_entries.filter((entry) => entry.direction === "IN").length;
      const entriesOut = entriesTotal - entriesIn;

      return {
        id: Number(row.id),
        transaction_code: row.transaction_code,
        transaction_type: row.transaction_type as TransactionType,
        occurred_at: row.occurred_at,
        reference: row.reference ?? null,
        counterparty_name: row.counterparty_name ?? null,
        status: row.status,
        total_amount: row.total_amount != null ? Number(row.total_amount) : null,
        notes: row.notes ?? null,
        warehouse: {
          id: Number(row.warehouses.id),
          code: row.warehouses.code,
          name: row.warehouses.name,
        },
        entries_count: entriesTotal,
        entries_in: entriesIn,
        entries_out: entriesOut,
      } satisfies InventoryTransactionHeaderRow;
    });
  }
}
