import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";

// ─── Server-side in-memory cache ──────────────────────────────────────────────
// Keyed by sorted wallets + chain IDs. TTL: 5 minutes.
// This makes page refreshes near-instant after the first load.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { streams: VestingStream[]; expiresAt: number; fetchedAt: string }>();

function cacheKey(wallets: string[], chainIds: SupportedChainId[], protocolIds?: string[]): string {
  const p = protocolIds ? `_${[...protocolIds].sort().join(",")}` : "";
  return `${[...wallets].sort().join(",")}_${[...chainIds].sort().join(",")}${p}`;
}

// Evict stale entries (run periodically to avoid unbounded growth)
function evictStale() {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const walletsParam    = searchParams.get("wallets");
  const chainsParam     = searchParams.get("chains");    // optional e.g. "1,56,8453"
  const protocolsParam  = searchParams.get("protocols"); // optional e.g. "sablier,uncx"
  const refresh         = searchParams.get("refresh") === "1"; // force-bypass cache

  if (!walletsParam) {
    return NextResponse.json({ error: "No wallets provided" }, { status: 400 });
  }

  const wallets = walletsParam
    .split(",")
    .map((w) => w.trim())
    .filter((w) => isAddress(w));

  if (wallets.length === 0) {
    return NextResponse.json({ error: "No valid addresses" }, { status: 400 });
  }

  // Parse chain filter (default: all supported chains)
  let chainIds: SupportedChainId[] = ALL_CHAIN_IDS;
  if (chainsParam) {
    const requested = chainsParam.split(",").map((c) => Number(c.trim()));
    const valid = requested.filter((id): id is SupportedChainId =>
      ALL_CHAIN_IDS.includes(id as SupportedChainId)
    );
    if (valid.length > 0) chainIds = valid;
  }

  // Parse protocol filter (default: all adapters)
  let protocolIds: string[] | undefined;
  if (protocolsParam) {
    const ids = protocolsParam.split(",").map((p) => p.trim()).filter(Boolean);
    if (ids.length > 0) protocolIds = ids;
  }

  // Check cache (skip if ?refresh=1 is passed)
  const key    = cacheKey(wallets, chainIds, protocolIds);
  const cached = !refresh ? cache.get(key) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { streams: cached.streams, fetchedAt: cached.fetchedAt, cached: true },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
    );
  }

  const fetchedAt = new Date().toISOString();
  const streams   = await aggregateVestingStreams(wallets, chainIds, protocolIds);

  // Store in cache and evict stale entries
  cache.set(key, { streams, expiresAt: Date.now() + CACHE_TTL_MS, fetchedAt });
  if (cache.size > 200) evictStale();

  return NextResponse.json(
    { streams, fetchedAt },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" } }
  );
}
