import { env } from "@/lib/env";
import type { Prisma } from "@prisma/client";
import { toCentralClosedDate, toCentralEndOfDay } from "@/lib/utils/date";
import { sequenceService } from "@/lib/services/SequenceService";

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
  InventoryDocument,
  InventoryDocumentEntry,
  InventoryDocumentListFilter,
  InventoryTransactionHeader,
} from "@/lib/types/inventory"; // Changed import path

import { IArticleRepository } from "@/lib/repositories/IArticleRepository";
import { ArticleRepository } from "@/lib/repositories/ArticleRepository";
import { IArticleKitRepository } from "@/lib/repositories/IArticleKitRepository";
import { ArticleKitRepository } from "@/lib/repositories/ArticleKitRepository";
import { IWarehouseRepository } from "@/lib/repositories/IWarehouseRepository";
import { WarehouseRepository } from "@/lib/repositories/WarehouseRepository";
import type {
  IInventoryTransactionRepository,
  InventoryTransactionHeaderFilter,
  InventoryTransactionDocumentRecord,
} from "@/lib/repositories/IInventoryTransactionRepository";
import { InventoryTransactionRepository } from "@/lib/repositories/InventoryTransactionRepository";
import { IWarehouseStockRepository } from "@/lib/repositories/IWarehouseStockRepository";
import { WarehouseStockRepository } from "@/lib/repositories/WarehouseStockRepository";
import { PrismaClient, prisma } from "@/lib/db/prisma"; // Import PrismaClient y reutiliza instancia compartida para transacciones

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

function parseDateInput(value?: string, mode: "start" | "end" = "start"): Date {
  const trimmed = value?.trim();
  if (!trimmed) {
    const today = new Date();
    return mode === "start" ? toCentralClosedDate(today) : toCentralEndOfDay(today);
  }
  return mode === "start" ? toCentralClosedDate(trimmed) : toCentralEndOfDay(trimmed);
}

const validTransactionTypes: TransactionType[] = ["PURCHASE", "CONSUMPTION", "ADJUSTMENT", "TRANSFER"];

