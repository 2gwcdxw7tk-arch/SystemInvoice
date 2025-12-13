/**
 * @fileoverview Centralized error types and utilities for the application.
 * Provides consistent error handling across APIs and services.
 */

// ---------------------
// Error Types
// ---------------------

export type ErrorCode =
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "CONFLICT"
    | "INTERNAL_ERROR"
    | "BAD_REQUEST"
    | "RATE_LIMITED"
    | "SERVICE_UNAVAILABLE";

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
    VALIDATION_ERROR: 400,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
};

const ERROR_MESSAGES: Record<ErrorCode, string> = {
    VALIDATION_ERROR: "Los datos proporcionados son inválidos",
    BAD_REQUEST: "Solicitud incorrecta",
    UNAUTHORIZED: "No autorizado. Por favor inicia sesión",
    FORBIDDEN: "No tienes permisos para realizar esta acción",
    NOT_FOUND: "El recurso solicitado no fue encontrado",
    CONFLICT: "Existe un conflicto con el estado actual del recurso",
    RATE_LIMITED: "Demasiadas solicitudes. Por favor espera un momento",
    INTERNAL_ERROR: "Ha ocurrido un error interno. Por favor intenta de nuevo",
    SERVICE_UNAVAILABLE: "El servicio no está disponible temporalmente",
};

// ---------------------
// Custom Error Class
// ---------------------

/**
 * Application-specific error class with structured error information.
 */
export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;
    public readonly details?: Record<string, unknown>;
    public readonly isOperational: boolean;

    constructor(
        code: ErrorCode,
        message?: string,
        details?: Record<string, unknown>
    ) {
        super(message || ERROR_MESSAGES[code]);
        this.name = "AppError";
        this.code = code;
        this.statusCode = ERROR_STATUS_MAP[code];
        this.details = details;
        this.isOperational = true; // Distinguishes from programming errors

        // Maintains proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }

    toJSON(): Record<string, unknown> {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                ...(this.details && { details: this.details }),
            },
        };
    }
}

// ---------------------
// Error Factory Functions
// ---------------------

/**
 * Creates a validation error with field-specific details.
 */
export function validationError(
    message: string,
    fields?: Record<string, string[]>
): AppError {
    return new AppError("VALIDATION_ERROR", message, fields ? { fields } : undefined);
}

/**
 * Creates a not found error.
 */
export function notFoundError(resource = "Recurso"): AppError {
    return new AppError("NOT_FOUND", `${resource} no encontrado`);
}

/**
 * Creates an unauthorized error.
 */
export function unauthorizedError(message = "No autorizado"): AppError {
    return new AppError("UNAUTHORIZED", message);
}

/**
 * Creates a forbidden error.
 */
export function forbiddenError(message = "No tienes permisos para esta acción"): AppError {
    return new AppError("FORBIDDEN", message);
}

/**
 * Creates a conflict error (e.g., duplicate entry).
 */
export function conflictError(message: string): AppError {
    return new AppError("CONFLICT", message);
}

/**
 * Creates an internal error.
 */
export function internalError(message = "Error interno del servidor"): AppError {
    return new AppError("INTERNAL_ERROR", message);
}

// ---------------------
// Error Utilities
// ---------------------

/**
 * Checks if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}

/**
 * Extracts a user-friendly message from any error type.
 */
export function getErrorMessage(error: unknown, fallback = "Ha ocurrido un error"): string {
    if (isAppError(error)) {
        return error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return fallback;
}

/**
 * Wraps an async function to catch errors and convert them to AppError.
 */
export async function tryCatch<T>(
    fn: () => Promise<T>,
    errorMessage = "Error al procesar la solicitud"
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (isAppError(error)) {
            throw error;
        }
        throw new AppError("INTERNAL_ERROR", errorMessage, {
            originalError: error instanceof Error ? error.message : String(error),
        });
    }
}

/**
 * Logs an error with context for debugging.
 */
export function logError(
    error: unknown,
    context?: { operation?: string; userId?: string | number;[key: string]: unknown }
): void {
    const errorInfo = {
        timestamp: new Date().toISOString(),
        ...(context && { context }),
        error: error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...(isAppError(error) && { code: error.code, details: error.details }),
            }
            : { value: String(error) },
    };

    console.error("[AppError]", JSON.stringify(errorInfo, null, 2));
}
