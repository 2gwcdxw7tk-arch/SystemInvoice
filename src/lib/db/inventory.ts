import "server-only";

import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import type { PoolClient } from "@/lib/db/postgres";
import { query, withTransaction } from "@/lib/db/postgres";
import { getArticleByCode, ArticleDetail } from "@/lib/db/articles";
import { getKitComponents } from "@/lib/db/articleKits";
import { getWarehouseByCode } from "@/lib/db/warehouses";

type MovementDirection = "IN" | "OUT";
export type TransactionType = "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT" | "TRANSFER";
export type PurchaseStatus = "PENDIENTE" | "PARCIAL" | "PAGADA";

type InventoryUnit = "STORAGE" | "RETAIL";

type NumericLike = number | string;

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

type KardexQueryRow = {
  id: number;
  transaction_code: string;
  transaction_type: TransactionType;
  occurred_at: Date | string;
  direction: MovementDirection;
  quantity_retail: number;
  article_code: string;
  article_name: string;
  conversion_factor: number;
  source_kit_code: string | null;
  retail_unit: string | null;
  storage_unit: string | null;
  warehouse_code: string;
  warehouse_name: string;
  reference: string | null;
  counterparty_name: string | null;
};

type StockSummaryQueryRow = {
  article_code: string;
  article_name: string;
  warehouse_code: string;
  warehouse_name: string;
  conversion_factor: number;
  retail_unit: string | null;
  storage_unit: string | null;
  available_retail: number | null;
};

type PurchaseListRow = {
  id: number;
  transaction_code: string;
  reference: string | null;
  counterparty_name: string | null;
  occurred_at: Date | string;
  status: PurchaseStatus | null;
  total_amount: number | null;
  warehouse_name: string;
};

type ConsumptionListRow = {
  id: number;
  occurred_at: Date | string;
  article_code: string;
  article_name: string;
  reason: string | null;
  authorized_by: string | null;
  area: string | null;
  quantity_retail: number | null;
  direction: MovementDirection;
  conversion_factor: number;
  retail_unit: string | null;
  storage_unit: string | null;
  source_kit_code: string | null;
};

type TransferQueryRow = {
  id: number;
  transaction_code: string;
  occurred_at: Date | string;
  from_code: string;
  from_name: string;
  to_code: string | null;
  to_name: string | null;
  notes: string | null;
  authorized_by: string | null;
  lines_count: number | null;
};

type RegisterResult = { transaction_id: number | string; transaction_code: string };

interface MovementComputation {
  article: ArticleDetail;
  direction: MovementDirection;
  quantity_entered: number;
  quantity_retail: number;
  quantity_storage: number;
  kit_multiplier: number | null;
  components: Array<{
    article_code: string;
    article_name: string;
    quantity_retail: number;
    conversion_factor: number;
    retail_unit: string | null;
    storage_unit: string | null;
  }>;
}

let mockTransactionSeq = 1;
let mockMovementSeq = 1;

interface MockTransaction {
  id: number;
  transaction_code: string;
  transaction_type: TransactionType;
  occurred_at: string;
  reference: string | null;
  counterparty_name: string | null;
  authorized_by: string | null;
  status: PurchaseStatus | "CONFIRMADO";
  notes: string | null;
  warehouse_code: string;
  warehouse_name: string;
  target_warehouse_code?: string | null;
  target_warehouse_name?: string | null;
  total_amount: number;
  lines_count?: number;
}

interface MockMovement {
  id: number;
  transaction_id: number;
  transaction_code: string;
  transaction_type: TransactionType;
  occurred_at: string;
  article_code: string;
  article_name: string;
  conversion_factor: number;
  retail_unit: string | null;
  storage_unit: string | null;
  direction: MovementDirection;
  quantity_retail: number;
  warehouse_code: string;
  warehouse_name: string;
  reference: string | null;
  counterparty_name: string | null;
  authorized_by: string | null;
  source_kit_code: string | null;
}

const mockTransactions: MockTransaction[] = [];
const mockMovements: MockMovement[] = [];

function toNumber(value: NumericLike | undefined | null, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function parseDateInput(value?: string): Date {
  if (!value) return new Date();
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha inválida");
  }
  return date;
}

function iso(date: Date): string {
  return date.toISOString();
}

