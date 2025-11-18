import { Prisma } from "@prisma/client";

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
  total_amount?: Prisma.Decimal | number;
}

export interface InventoryTransactionEntryCreateInput {
  transaction_id: bigint;
  article_id: bigint;
  quantity_entered: Prisma.Decimal | number;
  entered_unit: InventoryUnit; // Use InventoryUnit
  direction: MovementDirection;
  unit_conversion_factor?: Prisma.Decimal | number | null;
  kit_multiplier?: Prisma.Decimal | number | null;
  cost_per_unit?: Prisma.Decimal | number | null;
  subtotal?: Prisma.Decimal | number | null;
  notes?: string | null;
}

export interface InventoryMovementCreateInput {
  transaction_id: bigint;
  entry_id: bigint;
  article_id: bigint;
  direction: MovementDirection;
  quantity_retail: Prisma.Decimal | number;
  warehouse_id: number;
  source_kit_article_id?: bigint | null;
}

export interface InventoryTransactionResult {
  id: bigint;
  transaction_code: string;
}

export interface IInventoryTransactionRepository {
  createTransaction(data: InventoryTransactionCreateInput, tx?: Prisma.TransactionClient): Promise<InventoryTransactionResult>;
  createTransactionEntry(data: InventoryTransactionEntryCreateInput, tx?: Prisma.TransactionClient): Promise<{ id: bigint }>;
  createMovement(data: InventoryMovementCreateInput, tx?: Prisma.TransactionClient): Promise<void>;
  updateTransactionTotalAmount(transactionId: bigint, totalAmount: Prisma.Decimal | number, tx?: Prisma.TransactionClient): Promise<void>;
}
