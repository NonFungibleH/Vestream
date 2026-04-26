/**
 * Rate limiting utility using Upstash Redis.
 *
 * Behaviour by environment:
 *   - Production: REQUIRES Upstash. If env vars are missing, every call to
 *     `checkRateLimit()` returns `{ allowed: false }` — fail closed. This
 *     prevents a misconfigured prod from silently disabling OTP brute-force
 *     protection, signup throttling, and every other rate-limited route.
 *   - Dev/test: gracefully degrades — requests are allowed through with no
 *     Redis configured, so local work doesn't need an Upstash account.
 *
 * Usage:
 *   const result = await checkRateLimit("waitlist", ip, 5, "1 h");
 *   if (!result.allowed) return 429 response;
 *
 * Set these in Vercel environment variables (and .env.local for dev):
 *   UPSTASH_REDIS_REST_URL   — from Upstash console → REST API tab
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console → REST API tab
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type RatelimitResult = {
  allowed:   boolean;
  remaining: number;
  reset:     number;
  /** Set when allowed=false explains *why* — useful for client-side messaging. */
  reason?:   "rate-limit-exceeded" | "rate-limit-misconfigured";
};

// Singleton — reused across warm lambda invocations. Using const: the Map
// reference never changes, only its contents (which doesn't violate immutability).
const limiterCache: Map<string, Ratelimit> = new Map();

// Startup-warning: log once if production boots without Upstash. We log at
// module-evaluation time so the message hits Vercel/Sentry as soon as the
// route bundle loads, not on the first rate-limited request.
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
) {
  console.error(
    "[ratelimit] CRITICAL: UPSTASH env vars missing in production — all rate-limited routes will fail closed."
  );
}

function getLimiter(requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]): Ratelimit | null {
  const key = `${requests}:${window}`;
  if (limiterCache.has(key)) return limiterCache.get(key)!;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // No Redis configured — caller decides what to do (dev: lenient, prod: fail closed)
    return null;
  }

  const limiter = new Ratelimit({
    redis:     Redis.fromEnv(),
    limiter:   Ratelimit.slidingWindow(requests, window),
    analytics: false,
  });

  limiterCache.set(key, limiter);
  return limiter;
}

/**
 * Check rate limit for a given identifier (e.g. IP address).
 *
 * @param prefix   - Namespace prefix (e.g. "waitlist", "dashboard")
 * @param id       - Unique identifier (usually IP)
 * @param requests - Max requests allowed
 * @param window   - Time window, e.g. "1 h", "10 m"
 */
export async function checkRateLimit(
  prefix:   string,
  id:       string,
  requests: number,
  window:   Parameters<typeof Ratelimit.slidingWindow>[1]
): Promise<RatelimitResult> {
  const limiter = getLimiter(requests, window);

  if (!limiter) {
    // Production must fail CLOSED — a missing rate limiter in prod means
    // OTP brute-force protection (and every other rate gate) is disabled,
    // which is worse than serving 503s on the affected routes until ops
    // restores the Upstash credentials.
    if (process.env.NODE_ENV === "production") {
      return {
        allowed:   false,
        remaining: 0,
        reset:     Date.now() + 60_000,
        reason:    "rate-limit-misconfigured",
      };
    }
    // Dev/test — allow all (no Upstash needed for local work)
    return { allowed: true, remaining: requests, reset: Date.now() + 3_600_000 };
  }

  const result = await limiter.limit(`${prefix}:${id}`);
  return {
    allowed:   result.success,
    remaining: result.remaining,
    reset:     result.reset,
    reason:    result.success ? undefined : "rate-limit-exceeded",
  };
}

/**
 * Convert a `checkRateLimit()` result into an HTTP response, or return null
 * if the request is allowed.
 *
 * Distinguishes a real rate-limit hit (429 + the supplied user-facing
 * message) from a misconfigured limiter in production (503 + a generic
 * "service temporarily unavailable" message). Without this distinction,
 * users see "you've hit the rate limit" copy when the underlying cause is
 * actually that Upstash env vars aren't set — which is the exact false
 * report this helper exists to prevent.
 *
 * Usage:
 *   const rl = await checkRateLimit("waitlist", ip, 5, "1 h");
 *   const blocked = rateLimitResponse(rl, "Too many signups. Try again in an hour.");
 *   if (blocked) return blocked;
 */
export function rateLimitResponse(
  result:           RatelimitResult,
  rateLimitMessage: string,
): NextResponse | null {
  if (result.allowed) return null;
  if (result.reason === "rate-limit-misconfigured") {
    return NextResponse.json(
      { error: "Service temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: rateLimitMessage },
    {
      status:  429,
      headers: { "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)) },
    }
  );
}
