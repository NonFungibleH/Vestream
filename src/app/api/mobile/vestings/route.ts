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
import { readFromCache, writeToCache } from "@/lib/vesting/dbcache";
import { ALL_CHAIN_IDS, SupportedChainId, VestingStream } from "@/lib/vesting/types";

export async function GET(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  // keyed per-wallet and holds ALL protocols/chains for that wallet.
  const canUseCache = !protocolIds;
  let streams: VestingStream[] = [];

  if (canUseCache) {
    const dbResult = await readFromCache(addresses);
    if (dbResult.isFresh) {
      streams = dbResult.streams;
    } else if (dbResult.staleWallets.length < addresses.length) {
      // Partial hit: re-fetch only the stale wallets
      const fresh = await aggregateVestingStreams(dbResult.staleWallets, chainIds, protocolIds);
      void writeToCache(fresh);
      streams = [...dbResult.streams, ...fresh];
    } else {
      // Full miss
      streams = await aggregateVestingStreams(addresses, chainIds, protocolIds);
      void writeToCache(streams);
    }
    // Apply chain filter in memory (cache stores all chains per wallet)
    if (chainIds.length < ALL_CHAIN_IDS.length) {
      streams = streams.filter(s => chainIds.includes(s.chainId));
    }
  } else {
    // Cache disabled when protocol filter is active — fetch fresh
    streams = await aggregateVestingStreams(addresses, chainIds, protocolIds);
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
