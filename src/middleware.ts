import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
    applyRateLimit,
    DEFAULT_RATE_LIMIT,
    STRICT_RATE_LIMIT,
    AUTH_RATE_LIMIT,
    createRateLimitHeaders,
    checkRateLimit,
} from "@/lib/middleware/rate-limit";

/**
 * Next.js Middleware
 * 
 * Applies rate limiting to API routes.
 * - /api/login: Strict limit (5 attempts per 15 min)
 * - /api/* POST/PUT/DELETE: Default limit (100 per min)
 * - /api/* GET: Relaxed limit (200 per min)
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only apply rate limiting to API routes
    if (!pathname.startsWith("/api/")) {
        return NextResponse.next();
    }

    // Skip rate limiting for health checks
    if (pathname === "/api/health") {
        return NextResponse.next();
    }

    // Determine rate limit based on route and method
    let rateLimitConfig = DEFAULT_RATE_LIMIT;
    let prefix = "api";

    // Auth routes get stricter limits
    if (pathname === "/api/login") {
        rateLimitConfig = AUTH_RATE_LIMIT;
        prefix = "auth";
    }
    // Mutation operations get stricter limits
    else if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        rateLimitConfig = STRICT_RATE_LIMIT;
        prefix = "api:mutate";
    }

    // Check rate limit
    const rateLimitResponse = applyRateLimit(request, rateLimitConfig, prefix);

    if (rateLimitResponse) {
        // Rate limit exceeded
        return rateLimitResponse;
    }

    // Get the result to add headers
    const result = checkRateLimit(request, rateLimitConfig, prefix);

    // Continue with rate limit headers
    const response = NextResponse.next();

    // Add rate limit headers for transparency
    const headers = createRateLimitHeaders(result);
    for (const [key, value] of Object.entries(headers)) {
        response.headers.set(key, value);
    }

    return response;
}

/**
 * Configure which routes the middleware applies to.
 * Only match API routes for rate limiting.
 */
export const config = {
    matcher: [
        "/api/:path*",
    ],
};
