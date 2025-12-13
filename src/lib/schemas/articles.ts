/**
 * @fileoverview Zod schemas for article operations.
 */
import { z } from "zod";

// ---------------------
// Article Schemas
// ---------------------

/** Article type enum */
export const articleTypeSchema = z.enum(["TERMINADO", "KIT"]);

/** Create/Update article input schema */
export const articleInputSchema = z.object({
    article_code: z.string().trim().min(1, "El código es requerido").max(40),
    name: z.string().trim().min(1, "El nombre es requerido").max(200),
    classification_full_code: z.string().trim().max(24).nullable().optional(),
    storage_unit_id: z.number().int().positive("La unidad de almacén es requerida"),
    retail_unit_id: z.number().int().positive("La unidad de venta es requerida"),
    conversion_factor: z.number().positive("El factor de conversión debe ser positivo"),
    article_type: articleTypeSchema,
    default_warehouse_id: z.number().int().positive().nullable().optional(),
    classification_level1_id: z.number().int().positive().nullable().optional(),
    classification_level2_id: z.number().int().positive().nullable().optional(),
    classification_level3_id: z.number().int().positive().nullable().optional(),
});

/** Article list filter schema */
export const articleListFilterSchema = z.object({
    search: z.string().trim().optional(),
    price_list_code: z.string().trim().optional(),
    unit: z.enum(["RETAIL", "STORAGE"]).optional(),
    on_date: z.string().trim().optional(),
    warehouse_code: z.string().trim().optional(),
    include_units: z.boolean().optional(),
});

// ---------------------
// Kit Schemas
// ---------------------

/** Kit component schema */
export const kitComponentSchema = z.object({
    componentArticleCode: z.string().trim().min(1, "El código del componente es requerido"),
    componentArticleId: z.number().int().positive().optional(),
    quantity: z.number().positive("La cantidad debe ser positiva"),
    unit: z.enum(["STORAGE", "RETAIL"]).optional().default("RETAIL"),
});

/** Create kit schema */
export const createKitSchema = z.object({
    kitArticleCode: z.string().trim().min(1, "El código del kit es requerido"),
    components: z.array(kitComponentSchema).min(1, "El kit debe tener al menos un componente"),
});

// ---------------------
// Type Exports
// ---------------------

export type ArticleInput = z.infer<typeof articleInputSchema>;
export type ArticleListFilter = z.infer<typeof articleListFilterSchema>;
export type KitComponent = z.infer<typeof kitComponentSchema>;
export type CreateKitInput = z.infer<typeof createKitSchema>;
export type ArticleType = z.infer<typeof articleTypeSchema>;
