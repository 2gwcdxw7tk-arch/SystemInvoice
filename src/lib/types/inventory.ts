import { Prisma } from "@prisma/client";

export type MovementDirection = "IN" | "OUT";
export type TransactionType = "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT" | "TRANSFER";
export type PurchaseStatus = "PENDIENTE" | "PARCIAL" | "PAGADA";
export type InventoryUnit = "RETAIL" | "STORAGE";

export interface InventoryLineInput {
  article_code: string;
  quantity: NumericLike;
  unit: InventoryUnit;
  cost_per_unit?: NumericLike | null;
  notes?: string | null;
}

export interface RegisterPurchaseInput {
  document_number: string;
  supplier_name: string;
  occurred_at?: string;
  status?: PurchaseStatus;
  warehouse_code: string;
  notes?: string | null;
  lines: InventoryLineInput[];
}

export interface RegisterConsumptionInput {
  reason: string;
  occurred_at?: string;
  authorized_by: string;
  area?: string | null;
  warehouse_code: string;
  notes?: string | null;
  lines: Array<Omit<InventoryLineInput, "cost_per_unit"> & { cost_per_unit?: NumericLike | null }>;
}

export interface RegisterTransferInput {
  from_warehouse_code: string;
  to_warehouse_code: string;
  occurred_at?: string;
  authorized_by?: string | null;
  requested_by?: string | null;
  notes?: string | null;
  reference?: string | null;
  lines: Array<Omit<InventoryLineInput, "cost_per_unit">>;
}

export interface InvoiceConsumptionLineInput {
  article_code: string;
  quantity: NumericLike;
  unit?: InventoryUnit;
  warehouse_code?: string | null;
}

export interface RegisterInvoiceMovementsInput {
  invoiceId?: number;
  invoiceNumber: string;
  invoiceDate: Date;
  tableCode?: string | null;
  customerName?: string | null;
  lines: InvoiceConsumptionLineInput[];
  client?: Prisma.TransactionClient;
}

export interface KardexFilter {
  article?: string;
  from?: string;
  to?: string;
  warehouse_code?: string;
}

export interface StockFilter {
  article?: string;
  warehouse_code?: string;
}

export interface PurchaseListFilter {
  supplier?: string;
  status?: PurchaseStatus | "";
  from?: string;
  to?: string;
}

export interface ConsumptionListFilter {
  article?: string;
  from?: string;
  to?: string;
}

export interface KardexMovementRow {
  id: string;
  occurred_at: string;
  transaction_type: TransactionType;
  transaction_code: string;
  article_code: string;
  article_name: string;
  direction: MovementDirection;
  quantity_retail: number;
  quantity_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
  reference: string | null;
  counterparty_name: string | null;
  warehouse_code: string;
  warehouse_name: string;
  source_kit_code: string | null;
  balance_retail: number;
  balance_storage: number;
}

export interface StockSummaryRow {
  article_code: string;
  article_name: string;
  warehouse_code: string;
  warehouse_name: string;
  available_retail: number;
  available_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
}

export interface PurchaseListItem {
  id: string;
  transaction_code: string;
  document_number: string | null;
  supplier_name: string | null;
  occurred_at: string;
  status: PurchaseStatus;
  total_amount: number;
  warehouse_name: string;
}

export interface ConsumptionMovementRow {
  id: string;
  occurred_at: string;
  article_code: string;
  article_name: string;
  reason: string | null;
  authorized_by: string | null;
  area: string | null;
  direction: MovementDirection;
  quantity_retail: number;
  quantity_storage: number;
  retail_unit: string | null;
  storage_unit: string | null;
  source_kit_code: string | null;
}

export interface TransferListItem {
  id: string;
  transaction_code: string;
  occurred_at: string;
  from_warehouse_code: string;
  from_warehouse_name: string;
  to_warehouse_code: string;
  to_warehouse_name: string;
  lines_count: number;
  notes: string | null;
  authorized_by: string | null;
}

export interface TransferFilter {
  article?: string;
  from_warehouse_code?: string;
  to_warehouse_code?: string;
  from?: string;
  to?: string;
}

type NumericLike = number | string; // Re-defined here for local use
