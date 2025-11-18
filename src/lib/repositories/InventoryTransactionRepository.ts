import { PrismaClient } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import type {
  IInventoryTransactionRepository,
  InventoryTransactionCreateInput,
  InventoryTransactionEntryCreateInput,
  InventoryMovementCreateInput,
  InventoryTransactionResult,
} from "./IInventoryTransactionRepository";

export class InventoryTransactionRepository implements IInventoryTransactionRepository {
  constructor(private readonly prisma: PrismaClient = new PrismaClient()) {}

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
}
