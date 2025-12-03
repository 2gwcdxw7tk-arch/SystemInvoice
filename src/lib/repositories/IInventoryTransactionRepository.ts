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

export interface InventoryTransactionDocumentMovement {
  id: number;
  direction: MovementDirection;
  quantity_retail: number;
  warehouse: {
    id: number;
    code: string;
    name: string;
  };
  article: {
    id: number;
    article_code: string;
    name: string;
    retail_unit: string | null;
    storage_unit: string | null;
  };
  source_kit_article_code: string | null;
}

export interface InventoryTransactionDocumentEntryRecord {
  id: number;
  direction: MovementDirection;
  entered_unit: InventoryUnit;
  quantity_entered: number;
  unit_conversion_factor: number | null;
  kit_multiplier: number | null;
  cost_per_unit: number | null;
  subtotal: number | null;
  notes: string | null;
  article: {
    id: number;
    article_code: string;
    name: string;
    retail_unit: string | null;
    storage_unit: string | null;
    conversion_factor: number;
  };
  movements: InventoryTransactionDocumentMovement[];
}

export interface InventoryTransactionDocumentRecord {
  id: number;
  transaction_code: string;
  transaction_type: TransactionType;
  occurred_at: Date;
  created_at: Date;
  reference: string | null;
  counterparty_name: string | null;
  status: string;
  notes: string | null;
  authorized_by: string | null;
  created_by: string | null;
  total_amount: number | null;
  warehouse: {
    id: number;
    code: string;
    name: string;
  };
  entries: InventoryTransactionDocumentEntryRecord[];
}

export interface InventoryTransactionHeaderRow {
  id: number;
  transaction_code: string;
  transaction_type: TransactionType;
  occurred_at: Date;
  reference: string | null;
  counterparty_name: string | null;
  status: string;
  total_amount: number | null;
  notes: string | null;
  warehouse: {
    id: number;
    code: string;
    name: string;
  };
  entries_count: number;
  entries_in: number;
  entries_out: number;
}

export interface InventoryTransactionHeaderFilter {
  transactionTypes?: TransactionType[];
  warehouseCodes?: string[];
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface IInventoryTransactionRepository {
  createTransaction(data: InventoryTransactionCreateInput, tx?: Prisma.TransactionClient): Promise<InventoryTransactionResult>;
  createTransactionEntry(data: InventoryTransactionEntryCreateInput, tx?: Prisma.TransactionClient): Promise<{ id: number }>;
  createMovement(data: InventoryMovementCreateInput, tx?: Prisma.TransactionClient): Promise<void>;
  updateTransactionTotalAmount(transactionId: number, totalAmount: Decimal | number, tx?: Prisma.TransactionClient): Promise<void>;
  findTransactionDocumentByCode(transactionCode: string, tx?: Prisma.TransactionClient): Promise<InventoryTransactionDocumentRecord | null>;
  listTransactionHeaders(filters: InventoryTransactionHeaderFilter, tx?: Prisma.TransactionClient): Promise<InventoryTransactionHeaderRow[]>;
}
