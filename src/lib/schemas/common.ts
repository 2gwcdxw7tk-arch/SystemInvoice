/**
 * @fileoverview Common Zod schemas shared across the application.
 */
import { z } from "zod";

// ---------------------
// String Schemas
// ---------------------

/** Non-empty trimmed string */
export const requiredString = (fieldName = "Este campo") =>
    z.string().trim().min(1, `${fieldName} es requerido`);

/** Optional trimmed string with max length */
export const optionalString = (maxLength = 255) =>
    z.string().trim().max(maxLength).optional();

/** Code field (uppercase, alphanumeric with dashes) */
export const codeSchema = z
    .string()
    .trim()
    .min(1, "El código es requerido")
    .max(40)
    .transform((val) => val.toUpperCase());

/** Email field */
export const emailSchema = z.string().trim().email("Email inválido").max(255);

/** Optional email field */
export const optionalEmailSchema = z.string().trim().email("Email inválido").max(255).optional().or(z.literal(""));

// ---------------------
// Numeric Schemas
// ---------------------

/** Positive integer */
export const positiveIntSchema = z.number().int().positive("Debe ser un número positivo");

/** Non-negative integer */
export const nonNegativeIntSchema = z.number().int().nonnegative("No puede ser negativo");

/** Positive number (decimal allowed) */
export const positiveNumberSchema = z.number().positive("Debe ser un número positivo");

/** Non-negative number (decimal allowed) */
export const nonNegativeNumberSchema = z.number().nonnegative("No puede ser negativo");

/** ID field (positive integer) */
export const idSchema = z.number().int().positive();

/** Optional ID field */
export const optionalIdSchema = z.number().int().positive().optional();

// ---------------------
// Date Schemas
// ---------------------

/** ISO date string (YYYY-MM-DD) */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)");

/** Optional ISO date string */
export const optionalIsoDateSchema = isoDateSchema.optional().or(z.literal(""));

/** Date or date string */
export const dateOrStringSchema = z.union([z.date(), z.string().datetime()]);

// ---------------------
// Boolean Schemas
// ---------------------

/** Coerce to boolean */
export const coerceBoolean = z.preprocess((val) => {
    if (typeof val === "boolean") return val;
    if (val === "true" || val === "1") return true;
    if (val === "false" || val === "0") return false;
    return val;
}, z.boolean());

// ---------------------
// Pagination Schemas
// ---------------------

/** Pagination input */
export const paginationSchema = z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
});

/** Search params with pagination */
export const searchWithPaginationSchema = paginationSchema.extend({
    search: z.string().trim().optional(),
});

// ---------------------
// API Response Schemas
// ---------------------

/** Standard success response */
export const successResponseSchema = z.object({
    success: z.literal(true),
    message: z.string().optional(),
});

/** Standard error response */
export const errorResponseSchema = z.object({
    success: z.literal(false),
    message: z.string(),
    errors: z.record(z.array(z.string())).optional(),
});

// ---------------------
// Helper Functions
// ---------------------

/**
 * Creates a schema that accepts a value from URL search params,
 * coercing strings to proper types.
 */
export function coerceFromSearchParams<T extends z.ZodTypeAny>(schema: T) {
    return z.preprocess((val) => {
        if (typeof val === "string") {
            // Try to parse as number
            const num = Number(val);
            if (!Number.isNaN(num)) return num;
            // Try to parse as boolean
            if (val === "true") return true;
            if (val === "false") return false;
        }
        return val;
    }, schema);
}

/**
 * Validates and returns data, or throws with user-friendly message.
 */
export function parseOrThrow<T>(schema: z.ZodSchema<T>, data: unknown, context = "Datos"): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        const firstError = result.error.errors[0];
        throw new Error(`${context} inválidos: ${firstError?.message || "Error de validación"}`);
    }
    return result.data;
}
