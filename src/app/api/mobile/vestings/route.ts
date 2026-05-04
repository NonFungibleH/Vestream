// src/app/api/mobile/vestings/route.ts
// Mobile-auth equivalent of /api/vesting.
// Uses per-wallet chain/protocol/token filters from the DB, plus the same
// aggregate + cache layers as the web route so requests finish well under
// the mobile client's 15s timeout.
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { wallets as walletsTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { readFromCache, writeToCache, readAllStreamsForWallets, mergeFreshWithCached } from "@/lib/vesting/dbcache";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?refresh=1 forces a live adapter run, bypassing the L1 DB cache. Mobile
  // pull-to-refresh sets this so users who just claimed on-chain see the
  // updated state immediately instead of waiting for the next adapter cron
  // (otherwise a "Ready to claim" row in the past tab would linger for up
  // to ACTIVE_TTL_SECONDS even after the user actually claimed). Mirrors
  // the same flag on the web /api/vesting route.
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  const userWallets = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  if (!userWallets.length) return NextResponse.json({ streams: [] });

  const addresses = userWallets.map(w => w.address.toLowerCase());

  // Derive the minimum chain + protocol set to scan.
  // null on a wallet = no restriction (Pro/Fund scans everything).
  // If ANY wallet has no chain restriction, we must scan all chains — same for protocols.
  const anyWalletUnrestrictedChains    = userWallets.some(w => !w.chains    || w.chains.length === 0);
  const anyWalletUnrestrictedProtocols = userWallets.some(w => !w.protocols || w.protocols.length === 0);

  const chainIds: SupportedChainId[] = anyWalletUnrestrictedChains
    ? ALL_CHAIN_IDS
    : Array.from(new Set(
        userWallets.flatMap(w => (w.chains ?? []).map(c => Number(c)))
      )).filter((id): id is SupportedChainId => ALL_CHAIN_IDS.includes(id as SupportedChainId));

  const protocolIds: string[] | undefined = anyWalletUnrestrictedProtocols
    ? undefined
    : Array.from(new Set(userWallets.flatMap(w => w.protocols ?? [])));

  // Build per-wallet token-address filter (lowercased).
  const tokenFilters: Record<string, string> = {};
  for (const w of userWallets) {
    if (w.tokenAddress) tokenFilters[w.address.toLowerCase()] = w.tokenAddress.toLowerCase();
  }
  const hasTokenFilters = Object.keys(tokenFilters).length > 0;

  // ── L1: DB cache ────────────────────────────────────────────────────────────
  // Only safe when there are no adapter-level filters, since the cache is
  // keyed per-wallet and holds ALL protocols/chains for that wallet. Also
  // bypassed when the caller explicitly asked for fresh data (?refresh=1).
  const canUseCache = !protocolIds && !refresh;
  let streams: VestingStream[] = [];

  if (canUseCache) {
    const dbResult = await readFromCache(addresses);
    if (dbResult.isFresh) {
      // Fresh-path merge: readFromCache marks a wallet "fresh" if ANY of
      // its rows are within the TTL window, but it only RETURNS the rows
      // that are themselves fresh. After the May 2 2026 setWhere
      // optimization in writeToCache (only updates rows whose data changed),
      // unchanged rows individually drift past the TTL while the wallet as
      // a whole keeps getting touched by the seeder — so the stale row
      // gets silently dropped from the response while the wallet appears
      // healthy. Reading all rows and unioning here closes that gap.
      const allCached = await readAllStreamsForWallets(addresses);
      streams = mergeFreshWithCached(dbResult.streams, allCached);
    } else if (dbResult.staleWallets.length < addresses.length) {
      // Partial hit: re-fetch only the stale wallets, then merge with the
      // last-known-good rows we already have (including stale ones for the
      // wallets we DID re-fetch — adapter coverage can shift run-to-run).
      const fresh = await aggregateVestingStreams(dbResult.staleWallets, chainIds, protocolIds);
      void writeToCache(fresh);
      const allCached = await readAllStreamsForWallets(addresses);
      // dbResult.streams is the FRESH cached rows for fresh wallets;
      // allCached spans every wallet (including the ones we just re-fetched).
      // Union order: latest fresh > stale cache > redundant fresh-cache.
      streams = mergeFreshWithCached([...dbResult.streams, ...fresh], allCached);
    } else {
      // Full miss — every wallet's cache was stale (or empty). Run the live
      // adapters AND read every existing cache row, then union them. Without
      // this merge, a single subgraph/RPC blip on a chain that contributes
      // ONE stream wipes the rest of the user's portfolio from the response
      // until the next successful run. With it, we always serve at least the
      // last-known-good streams (the user's "winning feature": every stream
      // visible the moment they open the app, regardless of upstream weather).
      const fresh    = await aggregateVestingStreams(addresses, chainIds, protocolIds);
      const stale    = await readAllStreamsForWallets(addresses);
      streams = mergeFreshWithCached(fresh, stale);
      // Persist only fresh — writeToCache uses lastRefreshedAt setWhere so
      // unchanged stale rows keep their old timestamps and the freshness
      // signal stays meaningful.
      void writeToCache(fresh);
    }
    // Apply chain filter in memory (cache stores all chains per wallet)
    if (chainIds.length < ALL_CHAIN_IDS.length) {
      streams = streams.filter(s => chainIds.includes(s.chainId));
    }
  } else {
    // Cache disabled — either because a protocol filter is active OR the
    // caller passed ?refresh=1. Fetch live but still merge with the
    // last-known-good cache so a single transient adapter failure during
    // an explicit refresh doesn't drop streams the user can still see.
    const fresh = await aggregateVestingStreams(addresses, chainIds, protocolIds);
    if (refresh && !protocolIds) {
      const stale = await readAllStreamsForWallets(addresses);
      streams = mergeFreshWithCached(fresh, stale);
      void writeToCache(fresh);
    } else {
      streams = fresh;
    }
  }

  // ── Per-wallet token address filter (free-plan scoping) ─────────────────────
  if (hasTokenFilters) {
    streams = streams.filter(s => {
      const walletFilter = tokenFilters[(s.recipient ?? "").toLowerCase()];
      if (!walletFilter) return true;              // wallet has no filter → keep all
      return (s.tokenAddress ?? "").toLowerCase() === walletFilter;
    });
  }

  // Sort by next unlock (soonest first)
  streams.sort((a, b) => (a.nextUnlockTime ?? Infinity) - (b.nextUnlockTime ?? Infinity));

  return NextResponse.json(
    { streams },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
