/**
 * Rate limiting utility using Upstash Redis.
 *
 * Gracefully degrades when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 * are not set — requests are allowed through with a warning (useful in dev).
 *
 * Usage:
 *   const result = await ratelimit("waitlist", ip, 5, "1 h");
 *   if (!result.allowed) return 429 response;
 *
 * Set these in Vercel environment variables (and .env.local for dev):
 *   UPSTASH_REDIS_REST_URL   — from Upstash console → REST API tab
 *   UPSTASH_REDIS_REST_TOKEN — from Upstash console → REST API tab
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RatelimitResult = { allowed: boolean; remaining: number; reset: number };

// Singleton — reused across warm lambda invocations. Using const: the Map
// reference never changes, only its contents (which doesn't violate immutability).
const limiterCache: Map<string, Ratelimit> = new Map();

function getLimiter(requests: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]): Ratelimit | null {
  const key = `${requests}:${window}`;
  if (limiterCache.has(key)) return limiterCache.get(key)!;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Dev mode — no Redis configured
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
    // No Redis configured — allow all (dev/staging without Upstash)
    return { allowed: true, remaining: requests, reset: Date.now() + 3_600_000 };
  }

  const result = await limiter.limit(`${prefix}:${id}`);
  return {
    allowed:   result.success,
    remaining: result.remaining,
    reset:     result.reset,
  };
}
