import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { readFromCache, writeToCache, readAllStreamsForWallets, mergeFreshWithCached } from "@/lib/vesting/dbcache";
import { getUserByAddress } from "@/lib/db/queries";
import { canAccessDashboard, normaliseTier } from "@/lib/auth/tier";

// ─── Hot in-memory cache (L1) ─────────────────────────────────────────────────
// Avoids DB round-trips for the same request within a single server instance.
// The DB cache (L2) handles persistence across restarts and different instances.
const CACHE_TTL_MS = 5 * 60 * 1000;
const hotCache = new Map<string, { streams: VestingStream[]; expiresAt: number; fetchedAt: string }>();

function cacheKey(
  wallets:      string[],
  chainIds:     SupportedChainId[],
  protocolIds?: string[],
  tokenFilters?: Record<string, string>,
): string {
  const p = protocolIds ? `_${[...protocolIds].sort().join(",")}` : "";
  const t = tokenFilters && Object.keys(tokenFilters).length > 0
    ? `_${Object.entries(tokenFilters).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(",")}`
    : "";
  return `${[...wallets].sort().join(",")}_${[...chainIds].sort().join(",")}${p}${t}`;
}

function evictStale() {
  const now = Date.now();
  for (const [k, v] of hotCache) {
    if (v.expiresAt < now) hotCache.delete(k);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Defense-in-depth Pro-tier gate. The dashboard layout already guards the
  // UI server-side, but the data API must independently verify tier so it
  // can't be hit directly by a logged-in-but-non-Pro session. Fail closed.
  const user = await getUserByAddress(session.address).catch(() => null);
  if (!canAccessDashboard(normaliseTier(user?.tier))) {
    return NextResponse.json({ error: "Pro subscription required" }, { status: 403 });
  }

  // Rate limit: 30 vesting lookups per user per minute (subgraph calls are expensive)
  const rl = await checkRateLimit("vesting", session.address, 30, "1 m");
  const blocked = rateLimitResponse(rl, "Too many requests. Please wait a moment.");
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const walletsParam      = searchParams.get("wallets");
  const chainsParam       = searchParams.get("chains");
  const protocolsParam    = searchParams.get("protocols");
  const tokenFiltersParam = searchParams.get("tokenFilters");
  const refresh           = searchParams.get("refresh") === "1";

  if (!walletsParam) {
    return NextResponse.json({ error: "No wallets provided" }, { status: 400 });
  }

  const wallets = walletsParam
    .split(",")
    .map((w) => w.trim())
    .filter((w) => isValidWalletAddress(w));

  if (wallets.length === 0) {
    return NextResponse.json({ error: "No valid addresses" }, { status: 400 });
  }

  // Parse chain filter
  let chainIds: SupportedChainId[] = ALL_CHAIN_IDS;
  if (chainsParam) {
    const requested = chainsParam.split(",").map((c) => Number(c.trim()));
    const valid = requested.filter((id): id is SupportedChainId =>
      ALL_CHAIN_IDS.includes(id as SupportedChainId)
    );
    if (valid.length > 0) chainIds = valid;
  }

  // Parse protocol filter
  let protocolIds: string[] | undefined;
  if (protocolsParam) {
    const ids = protocolsParam.split(",").map((p) => p.trim()).filter(Boolean);
    if (ids.length > 0) protocolIds = ids;
  }

  // Parse per-wallet token filters
  const tokenFilters: Record<string, string> = {};
  if (tokenFiltersParam) {
    for (const pair of tokenFiltersParam.split(",")) {
      const [walletAddr, tokenAddr] = pair.split(":").map(s => s.trim());
      if (walletAddr && tokenAddr && isValidWalletAddress(walletAddr) && isValidWalletAddress(tokenAddr)) {
        tokenFilters[normaliseAddress(walletAddr)] = normaliseAddress(tokenAddr);
      }
    }
  }

  const hasTokenFilters = Object.keys(tokenFilters).length > 0;

  // ── L1: hot in-memory cache ─────────────────────────────────────────────────
  const key    = cacheKey(wallets, chainIds, protocolIds, hasTokenFilters ? tokenFilters : undefined);
  const hotHit = !refresh ? hotCache.get(key) : undefined;
  if (hotHit && hotHit.expiresAt > Date.now()) {
    return NextResponse.json(
      { streams: hotHit.streams, fetchedAt: hotHit.fetchedAt, cached: "memory" },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  }

  // ── L2: persistent DB cache ──────────────────────────────────────────────────
  // Only use DB cache when no chain/protocol/token filters are active
  // (we store per-wallet, then filter in memory — avoids cache fragmentation)
  const useDbCache = !refresh && !protocolIds && !hasTokenFilters;
  if (useDbCache) {
    const dbResult = await readFromCache(wallets);
    // Union with EVERY cached row (any age). This keeps previously-discovered
    // streams visible despite the May 2 2026 setWhere TTL drift (unchanged
    // rows age past the TTL one-by-one) and transient adapter failures.
    const allCached = await readAllStreamsForWallets(wallets);

    // ── Serve cache-first, revalidate in the background ──────────────────────
    // Whenever we have ANY cached data for these wallets, serve it INSTANTLY —
    // never block a returning user on a live multi-subgraph/RPC scan. If some
    // (or all) wallets are stale — e.g. a user coming back weeks later — kick
    // the refresh off in the BACKGROUND so the next request (HTTP SWR / the
    // client's revalidation a moment later) picks up fresh data. Only a
    // first-ever load with zero cache falls through to the blocking fetch.
    if (allCached.length > 0) {
      let streams = mergeFreshWithCached(dbResult.streams, allCached);
      if (chainIds !== ALL_CHAIN_IDS) {
        streams = streams.filter((s) => chainIds.includes(s.chainId));
      }

      if (dbResult.staleWallets.length > 0) {
        // Fire-and-forget — the user does NOT wait on this.
        void aggregateVestingStreams(dbResult.staleWallets, chainIds, protocolIds)
          .then((freshData) => writeToCache(freshData))
          .catch((err) => console.error("[vesting] background refresh failed:", err));
      }

      const fetchedAt = new Date().toISOString();
      // Only pin FRESH responses in L1. A stale-while-revalidating response
      // must NOT stick in the hot cache, or it would mask the background
      // refresh for up to CACHE_TTL_MS — leaving the client's next revalidate
      // re-reading the now-updated DB cache instead.
      if (dbResult.isFresh) {
        hotCache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
      }
      return NextResponse.json(
        { streams, fetchedAt, cached: dbResult.isFresh ? "db" : "stale-revalidating" },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
      );
    }
  }

  // ── L3: full subgraph fetch ──────────────────────────────────────────────────
  const fetchedAt = new Date().toISOString();
  const fresh     = await aggregateVestingStreams(wallets, chainIds, protocolIds);

  // Union with last-known-good cache rows (any age). This guarantees that
  // an upstream subgraph blip can't make a previously-discovered stream
  // disappear from the user's portfolio between requests. The next
  // successful adapter run will overwrite the merged-in stale row with
  // a fresh one (same id, fresh content).
  let streams: VestingStream[];
  if (useDbCache) {
    const allCached = await readAllStreamsForWallets(wallets);
    streams = mergeFreshWithCached(fresh, allCached);
  } else {
    // Token / protocol filters are active — bypass merge to avoid leaking
    // streams that don't match the filter back into the response.
    streams = fresh;
  }

  // Apply per-wallet token filter
  if (hasTokenFilters) {
    streams = streams.filter((s) => {
      const walletFilter = tokenFilters[(s.recipient ?? "").toLowerCase()];
      if (!walletFilter) return true;
      return (s.tokenAddress ?? "").toLowerCase() === walletFilter;
    });
  }

  // Write only the freshly-fetched streams. Stale cache rows that survived
  // into the merged response keep their old lastRefreshedAt so /status's
  // "freshestSec" continues to surface adapter coverage gaps honestly.
  void writeToCache(fresh);

  // Write to hot cache
  hotCache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
  if (hotCache.size > 200) evictStale();

  return NextResponse.json(
    { streams, fetchedAt },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
  );
}