export class InventoryService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly articleRepository: IArticleRepository = new ArticleRepository(),
    private readonly articleKitRepository: IArticleKitRepository = new ArticleKitRepository(),
    private readonly warehouseRepository: IWarehouseRepository = new WarehouseRepository(),
    private readonly inventoryTransactionRepository: IInventoryTransactionRepository = new InventoryTransactionRepository(),
    private readonly warehouseStockRepository: IWarehouseStockRepository = new WarehouseStockRepository(),
    prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? prisma;
  }

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

  private mapDocumentEntry(
    entry: InventoryTransactionDocumentRecord["entries"][number],
    index: number
  ): InventoryDocumentEntry {
    const enteredUnit: InventoryUnit = entry.entered_unit === "STORAGE" ? "STORAGE" : "RETAIL";
    const baseConversion = entry.unit_conversion_factor ?? entry.article.conversion_factor ?? 1;
    const safeConversion = baseConversion > 0 ? baseConversion : 1;
    const quantityEntered = entry.quantity_entered;
    const quantityRetail = enteredUnit === "STORAGE" ? quantityEntered * safeConversion : quantityEntered;
    const quantityStorage = enteredUnit === "STORAGE" ? quantityEntered : quantityEntered / safeConversion;
    const movements = entry.movements.map((movement) => ({
      article_code: movement.article.article_code,
      article_name: movement.article.name,
      direction: movement.direction,
      quantity_retail: movement.quantity_retail,
      warehouse_code: movement.warehouse.code,
      warehouse_name: movement.warehouse.name,
      retail_unit: movement.article.retail_unit ?? null,
      storage_unit: movement.article.storage_unit ?? null,
      source_kit_article_code: movement.source_kit_article_code,
    }));

    return {
      line_number: index + 1,
      article_code: entry.article.article_code,
      article_name: entry.article.name,
      direction: entry.direction,
      entered_unit: enteredUnit,
      quantity_entered: quantityEntered,
      quantity_retail: quantityRetail,
      quantity_storage: quantityStorage,
      retail_unit: entry.article.retail_unit ?? null,
      storage_unit: entry.article.storage_unit ?? null,
      kit_multiplier: entry.kit_multiplier ?? null,
      cost_per_unit: entry.cost_per_unit ?? null,
      subtotal: entry.subtotal ?? null,
      notes: entry.notes ?? null,
      movements,
    } satisfies InventoryDocumentEntry;
  }

  private normalizeDocumentListFilter(
    filters?: InventoryDocumentListFilter
  ): InventoryTransactionHeaderFilter {
    const transactionTypes = Array.from(
      new Set(
        (filters?.transaction_types ?? [])
          .map((type) => type?.toUpperCase?.().trim() || "")
          .filter((value): value is TransactionType => validTransactionTypes.includes(value as TransactionType))
      )
    );

    const warehouseCodes = Array.from(
      new Set(
        (filters?.warehouse_codes ?? [])
          .map((code) => code?.trim?.().toUpperCase?.() || "")
          .filter((code) => code.length > 0)
      )
    );

    const search = filters?.search?.trim();
    const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 200);
    const from = filters?.from ? parseDateInput(filters.from) : undefined;
    const to = filters?.to ? parseDateInput(filters.to, "end") : undefined;

    const result: InventoryTransactionHeaderFilter = { limit };
    if (transactionTypes.length > 0) {
      result.transactionTypes = transactionTypes as TransactionType[];
    }
    if (warehouseCodes.length > 0) {
      result.warehouseCodes = warehouseCodes;
    }
    if (search && search.length > 0) {
      result.search = search;
    }
    if (from) {
      result.from = from;
    }
    if (to) {
      result.to = to;
    }
    return result;
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
      const transactionCode = await sequenceService.generateInventoryCode("PURCHASE");
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
      const transactionCode = await sequenceService.generateInventoryCode("CONSUMPTION");

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

        const transactionCode = await sequenceService.generateInventoryCode("CONSUMPTION");
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
      const transactionCode = await sequenceService.generateInventoryCode("TRANSFER");
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
    const filters = _filters ?? {};
    const fromDate = filters.from ? parseDateInput(filters.from) : undefined;
    const toDate = filters.to ? parseDateInput(filters.to, "end") : undefined;

    const txs = await this.prisma.inventory_transactions.findMany({
      where: {
        transaction_type: "TRANSFER",
        ...(fromDate || toDate
          ? { occurred_at: { gte: fromDate ?? undefined, lte: toDate ?? undefined } }
          : {}),
        ...(filters.article
          ? {
              inventory_movements: {
                some: {
                  articles_inventory_movements_article_idToarticles: { article_code: filters.article },
                },
              },
            }
          : {}),
        ...(filters.from_warehouse_code
          ? { warehouses: { code: filters.from_warehouse_code } }
          : {}),
        ...(filters.to_warehouse_code
          ? {
              inventory_movements: {
                some: {
                  direction: "IN",
                  warehouses: { code: filters.to_warehouse_code },
                },
              },
            }
          : {}),
      },
      orderBy: { occurred_at: "desc" },
      select: {
        id: true,
        transaction_code: true,
        occurred_at: true,
        notes: true,
        authorized_by: true,
        warehouses: { select: { code: true, name: true } },
        inventory_transaction_entries: { select: { id: true, direction: true } },
        inventory_movements: {
          select: {
            direction: true,
            warehouses: { select: { code: true, name: true } },
          },
        },
      },
    });

    return txs.map((t) => {
      const toWh = t.inventory_movements.find((m) => m.direction === "IN")?.warehouses;
      const linesCount = t.inventory_transaction_entries.filter((e) => e.direction === "OUT").length;
      return {
        id: String(t.id),
        transaction_code: t.transaction_code,
        occurred_at: t.occurred_at.toISOString(),
        from_warehouse_code: t.warehouses.code,
        from_warehouse_name: t.warehouses.name,
        to_warehouse_code: toWh?.code ?? "",
        to_warehouse_name: toWh?.name ?? "",
        lines_count: linesCount,
        notes: t.notes ?? null,
        authorized_by: t.authorized_by ?? null,
      } satisfies TransferListItem;
    });
  }

  async listKardex(_filters?: KardexFilter): Promise<KardexMovementRow[]> {
    const filters = _filters ?? {};
    const articleCodes = (filters.articles ?? (filters.article ? [filters.article] : []))
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length > 0);
    const warehouseCodes = (filters.warehouse_codes ?? (filters.warehouse_code ? [filters.warehouse_code] : []))
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code.length > 0);
    const fromDate = filters.from ? parseDateInput(filters.from) : undefined;
    const toDate = filters.to ? parseDateInput(filters.to, "end") : undefined;

    const openingBalances = new Map<string, number>();
    if (fromDate) {
      const priorMovements = await this.prisma.inventory_movements.findMany({
        where: {
          ...(articleCodes.length > 0
            ? { articles_inventory_movements_article_idToarticles: { article_code: { in: articleCodes } } }
            : {}),
          ...(warehouseCodes.length > 0 ? { warehouses: { code: { in: warehouseCodes } } } : {}),
          inventory_transactions: {
            occurred_at: {
              lt: fromDate,
            },
          },
        },
        select: {
          direction: true,
          quantity_retail: true,
          warehouses: { select: { code: true } },
          articles_inventory_movements_article_idToarticles: { select: { article_code: true } },
        },
      });

      for (const movement of priorMovements) {
        const articleCode = movement.articles_inventory_movements_article_idToarticles.article_code;
        const warehouseCode = movement.warehouses.code;
        const key = `${articleCode}__${warehouseCode}`;
        const qtyRetail = Number(movement.quantity_retail);
        const delta = movement.direction === "IN" ? qtyRetail : -qtyRetail;
        const previous = openingBalances.get(key) ?? 0;
        openingBalances.set(key, previous + delta);
      }
    }

    const rows = await this.prisma.inventory_movements.findMany({
      where: {
        ...(articleCodes.length > 0
          ? { articles_inventory_movements_article_idToarticles: { article_code: { in: articleCodes } } }
          : {}),
        ...(warehouseCodes.length > 0 ? { warehouses: { code: { in: warehouseCodes } } } : {}),
        ...(fromDate || toDate
          ? {
              inventory_transactions: {
                occurred_at: { gte: fromDate ?? undefined, lte: toDate ?? undefined },
              },
            }
          : {}),
      },
      orderBy: [
        { inventory_transactions: { created_at: "asc" } },
        { created_at: "asc" },
      ],
      select: {
        id: true,
        direction: true,
        quantity_retail: true,
        created_at: true,
        warehouses: { select: { code: true, name: true } },
        inventory_transactions: {
          select: {
            transaction_code: true,
            transaction_type: true,
            occurred_at: true,
            created_at: true,
            reference: true,
            counterparty_name: true,
          },
        },
        articles_inventory_movements_article_idToarticles: {
          select: {
            article_code: true,
            name: true,
            conversion_factor: true,
            units_articles_retail_unit_idTounits: { select: { name: true } },
            units_articles_storage_unit_idTounits: { select: { name: true } },
          },
        },
        articles_inventory_movements_source_kit_article_idToarticles: {
          select: { article_code: true },
        },
      },
    });

    const balances = new Map<string, number>(openingBalances);
    const result: KardexMovementRow[] = [];
    for (const r of rows) {
      const trx = r.inventory_transactions;
      const art = r.articles_inventory_movements_article_idToarticles;
      const wh = r.warehouses;
      const key = `${art.article_code}__${wh.code}`;
      const conv = Number(art.conversion_factor || 1);
      const qtyRetail = Number(r.quantity_retail);
      const sign = r.direction === "IN" ? 1 : -1;
      const prev = balances.get(key) ?? 0;
      const next = prev + sign * qtyRetail;
      balances.set(key, next);
      const createdAtSource = r.created_at ?? trx.created_at ?? trx.occurred_at;

      result.push({
        id: String(r.id),
        occurred_at: trx.occurred_at.toISOString(),
        created_at: createdAtSource.toISOString(),
        transaction_type: trx.transaction_type as TransactionType,
        transaction_code: trx.transaction_code,
        article_code: art.article_code,
        article_name: art.name,
        direction: r.direction as MovementDirection,
        quantity_retail: qtyRetail,
        quantity_storage: conv > 0 ? qtyRetail / conv : 0,
        retail_unit: art.units_articles_retail_unit_idTounits?.name ?? null,
        storage_unit: art.units_articles_storage_unit_idTounits?.name ?? null,
        reference: trx.reference ?? null,
        counterparty_name: trx.counterparty_name ?? null,
        warehouse_code: wh.code,
        warehouse_name: wh.name,
        source_kit_code: r.articles_inventory_movements_source_kit_article_idToarticles?.article_code ?? null,
        balance_retail: next,
        balance_storage: conv > 0 ? next / conv : 0,
      });
    }

    return result;
  }

  async getStockSummary(_filters?: StockFilter): Promise<StockSummaryRow[]> {
    const filters = _filters ?? {};
    const articleCodes = Array.from(
      new Set(
        (filters.articles ?? (filters.article ? [filters.article] : []))
          .map((code) => code?.toUpperCase?.() ?? "")
          .filter((code) => code.length > 0)
      )
    );
    const warehouseCodes = Array.from(
      new Set(
        (filters.warehouse_codes ?? (filters.warehouse_code ? [filters.warehouse_code] : []))
          .map((code) => code?.toUpperCase?.() ?? "")
          .filter((code) => code.length > 0)
      )
    );

    const whereClauses: Prisma.warehouse_stockWhereInput[] = [];

    if (articleCodes.length > 0) {
      whereClauses.push({ articles: { article_code: { in: articleCodes } } });
    } else if (filters.article && filters.article.trim().length > 0) {
      const term = filters.article.trim();
      whereClauses.push({
        OR: [
          { articles: { article_code: { contains: term, mode: "insensitive" } } },
          { articles: { name: { contains: term, mode: "insensitive" } } },
        ],
      });
    }

    if (warehouseCodes.length > 0) {
      whereClauses.push({ warehouses: { code: { in: warehouseCodes } } });
    } else if (filters.warehouse_code && filters.warehouse_code.trim().length > 0) {
      whereClauses.push({ warehouses: { code: filters.warehouse_code.trim().toUpperCase() } });
    }

    const stocks = await this.prisma.warehouse_stock.findMany({
      where: whereClauses.length > 0 ? { AND: whereClauses } : undefined,
      orderBy: [
        { articles: { article_code: "asc" } },
        { warehouses: { code: "asc" } },
      ],
      select: {
        quantity_retail: true,
        quantity_storage: true,
        warehouses: { select: { code: true, name: true } },
        articles: {
          select: {
            article_code: true,
            name: true,
            units_articles_retail_unit_idTounits: { select: { name: true } },
            units_articles_storage_unit_idTounits: { select: { name: true } },
          },
        },
      },
    });

    return stocks.map((s) => ({
      article_code: s.articles.article_code,
      article_name: s.articles.name,
      warehouse_code: s.warehouses.code,
      warehouse_name: s.warehouses.name,
      available_retail: Number(s.quantity_retail),
      available_storage: Number(s.quantity_storage),
      retail_unit: s.articles.units_articles_retail_unit_idTounits?.name ?? null,
      storage_unit: s.articles.units_articles_storage_unit_idTounits?.name ?? null,
    }));
  }

  async listPurchases(_filters?: PurchaseListFilter): Promise<PurchaseListItem[]> {
    const filters = _filters ?? {};
    const fromDate = filters.from ? parseDateInput(filters.from) : undefined;
    const toDate = filters.to ? parseDateInput(filters.to, "end") : undefined;

    const txs = await this.prisma.inventory_transactions.findMany({
      where: {
        transaction_type: "PURCHASE",
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.supplier ? { counterparty_name: { contains: filters.supplier, mode: "insensitive" } } : {}),
        ...(fromDate || toDate
          ? { occurred_at: { gte: fromDate ?? undefined, lte: toDate ?? undefined } }
          : {}),
      },
      orderBy: { occurred_at: "desc" },
      select: {
        id: true,
        transaction_code: true,
        reference: true,
        counterparty_name: true,
        occurred_at: true,
        status: true,
        total_amount: true,
        warehouses: { select: { name: true } },
      },
    });

    return txs.map((t) => ({
      id: String(t.id),
      transaction_code: t.transaction_code,
      document_number: t.reference ?? null,
      supplier_name: t.counterparty_name ?? null,
      occurred_at: t.occurred_at.toISOString(),
      status: t.status as PurchaseStatus,
      total_amount: Number(t.total_amount ?? 0),
      warehouse_name: t.warehouses.name,
    }));
  }

  async listConsumptions(_filters?: ConsumptionListFilter): Promise<ConsumptionMovementRow[]> {
    const filters = _filters ?? {};
    const fromDate = filters.from ? parseDateInput(filters.from) : undefined;
    const toDate = filters.to ? parseDateInput(filters.to, "end") : undefined;

    const rows = await this.prisma.inventory_movements.findMany({
      where: {
        inventory_transactions: {
          transaction_type: "CONSUMPTION",
          ...(fromDate || toDate
            ? { occurred_at: { gte: fromDate ?? undefined, lte: toDate ?? undefined } }
            : {}),
        },
        ...(filters.article
          ? { articles_inventory_movements_article_idToarticles: { article_code: filters.article } }
          : {}),
      },
      orderBy: [
        { inventory_transactions: { occurred_at: "desc" } },
        { id: "asc" },
      ],
      select: {
        id: true,
        direction: true,
        quantity_retail: true,
        inventory_transactions: {
          select: {
            occurred_at: true,
            reference: true,
            authorized_by: true,
            counterparty_name: true,
          },
        },
        articles_inventory_movements_article_idToarticles: {
          select: {
            article_code: true,
            name: true,
            conversion_factor: true,
            units_articles_retail_unit_idTounits: { select: { name: true } },
            units_articles_storage_unit_idTounits: { select: { name: true } },
          },
        },
        articles_inventory_movements_source_kit_article_idToarticles: {
          select: { article_code: true },
        },
      },
    });

    return rows.map((r) => {
      const trx = r.inventory_transactions;
      const art = r.articles_inventory_movements_article_idToarticles;
      const conv = Number(art.conversion_factor || 1);
      const qtyRetail = Number(r.quantity_retail);
      return {
        id: String(r.id),
        occurred_at: trx.occurred_at.toISOString(),
        article_code: art.article_code,
        article_name: art.name,
        reason: trx.reference ?? null,
        authorized_by: trx.authorized_by ?? null,
        area: trx.counterparty_name ?? null,
        direction: r.direction as MovementDirection,
        quantity_retail: qtyRetail,
        quantity_storage: conv > 0 ? qtyRetail / conv : 0,
        retail_unit: art.units_articles_retail_unit_idTounits?.name ?? null,
        storage_unit: art.units_articles_storage_unit_idTounits?.name ?? null,
        source_kit_code: r.articles_inventory_movements_source_kit_article_idToarticles?.article_code ?? null,
      } satisfies ConsumptionMovementRow;
    });
  }

  async getTransactionDocument(transactionCode: string): Promise<InventoryDocument | null> {
    const normalizedCode = transactionCode?.trim();
    if (!normalizedCode) {
      throw new Error("Debes indicar un folio de inventario");
    }

    const record = await this.inventoryTransactionRepository.findTransactionDocumentByCode(normalizedCode);
    if (!record) {
      return null;
    }

    const entries = record.entries.map((entry, index) => this.mapDocumentEntry(entry, index));

    return {
      transaction_code: record.transaction_code,
      transaction_type: record.transaction_type,
      occurred_at: record.occurred_at.toISOString(),
      created_at: record.created_at.toISOString(),
      warehouse_code: record.warehouse.code,
      warehouse_name: record.warehouse.name,
      reference: record.reference ?? null,
      counterparty_name: record.counterparty_name ?? null,
      status: record.status,
      notes: record.notes ?? null,
      authorized_by: record.authorized_by ?? null,
      created_by: record.created_by ?? null,
      total_amount: record.total_amount ?? null,
      entries,
    } satisfies InventoryDocument;
  }

  async listTransactionHeaders(filters?: InventoryDocumentListFilter): Promise<InventoryTransactionHeader[]> {
    const normalizedFilters = this.normalizeDocumentListFilter(filters);
    const rows = await this.inventoryTransactionRepository.listTransactionHeaders(normalizedFilters);

    return rows.map((row) => ({
      transaction_code: row.transaction_code,
      transaction_type: row.transaction_type,
      occurred_at: row.occurred_at.toISOString(),
      warehouse_code: row.warehouse.code,
      warehouse_name: row.warehouse.name,
      reference: row.reference ?? null,
      counterparty_name: row.counterparty_name ?? null,
      status: row.status,
      notes: row.notes ?? null,
      total_amount: row.total_amount ?? null,
      entries_count: row.entries_count,
      entries_in: row.entries_in,
      entries_out: row.entries_out,
    } satisfies InventoryTransactionHeader));
  }

  async reverseInvoiceMovements(input: { invoiceNumber: string; occurred_at?: string }): Promise<{ reversed: number }> {
    const reference = input.invoiceNumber.trim();
    if (!reference) return { reversed: 0 };
    const occurredAt = input.occurred_at ? parseDateInput(input.occurred_at) : new Date();

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const movements = await tx.inventory_movements.findMany({
        where: {
          direction: "OUT",
          inventory_transactions: { transaction_type: "CONSUMPTION", reference },
        },
        select: {
          quantity_retail: true,
          article_id: true,
          warehouse_id: true,
          articles_inventory_movements_article_idToarticles: { select: { article_code: true, conversion_factor: true } },
        },
      });
      if (movements.length === 0) return { reversed: 0 };

      // Agrupar por almacén y artículo
      const byWarehouse = new Map<number, Array<typeof movements[0]>>();
      for (const m of movements) {
        const list = byWarehouse.get(Number(m.warehouse_id)) ?? [];
        list.push(m);
        byWarehouse.set(Number(m.warehouse_id), list);
      }

      let reversedCount = 0;
      for (const [warehouseId, list] of byWarehouse) {
        const warehouse = await this.warehouseRepository.findWarehouseById(warehouseId, tx);
        if (!warehouse) continue;
        const warehouseContext: WarehouseContext = {
          id: Number(warehouse.id),
          code: warehouse.code,
          name: warehouse.name,
        };
        const transactionCode = await sequenceService.generateInventoryCode("ADJUSTMENT");
        const trx = await this.inventoryTransactionRepository.createTransaction(
          {
            transaction_code: transactionCode,
            transaction_type: "ADJUSTMENT",
            warehouse_id: warehouseContext.id,
            reference: `ANULACION ${reference}`,
            counterparty_name: "Anulación de factura",
            status: "CONFIRMADO",
            notes: `Reverso de consumos registrados por la factura ${reference}`,
            occurred_at: occurredAt,
            authorized_by: "Sistema",
            total_amount: 0,
          },
          tx
        );
        const transactionId = trx.id;

        // Agrupar por artículo para sumar cantidades
        const byArticle = new Map<number, { qtyRetail: number; code: string; conv: number }>();
        for (const m of list) {
          const key = Number(m.article_id);
          const prev = byArticle.get(key) ?? { qtyRetail: 0, code: m.articles_inventory_movements_article_idToarticles.article_code, conv: Number(m.articles_inventory_movements_article_idToarticles.conversion_factor || 1) };
          prev.qtyRetail += Number(m.quantity_retail);
          byArticle.set(key, prev);
        }

        for (const [articleId, info] of byArticle) {
          await this.warehouseStockRepository.ensureArticleWarehouseAssociation(articleId, warehouseContext.id, tx);
          const entry = await this.inventoryTransactionRepository.createTransactionEntry(
            {
              transaction_id: transactionId,
              article_id: articleId,
              quantity_entered: info.conv > 0 ? info.qtyRetail / info.conv : info.qtyRetail,
              entered_unit: info.conv > 0 ? ("RETAIL" as const) : ("RETAIL" as const),
              direction: "IN",
              unit_conversion_factor: info.conv,
              kit_multiplier: null,
              cost_per_unit: null,
              subtotal: null,
              notes: `Reverso factura ${reference}`,
            },
            tx
          );
          await this.inventoryTransactionRepository.createMovement(
            {
              transaction_id: transactionId,
              entry_id: entry.id,
              article_id: articleId,
              direction: "IN",
              quantity_retail: info.qtyRetail,
              warehouse_id: warehouseContext.id,
              source_kit_article_id: null,
            },
            tx
          );
          await this.applyStockDelta(
            {
              articleId,
              articleCode: info.code,
              warehouse: warehouseContext,
              deltaRetail: info.qtyRetail,
              conversionFactor: info.conv,
            },
            tx
          );
          reversedCount += 1;
        }
      }

      return { reversed: reversedCount };
    });
  }
}

export const inventoryService = new InventoryService();
