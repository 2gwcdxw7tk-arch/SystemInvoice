import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

export type MovementDirection = "IN" | "OUT";
export type TransactionType = "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT" | "TRANSFER";
export type PurchaseStatus = "PENDIENTE" | "PARCIAL" | "PAGADA";
export type InventoryUnit = "STORAGE" | "RETAIL"; // Moved from src/lib/db/inventory

export interface InventoryTransactionCreateInput {
  transaction_code: string;
  transaction_type: TransactionType;
  warehouse_id: number;
  reference?: string | null;
  counterparty_name?: string | null;
  status?: PurchaseStatus | "CONFIRMADO";
  notes?: string | null;
  occurred_at: Date;
  authorized_by?: string | null;
  created_by?: string | null;
  total_amount?: Decimal | number;
}

export interface InventoryTransactionEntryCreateInput {
  transaction_id: number;
  article_id: number;
  quantity_entered: Decimal | number;
  entered_unit: InventoryUnit; // Use InventoryUnit
  direction: MovementDirection;
  unit_conversion_factor?: Decimal | number | null;
  kit_multiplier?: Decimal | number | null;
  cost_per_unit?: Decimal | number | null;
  subtotal?: Decimal | number | null;
  notes?: string | null;
}

export interface InventoryMovementCreateInput {
  transaction_id: number;
  entry_id: number;
  article_id: number;
  direction: MovementDirection;
  quantity_retail: Decimal | number;
  warehouse_id: number;
  source_kit_article_id?: number | null;
}

export interface InventoryTransactionResult {
  id: number;
  transaction_code: string;
}

export interface IInventoryTransactionRepository {
  createTransaction(data: InventoryTransactionCreateInput, tx?: Prisma.TransactionClient): Promise<InventoryTransactionResult>;
  createTransactionEntry(data: InventoryTransactionEntryCreateInput, tx?: Prisma.TransactionClient): Promise<{ id: number }>;
  createMovement(data: InventoryMovementCreateInput, tx?: Prisma.TransactionClient): Promise<void>;
  updateTransactionTotalAmount(transactionId: number, totalAmount: Decimal | number, tx?: Prisma.TransactionClient): Promise<void>;
}
