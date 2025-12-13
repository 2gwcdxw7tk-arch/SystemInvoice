/**
 * @fileoverview Shared utilities for inventory operations.
 * Contains helper functions used across inventory-related services.
 */
import { toCentralClosedDate, toCentralEndOfDay } from "@/lib/utils/date";
import type { MovementDirection, TransactionType, InventoryUnit, NumericLike } from "@/lib/types/inventory";

// ---------------------
// Type Definitions
// ---------------------

/** Article details from repository */
export interface ArticleDetail {
    id: number;
    article_code: string;
    name: string;
    conversion_factor: number;
    article_type: string;
    default_warehouse_id: number | null | undefined;
    retail_unit: string | null;
    storage_unit: string | null;
}

/** Warehouse context for operations */
export interface WarehouseContext {
    id: number;
    code: string;
    name: string;
}

/** Computed movement details for a line item */
export interface MovementComputation {
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

// ---------------------
// Constants
// ---------------------

/** Valid transaction types */
export const VALID_TRANSACTION_TYPES: TransactionType[] = ["PURCHASE", "CONSUMPTION", "ADJUSTMENT", "TRANSFER"];

/** Transaction type display labels (Spanish) */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
    PURCHASE: "Compra",
    CONSUMPTION: "Consumo",
    ADJUSTMENT: "Ajuste",
    TRANSFER: "Traspaso",
};

/** Movement direction display labels (Spanish) */
export const MOVEMENT_DIRECTION_LABELS: Record<MovementDirection, string> = {
    IN: "Entrada",
    OUT: "Salida",
};

// ---------------------
// Number Utilities
// ---------------------

/**
 * Normalizes a quantity to avoid floating point issues.
 * Returns 0 if the value is within epsilon of 0.
 */
export function normalizeQuantity(value: number, epsilon = 1e-6): number {
    if (Math.abs(value) < epsilon) {
        return 0;
    }
    return value;
}

/**
 * Converts a numeric-like value to a number.
 * Handles strings with comma as decimal separator.
 */
export function toNumber(value: NumericLike | undefined | null, fallback = 0): number {
    if (value === undefined || value === null) return fallback;
    const num = typeof value === "number" ? value : Number(String(value).replace(/,/g, "."));
    if (!Number.isFinite(num)) return fallback;
    return num;
}

/**
 * Formats a number for display using Mexican locale.
 */
export function formatQuantity(value: number, decimals = 4): string {
    return new Intl.NumberFormat("es-MX", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
    }).format(value);
}

// ---------------------
// Date Utilities
// ---------------------

/**
 * Parses a date input string to a Date object.
 * Returns start of day or end of day based on mode.
 */
export function parseDateInput(value?: string, mode: "start" | "end" = "start"): Date {
    const trimmed = value?.trim();
    if (!trimmed) {
        const today = new Date();
        return mode === "start" ? toCentralClosedDate(today) : toCentralEndOfDay(today);
    }
    return mode === "start" ? toCentralClosedDate(trimmed) : toCentralEndOfDay(trimmed);
}

/**
 * Gets today's date in ISO format (YYYY-MM-DD).
 */
export function getTodayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

// ---------------------
// Movement Utilities
// ---------------------

/**
 * Determines the movement direction based on transaction type and quantity.
 */
export function resolveMovementDirection(
    type: TransactionType,
    quantity: number
): MovementDirection {
    if (type === "PURCHASE") return "IN";
    if (type === "CONSUMPTION") return "OUT";
    // For adjustments and transfers, determine by sign
    return quantity >= 0 ? "IN" : "OUT";
}

/**
 * Calculates retail and storage quantities from input.
 */
export function calculateQuantities(
    quantity: number,
    unit: InventoryUnit,
    conversionFactor: number
): { quantityRetail: number; quantityStorage: number } {
    const safeFactor = conversionFactor > 0 ? conversionFactor : 1;
    const quantityRetail = unit === "STORAGE" ? quantity * safeFactor : quantity;
    const quantityStorage = unit === "STORAGE" ? quantity : quantity / safeFactor;
    return { quantityRetail, quantityStorage };
}

/**
 * Validates that a warehouse code is provided and not empty.
 */
export function validateWarehouseCode(code: string | undefined | null, fieldName = "almacén"): string {
    const trimmed = code?.trim()?.toUpperCase();
    if (!trimmed) {
        throw new Error(`El código de ${fieldName} es requerido`);
    }
    return trimmed;
}

/**
 * Validates that an article code is provided and not empty.
 */
export function validateArticleCode(code: string | undefined | null): string {
    const trimmed = code?.trim()?.toUpperCase();
    if (!trimmed) {
        throw new Error("El código de artículo es requerido");
    }
    return trimmed;
}

// ---------------------
// Error Utilities
// ---------------------

/**
 * Creates a user-friendly error message for inventory operations.
 */
export function createInventoryError(
    operation: string,
    details?: string
): Error {
    const message = details ? `${operation}: ${details}` : operation;
    return new Error(message);
}

/**
 * Extracts error message from unknown error type.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return fallback;
}