function generateTransactionCode(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

async function computeMovement(line: InventoryLineInput, type: TransactionType): Promise<MovementComputation> {
  const article = await getArticleByCode(line.article_code);
  if (!article) throw new Error(`Artículo no encontrado: ${line.article_code}`);
  const conversionFactor = Number(article.conversion_factor || 0);
  if (!(conversionFactor > 0)) throw new Error(`Artículo ${line.article_code} sin factor de conversión válido`);
  const quantity = toNumber(line.quantity);
  if (!(quantity > 0)) throw new Error(`Cantidad inválida para ${line.article_code}`);
  const unit = line.unit === "STORAGE" ? "STORAGE" : "RETAIL";
  const quantityRetail = unit === "STORAGE" ? quantity * conversionFactor : quantity;
  const quantityStorage = unit === "STORAGE" ? quantity : quantity / conversionFactor;
  const direction: MovementDirection = type === "PURCHASE" ? "IN" : type === "CONSUMPTION" ? "OUT" : quantity >= 0 ? "IN" : "OUT";
  let kit_multiplier: number | null = null;
  const components: MovementComputation["components"] = [];
  if (article.article_type === "KIT") {
    kit_multiplier = unit === "STORAGE" ? quantity : quantityRetail / conversionFactor;
    const kitComponents = await getKitComponents(article.article_code);
    const cache = new Map<string, ArticleDetail>();
    for (const component of kitComponents) {
      const compCode = component.component_article_code;
      let compArticle = cache.get(compCode);
      if (!compArticle) {
        const fetched = await getArticleByCode(compCode);
        if (!fetched) throw new Error(`Componente ${compCode} no encontrado`);
        cache.set(compCode, fetched);
        compArticle = fetched;
      }
      const compQtyRetail = (kit_multiplier || 0) * Number(component.component_qty_retail);
      components.push({
        article_code: compCode,
        article_name: compArticle.name,
        quantity_retail: compQtyRetail,
        conversion_factor: Number(compArticle.conversion_factor || 1),
        retail_unit: compArticle.retail_unit || null,
        storage_unit: compArticle.storage_unit || null,
      });
    }
  } else {
    components.push({
      article_code: article.article_code,
      article_name: article.name,
      quantity_retail: quantityRetail,
      conversion_factor: conversionFactor,
      retail_unit: article.retail_unit || null,
      storage_unit: article.storage_unit || null,
    });
  }
  return {
    article,
    direction,
    quantity_entered: quantity,
    quantity_retail: quantityRetail,
    quantity_storage: quantityStorage,
    kit_multiplier,
    components,
  };
}

async function getArticleIdByCode(client: PoolClient, articleCode: string): Promise<number> {
  const result = await client.query<{ id: number }>(
    `SELECT id FROM app.articles WHERE article_code = $1`,
    [articleCode]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Componente no registrado: ${articleCode}`);
  }
  return Number(row.id);
}

export async function registerPurchase(input: RegisterPurchaseInput): Promise<RegisterResult> {
  if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Debes incluir al menos una línea en la compra");
  }
  const warehouse = await getWarehouseByCode(input.warehouse_code);
  if (!warehouse) throw new Error(`Almacén no encontrado: ${input.warehouse_code}`);
  const occurredAt = parseDateInput(input.occurred_at);
  const transactionCode = generateTransactionCode("PUR");
  const status: PurchaseStatus = input.status && ["PENDIENTE", "PARCIAL", "PAGADA"].includes(input.status) ? input.status : "PENDIENTE";

  if (env.useMockData) {
    const transactionId = mockTransactionSeq++;
    let totalAmount = 0;
    for (const line of input.lines) {
      const movement = await computeMovement(line, "PURCHASE");
      const costPerUnit = toNumber(line.cost_per_unit, 0);
      totalAmount += costPerUnit * movement.quantity_entered;
      for (const component of movement.components) {
        const movementId = mockMovementSeq++;
        mockMovements.push({
          id: movementId,
          transaction_id: transactionId,
          transaction_code: transactionCode,
          transaction_type: "PURCHASE",
          occurred_at: iso(occurredAt),
          article_code: component.article_code,
          article_name: component.article_name,
          conversion_factor: component.conversion_factor,
          retail_unit: component.retail_unit,
          storage_unit: component.storage_unit,
          direction: "IN",
          quantity_retail: component.quantity_retail,
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
          reference: input.document_number || null,
          counterparty_name: input.supplier_name || null,
          authorized_by: null,
          source_kit_code: movement.article.article_type === "KIT" ? movement.article.article_code : null,
        });
      }
    }
    mockTransactions.push({
      id: transactionId,
      transaction_code: transactionCode,
      transaction_type: "PURCHASE",
      occurred_at: iso(occurredAt),
      reference: input.document_number || null,
      counterparty_name: input.supplier_name || null,
      authorized_by: null,
      status,
      notes: input.notes || null,
      warehouse_code: warehouse.code,
      warehouse_name: warehouse.name,
      target_warehouse_code: null,
      target_warehouse_name: null,
      total_amount: Number(totalAmount.toFixed(2)),
      lines_count: input.lines.length,
    });
    return { transaction_id: transactionId, transaction_code: transactionCode };
  }

  const result = await withTransaction(async (client) => {
    const headerResult = await client.query<{ id: number }>(
      `INSERT INTO app.inventory_transactions (
         transaction_code,
         transaction_type,
         warehouse_id,
         reference,
         counterparty_name,
         status,
         notes,
         occurred_at,
         authorized_by,
         total_amount
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING id`,
      [
        transactionCode,
        "PURCHASE",
        warehouse.id,
        input.document_number || null,
        input.supplier_name || null,
        status,
        input.notes || null,
        occurredAt,
        null,
        0,
      ]
    );
    const transactionId = Number(headerResult.rows[0].id);
    let totalAmount = 0;

    for (const line of input.lines) {
      const movement = await computeMovement(line, "PURCHASE");
      const costPerUnit = toNumber(line.cost_per_unit, 0);
      const subtotal = costPerUnit * movement.quantity_entered;
      totalAmount += subtotal;

      const entryResult = await client.query<{ id: number }>(
        `INSERT INTO app.inventory_transaction_entries (
           transaction_id,
           article_id,
           quantity_entered,
           entered_unit,
           direction,
           unit_conversion_factor,
           kit_multiplier,
           cost_per_unit,
           subtotal,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         )
         RETURNING id`,
        [
          transactionId,
          movement.article.id,
          movement.quantity_entered,
          line.unit,
          "IN",
          movement.article.conversion_factor,
          movement.kit_multiplier ?? null,
          costPerUnit || null,
          subtotal || null,
          line.notes || null,
        ]
      );
      const entryId = Number(entryResult.rows[0].id);

      if (movement.article.article_type === "KIT") {
        const kitArticleId = movement.article.id;
        if (!kitArticleId) {
          throw new Error(`Artículo kit no registrado: ${movement.article.article_code}`);
        }
        for (const component of movement.components) {
          const compId = await getArticleIdByCode(client, component.article_code);
          await client.query(
            `INSERT INTO app.inventory_movements (
               transaction_id,
               entry_id,
               article_id,
               direction,
               quantity_retail,
               warehouse_id,
               source_kit_article_id
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7
             )`,
            [
              transactionId,
              entryId,
              compId,
              "IN",
              component.quantity_retail,
              warehouse.id,
              kitArticleId,
            ]
          );
        }
      } else {
        await client.query(
          `INSERT INTO app.inventory_movements (
             transaction_id,
             entry_id,
             article_id,
             direction,
             quantity_retail,
             warehouse_id,
             source_kit_article_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7
           )`,
          [
            transactionId,
            entryId,
            movement.article.id,
            "IN",
            movement.quantity_retail,
            warehouse.id,
            null,
          ]
        );
      }
    }

    await client.query(
      `UPDATE app.inventory_transactions
       SET total_amount = $1
       WHERE id = $2`,
      [Number(totalAmount.toFixed(2)), transactionId]
    );

    return { transaction_id: transactionId, transaction_code: transactionCode };
  });

  return result;
}

export async function registerConsumption(input: RegisterConsumptionInput): Promise<RegisterResult> {
  if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Debes incluir al menos un artículo en el consumo");
  }
  const warehouse = await getWarehouseByCode(input.warehouse_code);
  if (!warehouse) throw new Error(`Almacén no encontrado: ${input.warehouse_code}`);
  const occurredAt = parseDateInput(input.occurred_at);
  const transactionCode = generateTransactionCode("CON");

  if (env.useMockData) {
    const transactionId = mockTransactionSeq++;
    for (const line of input.lines) {
      const movement = await computeMovement(line, "CONSUMPTION");
      for (const component of movement.components) {
        const movementId = mockMovementSeq++;
        mockMovements.push({
          id: movementId,
          transaction_id: transactionId,
          transaction_code: transactionCode,
          transaction_type: "CONSUMPTION",
          occurred_at: iso(occurredAt),
          article_code: component.article_code,
          article_name: component.article_name,
          conversion_factor: component.conversion_factor,
          retail_unit: component.retail_unit,
          storage_unit: component.storage_unit,
          direction: "OUT",
          quantity_retail: component.quantity_retail,
          warehouse_code: warehouse.code,
          warehouse_name: warehouse.name,
          reference: input.reason || null,
          counterparty_name: input.area || null,
          authorized_by: input.authorized_by || null,
          source_kit_code: movement.article.article_type === "KIT" ? movement.article.article_code : null,
        });
      }
    }
    mockTransactions.push({
      id: transactionId,
      transaction_code: transactionCode,
      transaction_type: "CONSUMPTION",
      occurred_at: iso(occurredAt),
      reference: input.reason || null,
      counterparty_name: input.area || null,
      authorized_by: input.authorized_by || null,
      status: "CONFIRMADO",
      notes: input.notes || null,
      warehouse_code: warehouse.code,
      warehouse_name: warehouse.name,
      target_warehouse_code: null,
      target_warehouse_name: null,
      total_amount: 0,
      lines_count: input.lines.length,
    });
    return { transaction_id: transactionId, transaction_code: transactionCode };
  }

  const result = await withTransaction(async (client) => {
    const headerResult = await client.query<{ id: number }>(
      `INSERT INTO app.inventory_transactions (
         transaction_code,
         transaction_type,
         warehouse_id,
         reference,
         counterparty_name,
         status,
         notes,
         occurred_at,
         authorized_by,
         total_amount
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING id`,
      [
        transactionCode,
        "CONSUMPTION",
        warehouse.id,
        input.reason || null,
        input.area || null,
        "CONFIRMADO",
        input.notes || null,
        occurredAt,
        input.authorized_by || null,
        0,
      ]
    );
    const transactionId = Number(headerResult.rows[0].id);

    for (const line of input.lines) {
      const movement = await computeMovement(line, "CONSUMPTION");
      const entryResult = await client.query<{ id: number }>(
        `INSERT INTO app.inventory_transaction_entries (
           transaction_id,
           article_id,
           quantity_entered,
           entered_unit,
           direction,
           unit_conversion_factor,
           kit_multiplier,
           cost_per_unit,
           subtotal,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         )
         RETURNING id`,
        [
          transactionId,
          movement.article.id,
          movement.quantity_entered,
          line.unit,
          "OUT",
          movement.article.conversion_factor,
          movement.kit_multiplier ?? null,
          null,
          null,
          line.notes || null,
        ]
      );
      const entryId = Number(entryResult.rows[0].id);

      if (movement.article.article_type === "KIT") {
        const kitArticleId = movement.article.id;
        if (!kitArticleId) {
          throw new Error(`Artículo kit no registrado: ${movement.article.article_code}`);
        }
        for (const component of movement.components) {
          const compId = await getArticleIdByCode(client, component.article_code);
          await client.query(
            `INSERT INTO app.inventory_movements (
               transaction_id,
               entry_id,
               article_id,
               direction,
               quantity_retail,
               warehouse_id,
               source_kit_article_id
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7
             )`,
            [
              transactionId,
              entryId,
              compId,
              "OUT",
              component.quantity_retail,
              warehouse.id,
              kitArticleId,
            ]
          );
        }
      } else {
        await client.query(
          `INSERT INTO app.inventory_movements (
             transaction_id,
             entry_id,
             article_id,
             direction,
             quantity_retail,
             warehouse_id,
             source_kit_article_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7
           )`,
          [
            transactionId,
            entryId,
            movement.article.id,
            "OUT",
            movement.quantity_retail,
            warehouse.id,
            null,
          ]
        );
      }
    }

    return { transaction_id: transactionId, transaction_code: transactionCode };
  });

  return result;
}

export async function registerTransfer(input: RegisterTransferInput): Promise<RegisterResult> {
  if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
    throw new Error("Debes incluir al menos una línea en el traspaso");
  }
  if (!input.from_warehouse_code || !input.to_warehouse_code) {
    throw new Error("Selecciona almacenes de origen y destino");
  }
  if (input.from_warehouse_code === input.to_warehouse_code) {
    throw new Error("El traspaso requiere almacenes distintos");
  }
  const fromWarehouse = await getWarehouseByCode(input.from_warehouse_code);
  if (!fromWarehouse) throw new Error(`Almacén origen no encontrado: ${input.from_warehouse_code}`);
  const toWarehouse = await getWarehouseByCode(input.to_warehouse_code);
  if (!toWarehouse) throw new Error(`Almacén destino no encontrado: ${input.to_warehouse_code}`);
  const occurredAt = parseDateInput(input.occurred_at);
  const transactionCode = generateTransactionCode("TRF");
  const combinedNotes = [input.notes?.trim() || "", input.requested_by?.trim() ? `Solicitado por: ${input.requested_by.trim()}` : ""]
    .filter(Boolean)
    .join(" | ") || null;

  if (env.useMockData) {
    const transactionId = mockTransactionSeq++;
    for (const line of input.lines) {
      const movement = await computeMovement(line, "PURCHASE");
      for (const component of movement.components) {
        const outMovementId = mockMovementSeq++;
        mockMovements.push({
          id: outMovementId,
          transaction_id: transactionId,
          transaction_code: transactionCode,
          transaction_type: "TRANSFER",
          occurred_at: iso(occurredAt),
          article_code: component.article_code,
          article_name: component.article_name,
          conversion_factor: component.conversion_factor,
          retail_unit: component.retail_unit,
          storage_unit: component.storage_unit,
          direction: "OUT",
          quantity_retail: component.quantity_retail,
          warehouse_code: fromWarehouse.code,
          warehouse_name: fromWarehouse.name,
          reference: input.reference || null,
          counterparty_name: toWarehouse.name,
          authorized_by: input.authorized_by || null,
          source_kit_code: movement.article.article_type === "KIT" ? movement.article.article_code : null,
        });

        const inMovementId = mockMovementSeq++;
        mockMovements.push({
          id: inMovementId,
          transaction_id: transactionId,
          transaction_code: transactionCode,
          transaction_type: "TRANSFER",
          occurred_at: iso(occurredAt),
          article_code: component.article_code,
          article_name: component.article_name,
          conversion_factor: component.conversion_factor,
          retail_unit: component.retail_unit,
          storage_unit: component.storage_unit,
          direction: "IN",
          quantity_retail: component.quantity_retail,
          warehouse_code: toWarehouse.code,
          warehouse_name: toWarehouse.name,
          reference: input.reference || null,
          counterparty_name: fromWarehouse.name,
          authorized_by: input.authorized_by || null,
          source_kit_code: movement.article.article_type === "KIT" ? movement.article.article_code : null,
        });
      }
    }

    mockTransactions.push({
      id: transactionId,
      transaction_code: transactionCode,
      transaction_type: "TRANSFER",
      occurred_at: iso(occurredAt),
      reference: input.reference || null,
      counterparty_name: toWarehouse.name,
      authorized_by: input.authorized_by || null,
      status: "CONFIRMADO",
      notes: combinedNotes,
      warehouse_code: fromWarehouse.code,
      warehouse_name: fromWarehouse.name,
      target_warehouse_code: toWarehouse.code,
      target_warehouse_name: toWarehouse.name,
      total_amount: 0,
      lines_count: input.lines.length,
    });
    return { transaction_id: transactionId, transaction_code: transactionCode };
  }

  const result = await withTransaction(async (client) => {
    const headerResult = await client.query<{ id: number }>(
      `INSERT INTO app.inventory_transactions (
         transaction_code,
         transaction_type,
         warehouse_id,
         reference,
         counterparty_name,
         status,
         notes,
         occurred_at,
         authorized_by,
         total_amount
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING id`,
      [
        transactionCode,
        "TRANSFER",
        fromWarehouse.id,
        input.reference || null,
        toWarehouse.name,
        "CONFIRMADO",
        combinedNotes,
        occurredAt,
        input.authorized_by || null,
        0,
      ]
    );
    const transactionId = Number(headerResult.rows[0].id);

    for (const line of input.lines) {
      const movement = await computeMovement(line, "PURCHASE");
      const kitArticleId = movement.article.article_type === "KIT" ? movement.article.id : null;

      const exitEntryResult = await client.query<{ id: number }>(
        `INSERT INTO app.inventory_transaction_entries (
           transaction_id,
           article_id,
           quantity_entered,
           entered_unit,
           direction,
           unit_conversion_factor,
           kit_multiplier,
           cost_per_unit,
           subtotal,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         )
         RETURNING id`,
        [
          transactionId,
          movement.article.id,
          movement.quantity_entered,
          line.unit,
          "OUT",
          movement.article.conversion_factor,
          movement.kit_multiplier ?? null,
          null,
          null,
          line.notes || null,
        ]
      );
      const exitEntryId = Number(exitEntryResult.rows[0].id);

      if (movement.article.article_type === "KIT") {
        if (!kitArticleId) {
          throw new Error(`Artículo kit no registrado: ${movement.article.article_code}`);
        }
        for (const component of movement.components) {
          const compId = await getArticleIdByCode(client, component.article_code);
          await client.query(
            `INSERT INTO app.inventory_movements (
               transaction_id,
               entry_id,
               article_id,
               direction,
               quantity_retail,
               warehouse_id,
               source_kit_article_id
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7
             )`,
            [
              transactionId,
              exitEntryId,
              compId,
              "OUT",
              component.quantity_retail,
              fromWarehouse.id,
              kitArticleId,
            ]
          );
        }
      } else {
        await client.query(
          `INSERT INTO app.inventory_movements (
             transaction_id,
             entry_id,
             article_id,
             direction,
             quantity_retail,
             warehouse_id,
             source_kit_article_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7
           )`,
          [
            transactionId,
            exitEntryId,
            movement.article.id,
            "OUT",
            movement.quantity_retail,
            fromWarehouse.id,
            null,
          ]
        );
      }

      const entryResult = await client.query<{ id: number }>(
        `INSERT INTO app.inventory_transaction_entries (
           transaction_id,
           article_id,
           quantity_entered,
           entered_unit,
           direction,
           unit_conversion_factor,
           kit_multiplier,
           cost_per_unit,
           subtotal,
           notes
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         )
         RETURNING id`,
        [
          transactionId,
          movement.article.id,
          movement.quantity_entered,
          line.unit,
          "IN",
          movement.article.conversion_factor,
          movement.kit_multiplier ?? null,
          null,
          null,
          line.notes || null,
        ]
      );
      const entryId = Number(entryResult.rows[0].id);

      if (movement.article.article_type === "KIT") {
        if (!kitArticleId) {
          throw new Error(`Artículo kit no registrado: ${movement.article.article_code}`);
        }
        for (const component of movement.components) {
          const compId = await getArticleIdByCode(client, component.article_code);
          await client.query(
            `INSERT INTO app.inventory_movements (
               transaction_id,
               entry_id,
               article_id,
               direction,
               quantity_retail,
               warehouse_id,
               source_kit_article_id
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7
             )`,
            [
              transactionId,
              entryId,
              compId,
              "IN",
              component.quantity_retail,
              toWarehouse.id,
              kitArticleId,
            ]
          );
        }
      } else {
        await client.query(
          `INSERT INTO app.inventory_movements (
             transaction_id,
             entry_id,
             article_id,
             direction,
             quantity_retail,
             warehouse_id,
             source_kit_article_id
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7
           )`,
          [
            transactionId,
            entryId,
            movement.article.id,
            "IN",
            movement.quantity_retail,
            toWarehouse.id,
            null,
          ]
        );
      }
    }

    return { transaction_id: transactionId, transaction_code: transactionCode };
  });

  return result;
}

export async function listTransfers(filters: TransferFilter = {}): Promise<TransferListItem[]> {
  if (env.useMockData) {
    let rows = mockTransactions.filter((tx) => tx.transaction_type === "TRANSFER");
    if (filters.from_warehouse_code) {
      rows = rows.filter((tx) => tx.warehouse_code === filters.from_warehouse_code);
    }
    if (filters.to_warehouse_code) {
      rows = rows.filter((tx) => tx.target_warehouse_code === filters.to_warehouse_code);
    }
    if (filters.from) {
      const fromIso = parseDateInput(filters.from).toISOString();
      rows = rows.filter((tx) => tx.occurred_at >= fromIso);
    }
    if (filters.to) {
      const upper = parseDateInput(filters.to);
      const upperIso = new Date(upper.getTime() + 24 * 60 * 60 * 1000).toISOString();
      rows = rows.filter((tx) => tx.occurred_at < upperIso);
    }
    if (filters.article) {
      const articleFilter = filters.article;
      rows = rows.filter((tx) =>
        mockMovements.some(
          (mov) =>
            mov.transaction_id === tx.id &&
            mov.transaction_type === "TRANSFER" &&
            (matchesLike(mov.article_code, articleFilter) || matchesLike(mov.article_name, articleFilter) || matchesLike(mov.source_kit_code, articleFilter))
        )
      );
    }
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return rows.map((tx) => ({
      id: `mock-${tx.id}`,
      transaction_code: tx.transaction_code,
      occurred_at: tx.occurred_at,
      from_warehouse_code: tx.warehouse_code,
      from_warehouse_name: tx.warehouse_name,
      to_warehouse_code: tx.target_warehouse_code || "",
      to_warehouse_name: tx.target_warehouse_name || "",
      lines_count: tx.lines_count ?? 0,
      notes: tx.notes || null,
      authorized_by: tx.authorized_by || null,
    }));
  }

  const params: unknown[] = [];
  const conditions: string[] = ["t.transaction_type = 'TRANSFER'"];

  if (filters.from_warehouse_code) {
    params.push(filters.from_warehouse_code.toUpperCase());
    conditions.push(`UPPER(wf.code) = $${params.length}`);
  }
  if (filters.to_warehouse_code) {
    params.push(filters.to_warehouse_code.toUpperCase());
    conditions.push(`dest.to_code IS NOT NULL AND UPPER(dest.to_code) = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`t.occurred_at::date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`t.occurred_at::date <= $${params.length}`);
  }
  if (filters.article) {
    params.push(`%${filters.article.toUpperCase()}%`);
    const placeholder = `$${params.length}`;
    conditions.push(`EXISTS (
      SELECT 1
      FROM app.inventory_movements mov
      INNER JOIN app.articles art ON art.id = mov.article_id
      LEFT JOIN app.articles kit ON kit.id = mov.source_kit_article_id
      WHERE mov.transaction_id = t.id
        AND (
          UPPER(art.article_code) LIKE ${placeholder} OR
          UPPER(art.name) LIKE ${placeholder} OR
          UPPER(kit.article_code) LIKE ${placeholder}
        )
    )`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query<TransferQueryRow>(
    `WITH dest AS (
       SELECT t.id,
              MAX(CASE WHEN m.direction = 'IN' THEN w.code END) AS to_code,
              MAX(CASE WHEN m.direction = 'IN' THEN w.name END) AS to_name
       FROM app.inventory_transactions t
       LEFT JOIN app.inventory_movements m ON m.transaction_id = t.id
       LEFT JOIN app.warehouses w ON w.id = m.warehouse_id
       WHERE t.transaction_type = 'TRANSFER'
       GROUP BY t.id
     )
     SELECT t.id,
            t.transaction_code,
            t.occurred_at,
            t.notes,
            t.authorized_by,
            wf.code AS from_code,
            wf.name AS from_name,
            dest.to_code,
            dest.to_name,
            (
              SELECT COUNT(*)
              FROM app.inventory_transaction_entries e
              WHERE e.transaction_id = t.id AND e.direction = 'OUT'
            ) AS lines_count
     FROM app.inventory_transactions t
     INNER JOIN app.warehouses wf ON wf.id = t.warehouse_id
     LEFT JOIN dest ON dest.id = t.id
     ${whereClause}
     ORDER BY t.occurred_at DESC, t.id DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: `sql-${row.id}`,
    transaction_code: row.transaction_code,
    occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
    from_warehouse_code: row.from_code,
    from_warehouse_name: row.from_name,
    to_warehouse_code: row.to_code ? row.to_code : "N/D",
    to_warehouse_name: row.to_name ? row.to_name : "No definido",
    lines_count: row.lines_count ?? 0,
    notes: row.notes || null,
    authorized_by: row.authorized_by || null,
  }));
}

function matchesLike(value: string | null | undefined, filter?: string): boolean {
  if (!filter) return true;
  const f = filter.toLowerCase();
  return value ? value.toLowerCase().includes(f) : false;
}

export async function listKardex(filters: KardexFilter = {}): Promise<KardexMovementRow[]> {
  if (env.useMockData) {
    let rows = mockMovements.slice();
    if (filters.article) {
      rows = rows.filter((row) => matchesLike(row.article_code, filters.article) || matchesLike(row.article_name, filters.article) || matchesLike(row.source_kit_code, filters.article));
    }
    if (filters.warehouse_code) {
      rows = rows.filter((row) => row.warehouse_code === filters.warehouse_code);
    }
    if (filters.from) {
      const from = parseDateInput(filters.from).toISOString();
      rows = rows.filter((row) => row.occurred_at >= from);
    }
    if (filters.to) {
      const to = parseDateInput(filters.to);
      const upper = new Date(to.getTime() + 24 * 60 * 60 * 1000).toISOString();
      rows = rows.filter((row) => row.occurred_at < upper);
    }
    rows.sort((a, b) => (a.occurred_at === b.occurred_at ? a.id - b.id : a.occurred_at.localeCompare(b.occurred_at)));
    const balances = new Map<string, number>();
    return rows.map((row) => {
      const key = `${row.article_code}:${row.warehouse_code}`;
      const prev = balances.get(key) ?? 0;
      const delta = row.direction === "IN" ? row.quantity_retail : -row.quantity_retail;
      const next = prev + delta;
      balances.set(key, next);
      const quantityStorage = row.conversion_factor > 0 ? row.quantity_retail / row.conversion_factor : row.quantity_retail;
      const balanceStorage = row.conversion_factor > 0 ? next / row.conversion_factor : next;
      return {
        id: `mock-${row.id}`,
        occurred_at: row.occurred_at,
        transaction_type: row.transaction_type,
        transaction_code: row.transaction_code,
        article_code: row.article_code,
        article_name: row.article_name,
        direction: row.direction,
        quantity_retail: row.quantity_retail,
        quantity_storage: quantityStorage,
        retail_unit: row.retail_unit,
        storage_unit: row.storage_unit,
        reference: row.reference,
        counterparty_name: row.counterparty_name,
        warehouse_code: row.warehouse_code,
        warehouse_name: row.warehouse_name,
        source_kit_code: row.source_kit_code,
        balance_retail: next,
        balance_storage: balanceStorage,
      } satisfies KardexMovementRow;
    });
  }

  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.article) {
    params.push(`%${filters.article.toUpperCase()}%`);
    const placeholder = `$${params.length}`;
    clauses.push(`(
      UPPER(a.article_code) LIKE ${placeholder}
      OR UPPER(a.name) LIKE ${placeholder}
      OR UPPER(kit.article_code) LIKE ${placeholder}
    )`);
  }
  if (filters.warehouse_code) {
    params.push(filters.warehouse_code.toUpperCase());
    clauses.push(`UPPER(w.code) = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`t.occurred_at::date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`t.occurred_at::date <= $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await query<KardexQueryRow>(
    `SELECT
       m.id,
       t.transaction_code,
       t.transaction_type,
       t.occurred_at,
       m.direction,
       m.quantity_retail,
       a.article_code,
       a.name AS article_name,
       a.conversion_factor,
       kit.article_code AS source_kit_code,
       ru.name AS retail_unit,
       su.name AS storage_unit,
       w.code AS warehouse_code,
       w.name AS warehouse_name,
       t.reference,
       t.counterparty_name
     FROM app.inventory_movements m
     INNER JOIN app.inventory_transactions t ON t.id = m.transaction_id
     INNER JOIN app.articles a ON a.id = m.article_id
     INNER JOIN app.warehouses w ON w.id = m.warehouse_id
     LEFT JOIN app.articles kit ON kit.id = m.source_kit_article_id
     LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
     LEFT JOIN app.units su ON su.id = a.storage_unit_id
     ${whereClause}
     ORDER BY t.occurred_at ASC, m.id ASC`,
    params
  );
  const balances = new Map<string, number>();
  return result.rows.map((row) => {
    const key = `${row.article_code}:${row.warehouse_code}`;
    const prev = balances.get(key) ?? 0;
    const quantityRetail = Number(row.quantity_retail ?? 0);
    const delta = row.direction === "IN" ? quantityRetail : -quantityRetail;
    const next = prev + delta;
    balances.set(key, next);
    const conversionFactor = Number(row.conversion_factor || 0);
    const quantityStorage = conversionFactor > 0 ? quantityRetail / conversionFactor : quantityRetail;
    const balanceStorage = conversionFactor > 0 ? next / conversionFactor : next;
    return {
      id: `sql-${row.id}`,
      occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
      transaction_type: row.transaction_type as TransactionType,
      transaction_code: row.transaction_code,
      article_code: row.article_code,
      article_name: row.article_name,
      direction: row.direction as MovementDirection,
      quantity_retail: quantityRetail,
      quantity_storage: quantityStorage,
      retail_unit: row.retail_unit || null,
      storage_unit: row.storage_unit || null,
      reference: row.reference || null,
      counterparty_name: row.counterparty_name || null,
      warehouse_code: row.warehouse_code,
      warehouse_name: row.warehouse_name,
      source_kit_code: row.source_kit_code || null,
      balance_retail: next,
      balance_storage: balanceStorage,
    } satisfies KardexMovementRow;
  });
}

export async function getStockSummary(filters: StockFilter = {}): Promise<StockSummaryRow[]> {
  if (env.useMockData) {
    const aggregated = new Map<string, StockSummaryRow & { conversion_factor: number }>();
    for (const movement of mockMovements) {
      if (movement.transaction_type === "CONSUMPTION" && movement.direction === "IN") continue;
      if (filters.article && !matchesLike(movement.article_code, filters.article) && !matchesLike(movement.article_name, filters.article)) continue;
      if (filters.warehouse_code && movement.warehouse_code !== filters.warehouse_code) continue;
      const key = `${movement.article_code}:${movement.warehouse_code}`;
      let entry = aggregated.get(key);
      if (!entry) {
        entry = {
          article_code: movement.article_code,
          article_name: movement.article_name,
          warehouse_code: movement.warehouse_code,
          warehouse_name: movement.warehouse_name,
          available_retail: 0,
          available_storage: 0,
          retail_unit: movement.retail_unit,
          storage_unit: movement.storage_unit,
          conversion_factor: movement.conversion_factor,
        };
        aggregated.set(key, entry);
      }
      const delta = movement.direction === "IN" ? movement.quantity_retail : -movement.quantity_retail;
      entry.available_retail += delta;
      const factor = entry.conversion_factor > 0 ? entry.conversion_factor : 1;
      entry.available_storage = entry.available_retail / factor;
    }
    return Array.from(aggregated.values()).map((value) => {
      const { conversion_factor: factor, available_retail, available_storage, ...rest } = value;
      const normalizedStorage = factor > 0 ? available_retail / factor : available_storage;
      return {
        ...rest,
        available_retail: Number(available_retail.toFixed(4)),
        available_storage: Number(normalizedStorage.toFixed(4)),
      } satisfies StockSummaryRow;
    });
  }

  const params: unknown[] = [];
  const clauses: string[] = [];

  if (filters.article) {
    params.push(`%${filters.article.toUpperCase()}%`);
    const placeholder = `$${params.length}`;
    clauses.push(`(
      UPPER(a.article_code) LIKE ${placeholder}
      OR UPPER(a.name) LIKE ${placeholder}
    )`);
  }
  if (filters.warehouse_code) {
    params.push(filters.warehouse_code.toUpperCase());
    clauses.push(`UPPER(w.code) = $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await query<StockSummaryQueryRow>(
    `SELECT
       a.article_code,
       a.name AS article_name,
       w.code AS warehouse_code,
       w.name AS warehouse_name,
       a.conversion_factor,
       ru.name AS retail_unit,
       su.name AS storage_unit,
       SUM(CASE WHEN m.direction = 'IN' THEN m.quantity_retail ELSE -m.quantity_retail END) AS available_retail
     FROM app.inventory_movements m
     INNER JOIN app.inventory_transactions t ON t.id = m.transaction_id
     INNER JOIN app.articles a ON a.id = m.article_id
     INNER JOIN app.warehouses w ON w.id = m.warehouse_id
     LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
     LEFT JOIN app.units su ON su.id = a.storage_unit_id
     ${whereClause}
     GROUP BY a.article_code, a.name, w.code, w.name, a.conversion_factor, ru.name, su.name
     ORDER BY a.article_code, w.code`,
    params
  );
  return result.rows.map((row) => {
    const availableRetail = Number(row.available_retail || 0);
    const conversionFactor = Number(row.conversion_factor || 0) || 1;
    return {
      article_code: row.article_code,
      article_name: row.article_name,
      warehouse_code: row.warehouse_code,
      warehouse_name: row.warehouse_name,
      available_retail: Number(availableRetail.toFixed(4)),
      available_storage: Number((availableRetail / conversionFactor).toFixed(4)),
      retail_unit: row.retail_unit || null,
      storage_unit: row.storage_unit || null,
    } satisfies StockSummaryRow;
  });
}

export async function listPurchases(filters: PurchaseListFilter = {}): Promise<PurchaseListItem[]> {
  if (env.useMockData) {
    let rows = mockTransactions.filter((tx) => tx.transaction_type === "PURCHASE");
    if (filters.supplier) rows = rows.filter((tx) => matchesLike(tx.counterparty_name, filters.supplier));
    if (filters.status) rows = rows.filter((tx) => tx.status === filters.status);
    if (filters.from) {
      const from = parseDateInput(filters.from).toISOString();
      rows = rows.filter((tx) => tx.occurred_at >= from);
    }
    if (filters.to) {
      const to = parseDateInput(filters.to);
      const upper = new Date(to.getTime() + 24 * 60 * 60 * 1000).toISOString();
      rows = rows.filter((tx) => tx.occurred_at < upper);
    }
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return rows.map((tx) => ({
      id: `mock-${tx.id}`,
      transaction_code: tx.transaction_code,
      document_number: tx.reference,
      supplier_name: tx.counterparty_name,
      occurred_at: tx.occurred_at,
      status: (tx.status as PurchaseStatus) ?? "PENDIENTE",
      total_amount: Number((tx.total_amount || 0).toFixed(2)),
      warehouse_name: tx.warehouse_name,
    }));
  }

  const params: unknown[] = [];
  const clauses: string[] = ["t.transaction_type = 'PURCHASE'"];

  if (filters.supplier) {
    params.push(`%${filters.supplier.toUpperCase()}%`);
    clauses.push(`UPPER(t.counterparty_name) LIKE $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`t.status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`t.occurred_at::date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`t.occurred_at::date <= $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await query<PurchaseListRow>(
    `SELECT
       t.id,
       t.transaction_code,
       t.reference,
       t.counterparty_name,
       t.occurred_at,
       t.status,
       t.total_amount,
       w.name AS warehouse_name
     FROM app.inventory_transactions t
     INNER JOIN app.warehouses w ON w.id = t.warehouse_id
     ${whereClause}
     ORDER BY t.occurred_at DESC, t.id DESC`,
    params
  );
  return result.rows.map((row) => {
    const rawAmount = row.total_amount ?? 0;
    return {
      id: `sql-${row.id}`,
      transaction_code: row.transaction_code,
      document_number: row.reference || null,
      supplier_name: row.counterparty_name || null,
      occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
      status: row.status ?? "PENDIENTE",
      total_amount: Number(rawAmount.toFixed(2)),
      warehouse_name: row.warehouse_name,
    } satisfies PurchaseListItem;
  });
}

export async function listConsumptions(filters: ConsumptionListFilter = {}): Promise<ConsumptionMovementRow[]> {
  if (env.useMockData) {
    const transactionsMap = new Map<number, MockTransaction>();
    for (const tx of mockTransactions) {
      transactionsMap.set(tx.id, tx);
    }
    let rows = mockMovements.filter((movement) => movement.transaction_type === "CONSUMPTION" && movement.direction === "OUT");
    if (filters.article) rows = rows.filter((row) => matchesLike(row.article_code, filters.article) || matchesLike(row.article_name, filters.article));
    if (filters.from) {
      const from = parseDateInput(filters.from).toISOString();
      rows = rows.filter((row) => row.occurred_at >= from);
    }
    if (filters.to) {
      const to = parseDateInput(filters.to);
      const upper = new Date(to.getTime() + 24 * 60 * 60 * 1000).toISOString();
      rows = rows.filter((row) => row.occurred_at < upper);
    }
    rows.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return rows.map((row) => {
      const tx = transactionsMap.get(row.transaction_id);
      const conversionFactor = row.conversion_factor > 0 ? row.conversion_factor : 1;
      return {
        id: `mock-${row.id}`,
        occurred_at: row.occurred_at,
        article_code: row.article_code,
        article_name: row.article_name,
        reason: tx?.reference || row.reference,
        authorized_by: tx?.authorized_by || row.authorized_by,
        area: tx?.counterparty_name || row.counterparty_name,
        direction: row.direction,
        quantity_retail: row.quantity_retail,
        quantity_storage: row.quantity_retail / conversionFactor,
        retail_unit: row.retail_unit,
        storage_unit: row.storage_unit,
        source_kit_code: row.source_kit_code,
      };
    });
  }

  const params: unknown[] = [];
  const clauses: string[] = ["m.direction = 'OUT'", "t.transaction_type = 'CONSUMPTION'"];

  if (filters.article) {
    params.push(`%${filters.article.toUpperCase()}%`);
    const placeholder = `$${params.length}`;
    clauses.push(`(
      UPPER(a.article_code) LIKE ${placeholder}
      OR UPPER(a.name) LIKE ${placeholder}
      OR UPPER(kit.article_code) LIKE ${placeholder}
    )`);
  }
  if (filters.from) {
    params.push(filters.from);
    clauses.push(`t.occurred_at::date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    clauses.push(`t.occurred_at::date <= $${params.length}`);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await query<ConsumptionListRow>(
    `SELECT
       m.id,
       t.occurred_at,
       a.article_code,
       a.name AS article_name,
       t.reference AS reason,
       t.authorized_by,
       t.counterparty_name AS area,
       m.quantity_retail,
       m.direction,
       a.conversion_factor,
       ru.name AS retail_unit,
       su.name AS storage_unit,
       kit.article_code AS source_kit_code
     FROM app.inventory_movements m
     INNER JOIN app.inventory_transactions t ON t.id = m.transaction_id
     INNER JOIN app.articles a ON a.id = m.article_id
     LEFT JOIN app.articles kit ON kit.id = m.source_kit_article_id
     LEFT JOIN app.units ru ON ru.id = a.retail_unit_id
     LEFT JOIN app.units su ON su.id = a.storage_unit_id
     ${whereClause}
     ORDER BY t.occurred_at DESC, m.id DESC`,
    params
  );
  return result.rows.map((row) => {
    const conversionFactor = Number(row.conversion_factor || 0) || 1;
    const quantityRetail = Number(row.quantity_retail || 0);
    return {
      id: `sql-${row.id}`,
      occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
      article_code: row.article_code,
      article_name: row.article_name,
      reason: row.reason || null,
      authorized_by: row.authorized_by || null,
      area: row.area || null,
      direction: row.direction,
      quantity_retail: quantityRetail,
      quantity_storage: quantityRetail / conversionFactor,
      retail_unit: row.retail_unit || null,
      storage_unit: row.storage_unit || null,
      source_kit_code: row.source_kit_code || null,
    } satisfies ConsumptionMovementRow;
  });
}
