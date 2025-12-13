/**
 * @fileoverview Simple in-memory rate limiter for API protection.
 * 
 * NOTE: This is an in-memory implementation suitable for single-instance deployments.
 * For production with multiple instances, consider using Redis-based solutions like
 * @upstash/ratelimit or Vercel KV.
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

interface RateLimitOptions {
    /** Maximum number of requests allowed in the window */
    limit: number;
    /** Time window in milliseconds */
    windowMs: number;
    /** Custom key generator for identifying clients */
    keyGenerator?: (request: Request) => string;
}

interface RateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    resetAt: Date;
}

/**
 * Simple in-memory rate limiter with sliding window.
 */
class InMemoryRateLimiter {
    private store = new Map<string, RateLimitEntry>();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Clean up expired entries every minute
        if (typeof setInterval !== "undefined") {
            this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
        }
    }

    /**
     * Check if a request should be allowed.
     */
    check(key: string, options: RateLimitOptions): RateLimitResult {
        const now = Date.now();
        const entry = this.store.get(key);

        // No existing entry or expired
        if (!entry || entry.resetAt <= now) {
            const resetAt = now + options.windowMs;
            this.store.set(key, { count: 1, resetAt });
            return {
                success: true,
                limit: options.limit,
                remaining: options.limit - 1,
                resetAt: new Date(resetAt),
            };
        }

        // Entry exists and not expired
        if (entry.count >= options.limit) {
            return {
                success: false,
                limit: options.limit,
                remaining: 0,
                resetAt: new Date(entry.resetAt),
            };
        }

        // Increment count
        entry.count += 1;
        return {
            success: true,
            limit: options.limit,
            remaining: options.limit - entry.count,
            resetAt: new Date(entry.resetAt),
        };
    }

    /**
     * Reset the rate limit for a specific key.
     */
    reset(key: string): void {
        this.store.delete(key);
    }

    /**
     * Clean up expired entries to prevent memory leaks.
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.resetAt <= now) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Get the current store size (for monitoring).
     */
    get size(): number {
        return this.store.size;
    }

    /**
     * Destroy the limiter and clean up resources.
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.store.clear();
    }
}

// Singleton instance
const rateLimiter = new InMemoryRateLimiter();

// ---------------------
// Preset Configurations
// ---------------------

/** Default rate limit: 100 requests per minute */
export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
    limit: 100,
    windowMs: 60_000, // 1 minute
};

/** Strict rate limit for sensitive operations: 10 requests per minute */
export const STRICT_RATE_LIMIT: RateLimitOptions = {
    limit: 10,
    windowMs: 60_000,
};

/** Relaxed rate limit for read-only operations: 200 requests per minute */
export const RELAXED_RATE_LIMIT: RateLimitOptions = {
    limit: 200,
    windowMs: 60_000,
};

/** Auth rate limit: 5 attempts per 15 minutes */
export const AUTH_RATE_LIMIT: RateLimitOptions = {
    limit: 5,
    windowMs: 15 * 60_000, // 15 minutes
};

// ---------------------
// Helper Functions
// ---------------------

/**
 * Gets the client identifier from a request.
 * Uses X-Forwarded-For header if available, otherwise falls back to a default.
 */
export function getClientIdentifier(request: Request): string {
    // Try to get real IP from headers (set by proxies/load balancers)
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        // Take the first IP in the chain
        return forwardedFor.split(",")[0].trim();
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return realIp.trim();
    }

    // Fallback for development/local
    return "anonymous";
}

/**
 * Check rate limit for a request.
 */
export function checkRateLimit(
    request: Request,
    options: RateLimitOptions = DEFAULT_RATE_LIMIT,
    prefix = "api"
): RateLimitResult {
    const clientId = options.keyGenerator?.(request) || getClientIdentifier(request);
    const key = `${prefix}:${clientId}`;
    return rateLimiter.check(key, options);
}

/**
 * Creates rate limit headers for the response.
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": result.resetAt.toISOString(),
    };
}

/**
 * Creates a rate limit exceeded response.
 */
export function rateLimitExceededResponse(result: RateLimitResult): Response {
    const retryAfterSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);

    return new Response(
        JSON.stringify({
            success: false,
            message: "Demasiadas solicitudes. Por favor espera un momento.",
            code: "RATE_LIMITED",
            retryAfter: retryAfterSeconds,
        }),
        {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": String(retryAfterSeconds),
                ...createRateLimitHeaders(result),
            },
        }
    );
}

/**
 * Applies rate limiting to a request.
 * Returns null if allowed, or a Response if rate limited.
 */
export function applyRateLimit(
    request: Request,
    options: RateLimitOptions = DEFAULT_RATE_LIMIT,
    prefix = "api"
): Response | null {
    const result = checkRateLimit(request, options, prefix);

    if (!result.success) {
        return rateLimitExceededResponse(result);
    }

    return null;
}

// Export the limiter for advanced use cases
export { rateLimiter, type RateLimitOptions, type RateLimitResult };
