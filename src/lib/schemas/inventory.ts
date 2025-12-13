/**
 * @fileoverview Shared Zod schemas for inventory operations.
 * Centralizes validation logic to ensure consistency across APIs and forms.
 */
import { z } from "zod";

// ---------------------
// Base Primitives
// ---------------------

/** Accepts number or string input for numeric fields */
export const numericInput = z.union([z.number(), z.string().trim().min(1)]);

/** Validates quantity is a positive finite number */
export const quantitySchema = numericInput.refine(
    (value) => {
        const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
        return Number.isFinite(num) && num > 0;
    },
    { message: "La cantidad debe ser mayor a 0" }
);

/** Validates optional cost is a non-negative finite number */
export const costSchema = z
    .union([z.number(), z.string().trim()])
    .optional()
    .refine(
        (value) => {
            if (value === undefined) return true;
            const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
            return Number.isFinite(num) && num >= 0;
        },
        { message: "El costo debe ser un número válido mayor o igual a 0" }
    );

/** Unit type for inventory operations */
export const inventoryUnitSchema = z.enum(["STORAGE", "RETAIL"]);

/** Purchase status options */
export const purchaseStatusSchema = z.enum(["PENDIENTE", "PARCIAL", "PAGADA"]);

/** Transaction type options */
export const transactionTypeSchema = z.enum(["PURCHASE", "CONSUMPTION", "ADJUSTMENT", "TRANSFER"]);

// ---------------------
// Common Field Schemas
// ---------------------

/** Article code field */
export const articleCodeSchema = z.string().trim().min(1, "El código de artículo es requerido").max(40);

/** Warehouse code field */
export const warehouseCodeSchema = z.string().trim().min(1, "El código de bodega es requerido").max(20);

/** Optional date string (ISO format) */
export const optionalDateSchema = z.string().trim().optional();

/** Optional notes field with max length */
export const notesSchema = z.string().trim().max(400, "Las notas no pueden exceder 400 caracteres").optional();

/** Optional line notes field */
export const lineNotesSchema = z.string().trim().max(300, "Las notas de línea no pueden exceder 300 caracteres").optional();

// ---------------------
// Inventory Line Schemas
// ---------------------

/** Base inventory line without cost */
export const inventoryLineBaseSchema = z.object({
    article_code: articleCodeSchema,
    quantity: quantitySchema,
    unit: inventoryUnitSchema,
    notes: lineNotesSchema,
});

/** Inventory line with optional cost (for purchases) */
export const inventoryLineWithCostSchema = inventoryLineBaseSchema.extend({
    cost_per_unit: costSchema,
});

// ---------------------
// Transaction Schemas
// ---------------------

/** Purchase registration schema */
export const registerPurchaseSchema = z.object({
    document_number: z.string().trim().min(1, "El número de documento es requerido").max(120),
    supplier_name: z.string().trim().min(1, "El nombre del proveedor es requerido").max(160),
    occurred_at: optionalDateSchema,
    status: purchaseStatusSchema.optional(),
    warehouse_code: warehouseCodeSchema,
    notes: notesSchema,
    lines: z.array(inventoryLineWithCostSchema).min(1, "Debes agregar al menos una línea"),
});

/** Consumption registration schema */
export const registerConsumptionSchema = z.object({
    reason: z.string().trim().min(1, "El motivo es requerido").max(160),
    occurred_at: optionalDateSchema,
    authorized_by: z.string().trim().min(1, "El autorizador es requerido").max(160),
    area: z.string().trim().max(160).optional(),
    warehouse_code: warehouseCodeSchema,
    notes: notesSchema,
    lines: z.array(inventoryLineBaseSchema).min(1, "Debes agregar al menos un artículo"),
});

/** Transfer registration schema */
export const registerTransferSchema = z
    .object({
        from_warehouse_code: warehouseCodeSchema,
        to_warehouse_code: warehouseCodeSchema,
        occurred_at: optionalDateSchema,
        authorized_by: z.string().trim().max(80).optional(),
        requested_by: z.string().trim().max(80).optional(),
        notes: notesSchema,
        reference: z.string().trim().max(120).optional(),
        lines: z.array(inventoryLineBaseSchema).min(1, "Debes agregar al menos una línea"),
    })
    .refine((data) => data.from_warehouse_code !== data.to_warehouse_code, {
        message: "El almacén origen y destino deben ser distintos",
        path: ["to_warehouse_code"],
    });

// ---------------------
// Filter Schemas
// ---------------------

/** Kardex filter schema */
export const kardexFilterSchema = z.object({
    article: z.string().trim().optional(),
    articles: z.array(z.string().trim()).optional(),
    from: optionalDateSchema,
    to: optionalDateSchema,
    warehouse_code: z.string().trim().optional(),
    warehouse_codes: z.array(z.string().trim()).optional(),
});

/** Stock filter schema */
export const stockFilterSchema = z.object({
    article: z.string().trim().optional(),
    articles: z.array(z.string().trim()).optional(),
    warehouse_code: z.string().trim().optional(),
    warehouse_codes: z.array(z.string().trim()).optional(),
});

/** Purchase list filter schema */
export const purchaseListFilterSchema = z.object({
    supplier: z.string().trim().optional(),
    status: purchaseStatusSchema.optional().or(z.literal("")),
    from: optionalDateSchema,
    to: optionalDateSchema,
});

/** Consumption list filter schema */
export const consumptionListFilterSchema = z.object({
    article: z.string().trim().optional(),
    from: optionalDateSchema,
    to: optionalDateSchema,
});

/** Transfer list filter schema */
export const transferListFilterSchema = z.object({
    article: z.string().trim().optional(),
    from_warehouse_code: z.string().trim().optional(),
    to_warehouse_code: z.string().trim().optional(),
    from: optionalDateSchema,
    to: optionalDateSchema,
});

/** Document list filter schema */
export const documentListFilterSchema = z.object({
    transaction_types: z.array(transactionTypeSchema).optional(),
    warehouse_codes: z.array(z.string().trim()).optional(),
    search: z.string().trim().optional(),
    from: optionalDateSchema,
    to: optionalDateSchema,
    limit: z.number().int().min(1).max(200).optional(),
});

// ---------------------
// Type Exports
// ---------------------

export type RegisterPurchaseInput = z.infer<typeof registerPurchaseSchema>;
export type RegisterConsumptionInput = z.infer<typeof registerConsumptionSchema>;
export type RegisterTransferInput = z.infer<typeof registerTransferSchema>;
export type KardexFilter = z.infer<typeof kardexFilterSchema>;
export type StockFilter = z.infer<typeof stockFilterSchema>;
export type PurchaseListFilter = z.infer<typeof purchaseListFilterSchema>;
export type ConsumptionListFilter = z.infer<typeof consumptionListFilterSchema>;
export type TransferListFilter = z.infer<typeof transferListFilterSchema>;
export type DocumentListFilter = z.infer<typeof documentListFilterSchema>;
