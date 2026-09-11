// src/lib/sitemap-token-cache.ts
// ─────────────────────────────────────────────────────────────────────────────
// Last-good cache for the sitemap's token/symbol URL lists.
//
// The problem (July 2026): the production sitemap served 71 URLs and ZERO of
// the ~2,000 /token + /tokens SEO pages, so Google could not discover them. The
// data + query are healthy (a local build against prod generates the full list)
// — the runtime ISR regeneration was failing on a transient Supabase pooler
// connection and the error was swallowed, leaving an empty sitemap that never
// self-healed.
//
// Fix: the hourly refresh-rollups cron (which has a warm, healthy DB right after
// it rebuilds token_vesting_rollups) writes the URL lists here; the sitemap
// reads live-with-retry and falls back to THIS cache if the live read still
// comes back empty. Once populated, the sitemap can never regress to empty.
//
// WRITE side (cron, node runtime, not ISR): the @upstash/redis SDK is fine.
// READ side (sitemap, an ISR route): the SDK hardcodes cache:"no-store" which
// hard-errors inside ISR, so the read uses a plain REST fetch with
// next.revalidate — per the documented ISR/Upstash rule in CLAUDE.md.
// ─────────────────────────────────────────────────────────────────────────────

const SYMBOLS_KEY = "sitemap:top-symbols:v1";
const TOKENS_KEY  = "sitemap:top-tokens:v1";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, comfortably longer than the hourly refresh

export interface SitemapTokenEntry { chainId: number; address: string }

function restEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

/**
 * WRITE — called from the refresh-rollups cron after the rollup rebuild, when
 * the DB is warm. Uses the Upstash SDK (safe outside ISR). Best-effort.
 */
export async function writeSitemapTokenCache(
  symbols: string[],
  tokens: SitemapTokenEntry[],
): Promise<void> {
  const env = restEnv();
  if (!env) return;
  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: env.url, token: env.token });
    await Promise.all([
      symbols.length ? redis.set(SYMBOLS_KEY, JSON.stringify(symbols), { ex: TTL_SECONDS }) : Promise.resolve(),
      tokens.length ? redis.set(TOKENS_KEY, JSON.stringify(tokens), { ex: TTL_SECONDS }) : Promise.resolve(),
    ]);
  } catch (err) {
    console.warn("[sitemap-cache] write failed (non-fatal):", err);
  }
}

/** Plain-REST GET (ISR-safe). Returns the parsed value or null. */
async function restGet<T>(key: string): Promise<T | null> {
  const env = restEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as T;
  } catch (err) {
    console.warn(`[sitemap-cache] read ${key} failed (non-fatal):`, err);
    return null;
  }
}

/** READ — called from the sitemap (ISR). Last-good fallback when the live query is empty. */
export async function readSitemapSymbolsCache(): Promise<string[]> {
  return (await restGet<string[]>(SYMBOLS_KEY)) ?? [];
}
export async function readSitemapTokensCache(): Promise<SitemapTokenEntry[]> {
  return (await restGet<SitemapTokenEntry[]>(TOKENS_KEY)) ?? [];
}

/**
 * The canonical list of token pages worth prerendering / precomputing.
 *
 * Redis first (fast, build-safe REST read of the list the refresh-rollups
 * cron writes); if that is empty or unreachable, the same rollup query the
 * sitemap itself uses, bounded so a slow pooler can only cost 5s. Both the
 * token page's generateStaticParams and the warm cron's precompute read
 * through this, so neither has a single point of failure on the Redis key —
 * an empty key would otherwise silently shrink the bake to the one USDC
 * sample and leave the whole long tail cold again.
 */
export async function listSitemapTokens(): Promise<SitemapTokenEntry[]> {
  const cached = await readSitemapTokensCache();
  if (cached.length > 0) return cached;
  try {
    const { getTopTokens } = await import("./vesting/token-symbols");
    const { withTimeout } = await import("./with-timeout");
    const rows = await withTimeout(getTopTokens(1500), 5_000, [], "sitemap-tokens:db");
    return rows.map((r) => ({ chainId: r.chainId, address: r.address }));
  } catch (err) {
    console.warn("[sitemap-cache] DB fallback for token list failed (non-fatal):", err);
    return [];
  }
}
