import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import type { Prisma } from "@prisma/client";

import type {
  MovementDirection,
  TransactionType,
  PurchaseStatus,
  InventoryUnit,
  InventoryLineInput,
  NumericLike,
  RegisterPurchaseInput,
  RegisterConsumptionInput,
  RegisterTransferInput,
  RegisterInvoiceMovementsInput,
  KardexFilter,
  StockFilter,
  PurchaseListFilter,
  ConsumptionListFilter,
  TransferFilter,
  KardexMovementRow,
  StockSummaryRow,
  PurchaseListItem,
  ConsumptionMovementRow,
  TransferListItem,
  InventoryTransactionResult,
} from "@/lib/types/inventory"; // Changed import path

import { IArticleRepository } from "@/lib/repositories/IArticleRepository";
import { ArticleRepository } from "@/lib/repositories/ArticleRepository";
import { IArticleKitRepository } from "@/lib/repositories/IArticleKitRepository";
import { ArticleKitRepository } from "@/lib/repositories/ArticleKitRepository";
import { IWarehouseRepository } from "@/lib/repositories/IWarehouseRepository";
import { WarehouseRepository } from "@/lib/repositories/WarehouseRepository";
import { IInventoryTransactionRepository } from "@/lib/repositories/IInventoryTransactionRepository";
import { InventoryTransactionRepository } from "@/lib/repositories/InventoryTransactionRepository";
import { IWarehouseStockRepository } from "@/lib/repositories/IWarehouseStockRepository";
import { WarehouseStockRepository } from "@/lib/repositories/WarehouseStockRepository";
import { PrismaClient } from "@/lib/db/prisma"; // Import PrismaClient for transaction context

interface ArticleDetail {
  id: number;
  article_code: string;
  name: string;
  conversion_factor: number; // Changed to number for compatibility with math operations
  article_type: string;
  default_warehouse_id: number | null | undefined;
  retail_unit: string | null;
  storage_unit: string | null;
}

interface WarehouseContext {
  id: number;
  code: string;
  name: string;
}

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

function normalizeQuantity(value: number, epsilon = 1e-6): number {
  if (Math.abs(value) < epsilon) {
    return 0;
  }
  return value;
}

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

