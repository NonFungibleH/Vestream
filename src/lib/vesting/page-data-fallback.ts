// src/lib/vesting/page-data-fallback.ts
// ─────────────────────────────────────────────────────────────────────────────
// "Last-known-good" fallback store for /protocols and /protocols/[slug].
//
// Purpose: never show users an empty page on these high-traffic SEO surfaces.
//
// The problem this solves:
//   The page loaders use Promise.allSettled across 4-5 DB queries. On a
//   transient hiccup (DB pool blip, RPC timeout) every query can reject,
//   and the loader returns EMPTY data — which then gets cached by
//   `unstable_cache` for 5 minutes AND by Vercel's edge for another 60s.
//   Users see all-dashes for up to 5 minutes after a 200ms transient
//   blip. The 8ddabb7 / 805c2ce fixes reduced symptoms but didn't
//   eliminate them.
//
// The fix (stale-while-error):
//   1. On every SUCCESSFUL render: write the rendered data to Redis with
//      a long TTL (7 days). Fire-and-forget — don't block the response.
//   2. On a DEGRADED render (rejections produced empty result): the
//      loader throws. The page component catches and reads from Redis.
//      If a last-good exists, render it. If not (cold deploy), render
//      genuinely empty — this only happens once per page per deploy.
//   3. unstable_cache doesn't cache thrown errors, so the next request
//      retries naturally — no 5-minute lock-in to bad state.
//
// Trade-off: data shown after a failure is "as fresh as the last
// successful render". That's almost always 1-5 minutes old (the next
// scheduled ISR revalidation cycle). Far better than all-dashes.
//
// 7-day TTL bound: if every render fails for a week, something is
// catastrophically broken — better to show empty than ancient data.
//
// No Redis configured: the get/set helpers no-op and we fall back to
// EMPTY data on degraded renders. Identical to the pre-fix behaviour.
// ─────────────────────────────────────────────────────────────────────────────

import { Redis } from "@upstash/redis";

const KEY_PREFIX        = "vestream:page-fallback:v1";
const TTL_SECONDS       = 60 * 60 * 24 * 7; // 7 days

function getRedis(): Redis | null {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return Redis.fromEnv();
}

/**
 * Read a previously cached "last good" payload, or null if none exists.
 * Errors are swallowed — Redis blip should NEVER cascade into a page
 * render failure (that would defeat the entire purpose of this layer).
 *
 * Deliberately NOT the Upstash SDK: the SDK hardcodes `cache: "no-store"`
 * on every fetch (@upstash/redis nodejs.js → `cache: config.cache ??
 * "no-store"`), which Next 16.3.0-canary.19 hard-errors on inside routes
 * that export `revalidate`, and which would flip an ISR render dynamic.
 * This read runs on the page render path (failure branch + build-phase
 * bake), so it goes through a plain GET against the Upstash REST API with
 * `next.revalidate` — ISR- and build-compatible. 60s of fetch-cache
 * staleness is irrelevant for a value whose whole job is "up to 7 days
 * stale beats empty".
 */
async function readFallback<T>(key: string): Promise<T | null> {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      next:    { revalidate: 60 },
    });
    if (!res.ok) return null;
    // REST shape: { result: string | null }. The SDK JSON-serialises
    // values on write, so a non-null result is a JSON string to parse.
    const body = (await res.json()) as { result: string | null };
    if (body.result == null) return null;
    return JSON.parse(body.result) as T;
  } catch (err) {
    console.error(`[page-fallback] read failed for ${key}:`, err);
    return null;
  }
}

/**
 * Persist the latest successful render. Errors are logged and swallowed.
 *
 * MUST be called from inside `after()` (next/server) on ISR pages — the
 * SDK's no-store fetch is only safe once the response/prerender has
 * finished. Called on every successful render; over time Redis holds the
 * last known good copy of every protocol page + the index.
 */
function writeFallback<T>(key: string, value: T): void {
  const redis = getRedis();
  if (!redis) return;
  // No await — fire-and-forget. Don't block on Redis latency.
  redis.set(key, value, { ex: TTL_SECONDS }).catch((err) => {
    console.error(`[page-fallback] write failed for ${key}:`, err);
  });
}

// ── /protocols/[slug] ──────────────────────────────────────────────────────────

const protocolKey = (slug: string) => `${KEY_PREFIX}:protocol:${slug}`;

export function getLastGoodProtocolData<T>(slug: string): Promise<T | null> {
  return readFallback<T>(protocolKey(slug));
}

export function setLastGoodProtocolData<T>(slug: string, data: T): void {
  writeFallback(protocolKey(slug), data);
}

// ── /protocols (index) ─────────────────────────────────────────────────────────

const indexKey = `${KEY_PREFIX}:index`;

export function getLastGoodProtocolsData<T>(): Promise<T | null> {
  return readFallback<T>(indexKey);
}

export function setLastGoodProtocolsData<T>(data: T): void {
  writeFallback(indexKey, data);
}
