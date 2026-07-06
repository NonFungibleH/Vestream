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

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pageFallback } from "@/lib/db/schema";

const KEY_PREFIX        = "vestream:page-fallback:v1";
const TTL_SECONDS       = 60 * 60 * 24 * 7; // 7 days

// ─────────────────────────────────────────────────────────────────────────────
// Durable L2 (Postgres). Added 2026-06-26.
//
// Redis (the L1 below) is fast but Upstash's Hobby tier EVICTS keys under
// memory pressure — so the "never empty" net had holes exactly when it was
// needed: right after a deploy (the page's DB reads short-circuit to empty
// during `next build`) or on a pooler blip, the Redis last-good was itself
// gone → users saw the bare empty state ("Pricing indexed tokens…"). Postgres
// never evicts, so a one-row-per-key table is the durable backing.
//
// Build-safety: unlike the landmined DB query helpers (which short-circuit to
// empty during `next build`), this READ deliberately runs at build time too —
// its whole job is to bake real last-good HTML instead of an empty page. It's
// safe at build because a hard 2s race + try/catch means it can only ever
// resolve to data-or-null, never hang or throw (the precise failure the build
// short-circuit guards against). WRITES are skipped at build.
const DB_READ_TIMEOUT_MS = 2_000;
const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

async function readFallbackDb<T>(key: string): Promise<T | null> {
  try {
    const rows = await Promise.race([
      db.select({ payload: pageFallback.payload })
        .from(pageFallback)
        .where(eq(pageFallback.cacheKey, key))
        .limit(1),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("page-fallback DB read timeout")), DB_READ_TIMEOUT_MS),
      ),
    ]);
    return (rows[0]?.payload ?? null) as T | null;
  } catch (err) {
    console.error(`[page-fallback] DB read failed for ${key}:`, err);
    return null;
  }
}

function writeFallbackDb<T>(key: string, value: T): void {
  if (isBuildPhase()) return; // never write mid-prerender
  // Fire-and-forget upsert — don't block the response on DB latency.
  db.insert(pageFallback)
    .values({ cacheKey: key, payload: value as object })
    .onConflictDoUpdate({
      target: pageFallback.cacheKey,
      set:    { payload: value as object, updatedAt: new Date() },
    })
    .catch((err) => {
      console.error(`[page-fallback] DB write failed for ${key}:`, err);
    });
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
async function readFallbackRedis<T>(key: string): Promise<T | null> {
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
 * Deliberately NOT the Upstash SDK: its `.set()` is a `cache: "no-store"`
 * fetch, which trips Next 16's dynamic-usage detector even inside `after()`
 * during a static/ISR prerender — the source of the recurring
 * "[page-fallback] Redis write failed … DYNAMIC_SERVER_USAGE" log. This uses a
 * plain REST SET (command-array form) against the Upstash REST API, mirroring
 * readFallbackRedis. The value is JSON.stringify'd to match what the SDK wrote
 * (and what readFallbackRedis JSON.parses back). Fire-and-forget; swallowed.
 */
function writeFallbackRedis<T>(key: string, value: T): void {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  // No await — don't block the render/after() on Redis latency.
  fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(["SET", key, JSON.stringify(value), "EX", String(TTL_SECONDS)]),
  }).catch((err) => {
    console.error(`[page-fallback] Redis write failed for ${key}:`, err);
  });
}

// ── Combined L1 (Redis) + L2 (Postgres) ─────────────────────────────────────
//
// Read: try Redis first (fast, build-safe REST). On a miss — including the
// Hobby-tier eviction case that motivated this layer — fall through to the
// durable Postgres row. Write: persist to BOTH so the fast path stays warm and
// the durable path can never be empty once a single good render has happened.

async function readFallback<T>(key: string): Promise<T | null> {
  const fromRedis = await readFallbackRedis<T>(key);
  if (fromRedis != null) return fromRedis;
  return readFallbackDb<T>(key);
}

function writeFallback<T>(key: string, value: T): void {
  writeFallbackRedis(key, value);
  writeFallbackDb(key, value);
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

// ── /status (durable L2 only) ───────────────────────────────────────────────────
// /status keeps its own Upstash-SDK Redis as L1 (it's force-dynamic, so the
// no-store SDK is safe there); these add a durable Postgres L2 underneath so a
// cold-lambda read timing out — or a Hobby-tier Redis eviction — still renders
// real data instead of an all-"Pending" empty grid.

const statusKey = `${KEY_PREFIX}:status`;

export function getLastGoodStatusDb<T>(): Promise<T | null> {
  return readFallbackDb<T>(statusKey);
}

export function setLastGoodStatusDb<T>(data: T): void {
  writeFallbackDb(statusKey, data);
}
