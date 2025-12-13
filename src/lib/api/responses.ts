/**
 * @fileoverview API response helpers for consistent response formatting.
 */
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { AppError, isAppError, logError } from "@/lib/errors";

// ---------------------
// Response Types
// ---------------------

export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data?: T;
    message?: string;
}

export interface ApiErrorResponse {
    success: false;
    message: string;
    code?: string;
    errors?: Record<string, string[]>;
}

// ---------------------
// Success Responses
// ---------------------

/**
 * Creates a successful JSON response.
 */
export function successResponse<T>(
    data?: T,
    message?: string,
    status = 200
): NextResponse<ApiSuccessResponse<T>> {
    return NextResponse.json(
        {
            success: true as const,
            ...(data !== undefined && { data }),
            ...(message && { message }),
        },
        { status }
    );
}

/**
 * Creates a successful creation response (201).
 */
export function createdResponse<T>(
    data: T,
    message = "Recurso creado exitosamente"
): NextResponse<ApiSuccessResponse<T>> {
    return successResponse(data, message, 201);
}

/**
 * Creates a no-content response (204).
 */
export function noContentResponse(): NextResponse {
    return new NextResponse(null, { status: 204 });
}

// ---------------------
// Error Responses
// ---------------------

/**
 * Creates an error JSON response from AppError.
 */
export function errorResponse(
    error: AppError
): NextResponse<ApiErrorResponse> {
    const fields = error.details?.fields as Record<string, string[]> | undefined;
    return NextResponse.json(
        {
            success: false as const,
            message: error.message,
            code: error.code,
            ...(fields && { errors: fields }),
        },
        { status: error.statusCode }
    );
}

/**
 * Creates an error response from Zod validation error.
 */
export function zodErrorResponse(
    error: ZodError,
    message = "Datos inválidos"
): NextResponse<ApiErrorResponse> {
    const flattened = error.flatten();
    return NextResponse.json(
        {
            success: false as const,
            message,
            code: "VALIDATION_ERROR",
            errors: {
                ...flattened.fieldErrors,
                ...(flattened.formErrors.length > 0 && { _form: flattened.formErrors }),
            } as Record<string, string[]>,
        },
        { status: 400 }
    );
}

/**
 * Creates a generic error response from any error type.
 */
export function handleApiError(
    error: unknown,
    context?: { operation?: string;[key: string]: unknown }
): NextResponse<ApiErrorResponse> {
    // Log the error for debugging
    logError(error, context);

    // Handle known AppError
    if (isAppError(error)) {
        return errorResponse(error);
    }

    // Handle unknown errors
    const message = error instanceof Error
        ? error.message
        : "Ha ocurrido un error inesperado";

    return NextResponse.json(
        {
            success: false as const,
            message,
            code: "INTERNAL_ERROR",
        },
        { status: 500 }
    );
}

// ---------------------
// Validation Helpers
// ---------------------

/**
 * Validates request body with Zod schema and returns error response if invalid.
 */
export async function validateBody<T>(
    request: Request,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: ZodError<any> } }
): Promise<T | NextResponse<ApiErrorResponse>> {
    try {
        const body = await request.json();
        const result = schema.safeParse(body);

        if (!result.success) {
            return zodErrorResponse(result.error!);
        }

        return result.data!;
    } catch {
        return NextResponse.json(
            {
                success: false as const,
                message: "El cuerpo de la solicitud no es JSON válido",
                code: "BAD_REQUEST",
            },
            { status: 400 }
        );
    }
}
