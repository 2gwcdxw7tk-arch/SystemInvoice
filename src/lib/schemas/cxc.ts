/**
 * @fileoverview Zod schemas for CXC (Cuentas por Cobrar) operations.
 */
import { z } from "zod";

// ---------------------
// Field Schemas
// ---------------------

/** Money field that accepts number or string with comma as decimal separator */
export const moneyField = (min = 0) =>
    z.preprocess((value) => {
        if (typeof value === "number") {
            return value;
        }
        if (typeof value === "string" && value.trim().length > 0) {
            const parsed = Number(value.trim().replace(/,/g, "."));
            return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
    }, z.number().min(min, `El monto debe ser al menos ${min}`));

/** Optional nullable string for CXC fields */
export const optionalNullableString = z
    .union([z.string().trim().max(160), z.literal(""), z.null()])
    .optional()
    .transform((value) => {
        if (typeof value === "undefined") return undefined;
        if (value === null) return null;
        const normalized = value.trim();
        return normalized.length > 0 ? normalized : null;
    });

/** Credit status options */
export const creditStatusSchema = z.enum(["ACTIVE", "ON_HOLD", "BLOCKED"]);

// ---------------------
// Customer Schemas
// ---------------------

/** Create customer schema */
export const createCustomerSchema = z.object({
    code: z.string().trim().min(1, "El código es requerido").max(40),
    name: z.string().trim().min(1, "El nombre es requerido").max(160),
    tradeName: optionalNullableString,
    taxId: optionalNullableString,
    email: optionalNullableString,
    phone: optionalNullableString,
    mobilePhone: optionalNullableString,
    billingAddress: optionalNullableString,
    city: optionalNullableString,
    state: optionalNullableString,
    countryCode: z.string().trim().length(2).optional(),
    postalCode: optionalNullableString,
    paymentTermId: z.union([z.number().int().positive(), z.literal(null)]).optional(),
    paymentTermCode: z.union([z.string().trim().max(32), z.literal(null)]).optional(),
    creditLimit: moneyField(0).default(0),
    creditUsed: moneyField(0).optional(),
    creditOnHold: moneyField(0).optional(),
    creditStatus: creditStatusSchema.optional(),
    creditHoldReason: optionalNullableString,
    isActive: z.boolean().optional(),
    notes: optionalNullableString,
});

/** Update customer schema (all fields optional except code) */
export const updateCustomerSchema = createCustomerSchema.partial().extend({
    code: z.string().trim().min(1).max(40).optional(),
});

// ---------------------
// Document Schemas
// ---------------------

/** Document type */
export const documentTypeSchema = z.enum(["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "PAYMENT", "ADJUSTMENT"]);

/** Create document schema */
export const createDocumentSchema = z.object({
    customerCode: z.string().trim().min(1, "El código de cliente es requerido"),
    type: documentTypeSchema,
    documentNumber: z.string().trim().min(1, "El número de documento es requerido").max(60),
    documentDate: z.string().trim().min(1, "La fecha es requerida"),
    dueDate: z.string().trim().optional(),
    amount: moneyField(0),
    notes: optionalNullableString,
});

// ---------------------
// Filter Schemas
// ---------------------

/** Customer list filter schema */
export const customerListFilterSchema = z.object({
    search: z.string().trim().optional(),
    includeInactive: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

/** Document list filter schema */
export const cxcDocumentListFilterSchema = z.object({
    customerCode: z.string().trim().optional(),
    type: documentTypeSchema.optional(),
    status: z.enum(["OPEN", "PARTIAL", "PAID", "CANCELLED"]).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    overdue: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).optional(),
});

// ---------------------
// Type Exports
// ---------------------

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type CustomerListFilter = z.infer<typeof customerListFilterSchema>;
export type CxcDocumentListFilter = z.infer<typeof cxcDocumentListFilterSchema>;
export type CreditStatus = z.infer<typeof creditStatusSchema>;