function generateTransactionCode(prefix: string): string {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export class InventoryService {
  constructor(
    private readonly articleRepository: IArticleRepository = new ArticleRepository(),
    private readonly articleKitRepository: IArticleKitRepository = new ArticleKitRepository(),
    private readonly warehouseRepository: IWarehouseRepository = new WarehouseRepository(),
    private readonly inventoryTransactionRepository: IInventoryTransactionRepository = new InventoryTransactionRepository(),
    private readonly warehouseStockRepository: IWarehouseStockRepository = new WarehouseStockRepository(),
    private readonly prisma: PrismaClient = new PrismaClient(), // Added for transaction context
  ) {}

  private async computeMovement(
    line: InventoryLineInput,
    type: TransactionType,
    preloadedArticle?: ArticleDetail | null,
    tx?: Prisma.TransactionClient
  ): Promise<MovementComputation> {
    const article = preloadedArticle ?? await this.articleRepository.getArticleByCode(line.article_code, tx);
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
      const kitComponents = await this.articleKitRepository.getKitComponents(article.article_code, tx);
      const cache = new Map<string, ArticleDetail>(); // Cache for components
      for (const component of kitComponents) {
        const compCode = component.component_article_code;
        let compArticle = cache.get(compCode);
        if (!compArticle) {
          const fetched = await this.articleRepository.getArticleByCode(compCode, tx);
          if (!fetched) throw new Error(`Componente ${compCode} no encontrado`);
          cache.set(compCode, fetched);
          compArticle = fetched;
        }
        if (!compArticle) throw new Error(`Componente ${compCode} no encontrado después de cachear`); // Added null check
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

  private async getArticleIdByCode(articleCode: string, tx?: Prisma.TransactionClient): Promise<number> {
    const article = await this.articleRepository.getArticleByCode(articleCode, tx);
    if (!article) {
      throw new Error(`Componente no registrado: ${articleCode}`);
    }
    return Number(article.id);
  }

  private async applyStockDelta(
    params: {
      articleId: number;
      articleCode?: string;
      warehouse: WarehouseContext;
      deltaRetail: number;
      conversionFactor: number;
    },
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const currentStock = await this.warehouseStockRepository.getArticleStock(
      params.articleId,
      params.warehouse.id,
      tx
    );

    const currentRetail = currentStock ? Number(currentStock.quantity_retail) : 0;
    const nextRetail = currentRetail + params.deltaRetail;

    if (nextRetail < -1e-6) {
      throw new Error(
        `Existencias insuficientes para ${params.articleCode ?? params.articleId} en la bodega ${params.warehouse.code}.`
      );
    }

    const safeRetail = normalizeQuantity(Math.max(nextRetail, 0));
    const conversion = params.conversionFactor > 0 ? params.conversionFactor : 1;
    const safeStorage = normalizeQuantity(Math.max(safeRetail / conversion, 0));

    await this.warehouseStockRepository.upsertArticleStock(
      {
        article_id: params.articleId,
        warehouse_id: params.warehouse.id,
        quantity_retail: safeRetail,
        quantity_storage: safeStorage,
      },
      tx
    );
  }

  async registerPurchase(input: RegisterPurchaseInput): Promise<{ id: number; transaction_code: string }> {
    if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error("Debes incluir al menos una línea en la compra");
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const warehouse = await this.warehouseRepository.findWarehouseByCode(input.warehouse_code, tx);
      if (!warehouse) throw new Error(`Almacén no encontrado: ${input.warehouse_code}`);
      const warehouseContext: WarehouseContext = {
        id: Number(warehouse.id),
        code: warehouse.code,
        name: warehouse.name,
      };
      const occurredAt = parseDateInput(input.occurred_at);
      const transactionCode = generateTransactionCode("PUR");
      const status: PurchaseStatus = input.status && ["PENDIENTE", "PARCIAL", "PAGADA"].includes(input.status) ? input.status : "PENDIENTE";

      const transactionResult = await this.inventoryTransactionRepository.createTransaction(
        {
          transaction_code: transactionCode,
          transaction_type: "PURCHASE",
          warehouse_id: warehouseContext.id,
          reference: input.document_number || null,
          counterparty_name: input.supplier_name || null,
          status: status,
          notes: input.notes || null,
          occurred_at: occurredAt,
          authorized_by: null,
          total_amount: 0, // Will be updated later
        },
        tx
      );
      const transactionId = transactionResult.id;
      let totalAmount = 0;

      for (const line of input.lines) {
        const movement = await this.computeMovement(line, "PURCHASE", undefined, tx);
        const costPerUnit = toNumber(line.cost_per_unit, 0);
        const subtotal = costPerUnit * movement.quantity_entered;
        totalAmount += subtotal;

        const entryResult = await this.inventoryTransactionRepository.createTransactionEntry(
          {
            transaction_id: transactionId,
            article_id: movement.article.id,
            quantity_entered: movement.quantity_entered,
            entered_unit: line.unit,
            direction: "IN",
            unit_conversion_factor: Number(movement.article.conversion_factor),
            kit_multiplier: movement.kit_multiplier ?? null,
            cost_per_unit: costPerUnit || null,
            subtotal: subtotal || null,
            notes: line.notes || null,
          },
          tx
        );
        const entryId = entryResult.id;

        if (movement.article.article_type === "KIT") {
          const kitArticleId = movement.article.id;
          for (const component of movement.components) {
            const compId = await this.getArticleIdByCode(component.article_code, tx);
            await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
              compId,
              warehouseContext.id,
              tx
            );
            await this.inventoryTransactionRepository.createMovement(
              {
                transaction_id: transactionId,
                entry_id: entryId,
                article_id: compId,
                direction: "IN",
                quantity_retail: component.quantity_retail,
                warehouse_id: warehouseContext.id,
                source_kit_article_id: kitArticleId,
              },
              tx
            );
            await this.applyStockDelta(
              {
                articleId: compId,
                articleCode: component.article_code,
                warehouse: warehouseContext,
                deltaRetail: component.quantity_retail,
                conversionFactor: component.conversion_factor,
              },
              tx
            );
          }
        } else {
          await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
            movement.article.id,
            warehouseContext.id,
            tx
          );
          await this.inventoryTransactionRepository.createMovement(
            {
              transaction_id: transactionId,
              entry_id: entryId,
              article_id: movement.article.id,
              direction: "IN",
              quantity_retail: movement.quantity_retail,
              warehouse_id: warehouseContext.id,
              source_kit_article_id: null,
            },
            tx
          );
          await this.applyStockDelta(
            {
              articleId: movement.article.id,
              articleCode: movement.article.article_code,
              warehouse: warehouseContext,
              deltaRetail: movement.quantity_retail,
              conversionFactor: Number(movement.article.conversion_factor),
            },
            tx
          );
        }
      }

      await this.inventoryTransactionRepository.updateTransactionTotalAmount(
        transactionId,
        Number(totalAmount.toFixed(2)),
        tx
      );

      return { id: transactionId, transaction_code: transactionCode };
    });
  }

  async registerConsumption(input: RegisterConsumptionInput): Promise<{ id: number; transaction_code: string }> {
    if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error("Debes incluir al menos un artículo en el consumo");
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const warehouse = await this.warehouseRepository.findWarehouseByCode(input.warehouse_code, tx);
      if (!warehouse) throw new Error(`Almacén no encontrado: ${input.warehouse_code}`);
      const warehouseContext: WarehouseContext = {
        id: Number(warehouse.id),
        code: warehouse.code,
        name: warehouse.name,
      };
      const occurredAt = parseDateInput(input.occurred_at);
      const transactionCode = generateTransactionCode("CON");

      const transactionResult = await this.inventoryTransactionRepository.createTransaction(
        {
          transaction_code: transactionCode,
          transaction_type: "CONSUMPTION",
          warehouse_id: warehouseContext.id,
          reference: input.reason || null,
          counterparty_name: input.area || null,
          status: "CONFIRMADO",
          notes: input.notes || null,
          occurred_at: occurredAt,
          authorized_by: input.authorized_by || null,
          total_amount: 0,
        },
        tx
      );
      const transactionId = transactionResult.id;

      for (const line of input.lines) {
        const movement = await this.computeMovement(line, "CONSUMPTION", undefined, tx);
        const entryResult = await this.inventoryTransactionRepository.createTransactionEntry(
          {
            transaction_id: transactionId,
            article_id: movement.article.id,
            quantity_entered: movement.quantity_entered,
            entered_unit: line.unit,
            direction: "OUT",
            unit_conversion_factor: Number(movement.article.conversion_factor),
            kit_multiplier: movement.kit_multiplier ?? null,
            cost_per_unit: null,
            subtotal: null,
            notes: line.notes || null,
          },
          tx
        );
        const entryId = entryResult.id;

        if (movement.article.article_type === "KIT") {
          const kitArticleId = movement.article.id;
          for (const component of movement.components) {
            const compId = await this.getArticleIdByCode(component.article_code, tx);
            await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
              compId,
              warehouseContext.id,
              tx
            );
            await this.inventoryTransactionRepository.createMovement(
              {
                transaction_id: transactionId,
                entry_id: entryId,
                article_id: compId,
                direction: "OUT",
                quantity_retail: component.quantity_retail,
                warehouse_id: warehouseContext.id,
                source_kit_article_id: kitArticleId,
              },
              tx
            );
            await this.applyStockDelta(
              {
                articleId: compId,
                articleCode: component.article_code,
                warehouse: warehouseContext,
                deltaRetail: -component.quantity_retail,
                conversionFactor: component.conversion_factor,
              },
              tx
            );
          }
        } else {
          await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
            movement.article.id,
            warehouseContext.id,
            tx
          );
          await this.inventoryTransactionRepository.createMovement(
            {
              transaction_id: transactionId,
              entry_id: entryId,
              article_id: movement.article.id,
              direction: "OUT",
              quantity_retail: movement.quantity_retail,
              warehouse_id: warehouseContext.id,
              source_kit_article_id: null,
            },
            tx
          );
          await this.applyStockDelta(
            {
              articleId: movement.article.id,
              articleCode: movement.article.article_code,
              warehouse: warehouseContext,
              deltaRetail: -movement.quantity_retail,
              conversionFactor: Number(movement.article.conversion_factor),
            },
            tx
          );
        }
      }

      return { id: transactionId, transaction_code: transactionCode };
    });
  }

  async registerInvoiceMovements(input: RegisterInvoiceMovementsInput): Promise<void> {
    if (!input.lines || input.lines.length === 0) {
      return;
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cacheById = new Map<number, WarehouseContext>();
      const cacheByCode = new Map<string, WarehouseContext>();
      const articleCache = new Map<string, ArticleDetail>();
      const groups = new Map<number, { warehouse: WarehouseContext; entries: Array<{ article_code: string; unit: InventoryUnit; quantity: number }> }>();

      for (const line of input.lines) {
        const rawCode = line.article_code?.trim();
        if (!rawCode) {
          continue;
        }
        const articleCode = rawCode.toUpperCase();
        let article = articleCache.get(articleCode);
        if (!article) {
          const fetched = await this.articleRepository.getArticleByCode(articleCode, tx);
          if (!fetched) {
            throw new Error(
              `Artículo ${articleCode} no encontrado para registrar inventario de la factura ${input.invoiceNumber}`
            );
          }
          articleCache.set(articleCode, fetched);
          article = fetched;
        }

        const unit: InventoryUnit = line.unit === "STORAGE" ? "STORAGE" : "RETAIL";
        const quantity = toNumber(line.quantity);
        if (!(quantity > 0)) {
          continue;
        }

        const warehouse = await this.resolveWarehouseForInvoice(
          article,
          line.warehouse_code ?? null,
          cacheById,
          cacheByCode,
          tx
        );

        let bucket = groups.get(warehouse.id);
        if (!bucket) {
          bucket = { warehouse, entries: [] };
          groups.set(warehouse.id, bucket);
        }
        bucket.entries.push({ article_code: article.article_code, unit, quantity });
      }

      if (groups.size === 0) {
        return;
      }

      const occurredAt = input.invoiceDate;
      const counterparty = input.customerName ?? (input.tableCode ? `Mesa ${input.tableCode}` : null);
      const notesParts = [
        input.tableCode ? `Mesa: ${input.tableCode}` : "",
        input.customerName ? `Cliente: ${input.customerName}` : "",
      ].filter(Boolean);
      const notesValue = notesParts.length > 0 ? notesParts.join(" | ") : null;

      for (const { warehouse, entries } of groups.values()) {
        if (entries.length === 0) {
          continue;
        }

        const transactionCode = generateTransactionCode("SAL");
        const transactionResult = await this.inventoryTransactionRepository.createTransaction(
          {
            transaction_code: transactionCode,
            transaction_type: "CONSUMPTION",
            warehouse_id: warehouse.id,
            reference: input.invoiceNumber,
            counterparty_name: counterparty,
            status: "CONFIRMADO",
            notes: notesValue,
            occurred_at: occurredAt,
            authorized_by: "Facturación POS",
            total_amount: 0,
          },
          tx
        );
        const transactionId = transactionResult.id;

        for (const entry of entries) {
          const movement = await this.computeMovement(
            { article_code: entry.article_code, quantity: entry.quantity, unit: entry.unit },
            "CONSUMPTION",
            articleCache.get(entry.article_code),
            tx
          );
          const entryId = await this.inventoryTransactionRepository.createTransactionEntry(
            {
              transaction_id: transactionId,
              article_id: movement.article.id,
              quantity_entered: movement.quantity_entered,
              entered_unit: entry.unit,
              direction: "OUT",
              unit_conversion_factor: Number(movement.article.conversion_factor),
              kit_multiplier: movement.kit_multiplier ?? null,
              cost_per_unit: null,
              subtotal: null,
              notes: `Factura ${input.invoiceNumber}`,
            },
            tx
          );

          if (movement.article.article_type === "KIT") {
            const kitArticleId = movement.article.id;
            for (const component of movement.components) {
              const compId = await this.getArticleIdByCode(component.article_code, tx);
              await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
                compId,
                warehouse.id,
                tx
              );
              await this.inventoryTransactionRepository.createMovement(
                {
                  transaction_id: transactionId,
                  entry_id: entryId.id,
                  article_id: compId,
                  direction: "OUT",
                  quantity_retail: component.quantity_retail,
                  warehouse_id: warehouse.id,
                  source_kit_article_id: kitArticleId,
                },
                tx
              );
              await this.applyStockDelta(
                {
                  articleId: compId,
                  articleCode: component.article_code,
                  warehouse: warehouse,
                  deltaRetail: -component.quantity_retail,
                  conversionFactor: component.conversion_factor,
                },
                tx
              );
            }
          } else {
            await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
              movement.article.id,
              warehouse.id,
              tx
            );
            await this.inventoryTransactionRepository.createMovement(
              {
                transaction_id: transactionId,
                entry_id: entryId.id,
                article_id: movement.article.id,
                direction: "OUT",
                quantity_retail: movement.quantity_retail,
                warehouse_id: warehouse.id,
                source_kit_article_id: null,
              },
              tx
            );
            await this.applyStockDelta(
              {
                articleId: movement.article.id,
                articleCode: movement.article.article_code,
                warehouse: warehouse,
                deltaRetail: -movement.quantity_retail,
                conversionFactor: Number(movement.article.conversion_factor),
              },
              tx
            );
          }
        }
      }
    });
  }

  private async resolveWarehouseForInvoice(
    article: ArticleDetail,
    explicitCode: string | null | undefined,
    cacheById: Map<number, WarehouseContext>,
    cacheByCode: Map<string, WarehouseContext>,
    tx?: Prisma.TransactionClient
  ): Promise<WarehouseContext> {
    if (explicitCode && explicitCode.trim().length > 0) {
      const warehouse = await this.warehouseRepository.findWarehouseByCode(explicitCode, tx);
      if (!warehouse) throw new Error(`Almacén ${explicitCode} no encontrado o inactivo`);
      return { id: Number(warehouse.id), code: warehouse.code, name: warehouse.name };
    }
    if (article.default_warehouse_id) {
      const warehouse = await this.warehouseRepository.findWarehouseById(Number(article.default_warehouse_id), tx);
      if (!warehouse) throw new Error(`Almacén con ID ${article.default_warehouse_id} no encontrado o inactivo`);
      return { id: Number(warehouse.id), code: warehouse.code, name: warehouse.name };
    }
    if (env.defaultSalesWarehouseCode) {
      const warehouse = await this.warehouseRepository.findWarehouseByCode(env.defaultSalesWarehouseCode, tx);
      if (!warehouse) throw new Error(`Almacén ${env.defaultSalesWarehouseCode} no encontrado o inactivo`);
      return { id: Number(warehouse.id), code: warehouse.code, name: warehouse.name };
    }
    throw new Error(
      `El artículo ${article.article_code} no tiene almacén asignado y DEFAULT_SALES_WAREHOUSE_CODE no está configurado.`
    );
  }

  async registerTransfer(input: RegisterTransferInput): Promise<InventoryTransactionResult> {
    if (!input || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new Error("Debes incluir al menos una línea en el traspaso");
    }
    if (!input.from_warehouse_code || !input.to_warehouse_code) {
      throw new Error("Selecciona almacenes de origen y destino");
    }
    if (input.from_warehouse_code === input.to_warehouse_code) {
      throw new Error("El traspaso requiere almacenes distintos");
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fromWarehouse = await this.warehouseRepository.findWarehouseByCode(input.from_warehouse_code, tx);
      if (!fromWarehouse) throw new Error(`Almacén origen no encontrado: ${input.from_warehouse_code}`);
      const toWarehouse = await this.warehouseRepository.findWarehouseByCode(input.to_warehouse_code, tx);
      if (!toWarehouse) throw new Error(`Almacén destino no encontrado: ${input.to_warehouse_code}`);
      const fromWarehouseContext: WarehouseContext = {
        id: Number(fromWarehouse.id),
        code: fromWarehouse.code,
        name: fromWarehouse.name,
      };
      const toWarehouseContext: WarehouseContext = {
        id: Number(toWarehouse.id),
        code: toWarehouse.code,
        name: toWarehouse.name,
      };
      const occurredAt = parseDateInput(input.occurred_at);
      const transactionCode = generateTransactionCode("TRF");
      const combinedNotes = [input.notes?.trim() || "", input.requested_by?.trim() ? `Solicitado por: ${input.requested_by.trim()}` : ""]
        .filter(Boolean)
        .join(" | ") || null;

      const transactionResult = await this.inventoryTransactionRepository.createTransaction(
        {
          transaction_code: transactionCode,
          transaction_type: "TRANSFER",
          warehouse_id: fromWarehouseContext.id,
          reference: input.reference || null,
          counterparty_name: toWarehouseContext.name,
          status: "CONFIRMADO",
          notes: combinedNotes,
          occurred_at: occurredAt,
          authorized_by: input.authorized_by || null,
          total_amount: 0,
        },
        tx
      );
      const transactionId = transactionResult.id;

      for (const line of input.lines) {
        const movement = await this.computeMovement(line, "PURCHASE", undefined, tx); // Use PURCHASE type for computing movement details
        const kitArticleId = movement.article.article_type === "KIT" ? movement.article.id : null;

        // OUT movement from source warehouse
        const exitEntryResult = await this.inventoryTransactionRepository.createTransactionEntry(
          {
            transaction_id: transactionId,
            article_id: movement.article.id,
            quantity_entered: movement.quantity_entered,
            entered_unit: line.unit,
            direction: "OUT",
            unit_conversion_factor: Number(movement.article.conversion_factor),
            kit_multiplier: movement.kit_multiplier ?? null,
            cost_per_unit: null,
            subtotal: null,
            notes: line.notes || null,
          },
          tx
        );
        const exitEntryId = exitEntryResult.id;

        if (movement.article.article_type === "KIT") {
          for (const component of movement.components) {
            const compId = await this.getArticleIdByCode(component.article_code, tx);
            await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
              compId,
              fromWarehouseContext.id,
              tx
            );
            await this.inventoryTransactionRepository.createMovement(
              {
                transaction_id: transactionId,
                entry_id: exitEntryId,
                article_id: compId,
                direction: "OUT",
                quantity_retail: component.quantity_retail,
                warehouse_id: fromWarehouseContext.id,
                source_kit_article_id: kitArticleId,
              },
              tx
            );
            await this.applyStockDelta(
              {
                articleId: compId,
                articleCode: component.article_code,
                warehouse: fromWarehouseContext,
                deltaRetail: -component.quantity_retail,
                conversionFactor: component.conversion_factor,
              },
              tx
            );
          }
        } else {
          await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
            movement.article.id,
            fromWarehouseContext.id,
            tx
          );
          await this.inventoryTransactionRepository.createMovement(
            {
              transaction_id: transactionId,
              entry_id: exitEntryId,
              article_id: movement.article.id,
              direction: "OUT",
              quantity_retail: movement.quantity_retail,
              warehouse_id: fromWarehouseContext.id,
              source_kit_article_id: null,
            },
            tx
          );
          await this.applyStockDelta(
            {
              articleId: movement.article.id,
              articleCode: movement.article.article_code,
              warehouse: fromWarehouseContext,
              deltaRetail: -movement.quantity_retail,
              conversionFactor: Number(movement.article.conversion_factor),
            },
            tx
          );
        }

        // IN movement to target warehouse
        const entryResult = await this.inventoryTransactionRepository.createTransactionEntry(
          {
            transaction_id: transactionId,
            article_id: movement.article.id,
            quantity_entered: movement.quantity_entered,
            entered_unit: line.unit,
            direction: "IN",
            unit_conversion_factor: Number(movement.article.conversion_factor),
            kit_multiplier: movement.kit_multiplier ?? null,
            cost_per_unit: null,
            subtotal: null,
            notes: line.notes || null,
          },
          tx
        );
        const entryId = entryResult.id;

        if (movement.article.article_type === "KIT") {
          for (const component of movement.components) {
            const compId = await this.getArticleIdByCode(component.article_code, tx);
            await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
              compId,
              toWarehouseContext.id,
              tx
            );
            await this.inventoryTransactionRepository.createMovement(
              {
                transaction_id: transactionId,
                entry_id: entryId,
                article_id: compId,
                direction: "IN",
                quantity_retail: component.quantity_retail,
                warehouse_id: toWarehouseContext.id,
                source_kit_article_id: kitArticleId,
              },
              tx
            );
            await this.applyStockDelta(
              {
                articleId: compId,
                articleCode: component.article_code,
                warehouse: toWarehouseContext,
                deltaRetail: component.quantity_retail,
                conversionFactor: component.conversion_factor,
              },
              tx
            );
          }
        } else {
          await this.warehouseStockRepository.ensureArticleWarehouseAssociation(
            movement.article.id,
            toWarehouseContext.id,
            tx
          );
          await this.inventoryTransactionRepository.createMovement(
            {
              transaction_id: transactionId,
              entry_id: entryId,
              article_id: movement.article.id,
              direction: "IN",
              quantity_retail: movement.quantity_retail,
              warehouse_id: toWarehouseContext.id,
              source_kit_article_id: null,
            },
            tx
          );
          await this.applyStockDelta(
            {
              articleId: movement.article.id,
              articleCode: movement.article.article_code,
              warehouse: toWarehouseContext,
              deltaRetail: movement.quantity_retail,
              conversionFactor: Number(movement.article.conversion_factor),
            },
            tx
          );
        }
      }

      const resultSummary: InventoryTransactionResult = {
        id: transactionId,
        transactionCode,
        occurredAt,
        fromWarehouse: fromWarehouseContext.code,
        toWarehouse: toWarehouseContext.code,
        lines: input.lines.map((line) => ({
          ...line,
          unit: line.unit || 'RETAIL', // Default to 'RETAIL' if undefined
          quantity: BigInt(line.quantity), // Convert to bigint
        })),
      };

      return resultSummary;
    });
  }

  async listTransfers(_filters?: TransferFilter): Promise<TransferListItem[]> {
    void _filters;
    // TODO: Implement with Prisma
    return [];
  }

  async listKardex(_filters?: KardexFilter): Promise<KardexMovementRow[]> {
    void _filters;
    // TODO: Implement with Prisma
    return [];
  }

  async getStockSummary(_filters?: StockFilter): Promise<StockSummaryRow[]> {
    void _filters;
    // TODO: Implement with Prisma
    return [];
  }

  async listPurchases(_filters?: PurchaseListFilter): Promise<PurchaseListItem[]> {
    void _filters;
    // TODO: Implement with Prisma
    return [];
  }

  async listConsumptions(_filters?: ConsumptionListFilter): Promise<ConsumptionMovementRow[]> {
    void _filters;
    // TODO: Implement with Prisma
    return [];
  }
}

export const inventoryService = new InventoryService();
