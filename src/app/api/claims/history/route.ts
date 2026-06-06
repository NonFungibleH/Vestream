// /api/claims/history
// ─────────────────────────────────────────────────────────────────────────────
// Returns the authenticated user's claim history, optionally filtered by
// date range or protocol. Foundation endpoint for the Tax-ready claim
// history feature — UI / CSV / Koinly / TurboTax exports all consume this.
//
// GET /api/claims/history?since=2024-01-01&until=2024-12-31&protocol=sablier
//   → { events: ClaimEvent[], summary: { totalRows, totalUsd, byYear } }
//
// POST /api/claims/history?action=refresh
//   → triggers ingestion across all the user's tracked wallets. Pulls
//     fresh withdrawal events from each adapter's data source and upserts
//     into claim_events. Idempotent — re-runs no-op on dedup index.
//
// Phase 1 ships Sablier ingestion only. Phase 2 adds the other adapters.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, wallets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import {
  ingestAllClaimsForUser,
  ingestClaimsForToken,
  getClaimHistoryForUser,
  SHIPPED_INGESTORS,
  type AdapterId,
} from "@/lib/vesting/ingestors";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import type { SupportedChainId } from "@/lib/vesting/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel — refresh can take a while across adapters

async function getAuthedUser(): Promise<{
  userId:           string;
  address:          string;
  audienceCategory: string | null;
} | null> {
  const session = await getSession();
  if (!session.address) return null;
  const [u] = await db
    .select({
      id:               users.id,
      address:          users.address,
      audienceCategory: users.audienceCategory,
    })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return null;
  return { userId: u.id, address: u.address, audienceCategory: u.audienceCategory };
}

// ── GET — list events ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getAuthedUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sp           = req.nextUrl.searchParams;
  const since        = sp.get("since");
  const until        = sp.get("until");
  const protocol     = sp.get("protocol") ?? undefined;
  const tokenAddress = sp.get("tokenAddress") ?? undefined;

  const events = await getClaimHistoryForUser(auth.userId, {
    since:    since ? new Date(since) : undefined,
    until:    until ? new Date(until) : undefined,
    protocol,
    tokenAddress,
  });

  // Summary: totals + per-year breakdown for the UI's "year switcher".
  const summary = events.reduce<{
    totalRows: number;
    totalUsd:  number;
    byYear:    Record<string, { rows: number; usd: number }>;
  }>(
    (acc, e) => {
      acc.totalRows += 1;
      const usd = e.usdValueAtClaim ? Number(e.usdValueAtClaim) : 0;
      acc.totalUsd += usd;
      const year = String(e.claimedAt.getUTCFullYear());
      if (!acc.byYear[year]) acc.byYear[year] = { rows: 0, usd: 0 };
      acc.byYear[year].rows += 1;
      acc.byYear[year].usd  += usd;
      return acc;
    },
    { totalRows: 0, totalUsd: 0, byYear: {} },
  );

  // audienceCategory is consumed by /dashboard/exports to bias the export
  // format ordering — workers see payroll-income first, investors see the
  // capital-gains formats first. Null for users who haven't onboarded;
  // page falls back to investor-first ordering in that case.
  return NextResponse.json({ events, summary, audienceCategory: auth.audienceCategory });
}

// ── POST — ingest (manual refresh) ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await getAuthedUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action");
  if (action !== "refresh") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Heavy operation — 2 refreshes / 5 min per IP. Most users won't hit
  // this; the cron will keep things fresh. Manual button is for "I just
  // claimed and want my dashboard to reflect it now".
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("claims:refresh", `${ip}:${auth.userId}`, 2, "5 m");
  const blocked = rateLimitResponse(rl, "Refresh limit hit. Try again in a few minutes.");
  if (blocked) return blocked;

  const userWallets = await db
    .select({ address: wallets.address, chains: wallets.chains })
    .from(wallets)
    .where(eq(wallets.userId, auth.userId));

  if (userWallets.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No wallets tracked." });
  }

  const allWallets = userWallets.map((w) => w.address);
  // Honour per-wallet chain narrowing where set; otherwise default chains
  // come from the Sablier adapter itself.
  const allChainsRequested = new Set<SupportedChainId>();
  for (const w of userWallets) {
    if (w.chains?.length) {
      for (const c of w.chains) {
        const n = Number.parseInt(c, 10);
        if (Number.isFinite(n)) allChainsRequested.add(n as SupportedChainId);
      }
    }
  }
  const chainIds = allChainsRequested.size > 0
    ? [...allChainsRequested]
    : undefined; // adapter default

  // Scoped "Run report" path: a single token's protocol(s) on its chain.
  // Driven by the per-token button on the Tax page — far cheaper than the
  // full fan-out. Falls through to the global refresh when params absent.
  const scopeChain    = req.nextUrl.searchParams.get("chainId");
  const scopeProtocol = req.nextUrl.searchParams.get("protocol");
  const isScoped      = Boolean(scopeChain && scopeProtocol);

  const results = isScoped
    ? await ingestClaimsForToken(auth.userId, allWallets, {
        chainId:   Number.parseInt(scopeChain!, 10) as SupportedChainId,
        protocols: scopeProtocol!.split(",").map((p) => p.trim()).filter(Boolean) as AdapterId[],
      })
    // Fan out across every adapter ingestor in parallel. Adapters that
    // aren't yet implemented return inserted: 0 + notImplemented: true so
    // the response honestly reports current coverage to the client.
    : await ingestAllClaimsForUser(auth.userId, allWallets, chainIds);
  const totalInserted = results.reduce((acc, r) => acc + r.inserted, 0);

  const coverage: AdapterId[] = SHIPPED_INGESTORS;
  const pending = results.filter((r) => r.notImplemented).map((r) => r.protocol);
  const errors  = results.filter((r) => r.error).map((r) => ({ protocol: r.protocol, error: r.error }));

  return NextResponse.json({
    inserted: totalInserted,
    message:  totalInserted === 0
      ? "Already up to date."
      : `Indexed ${totalInserted} new claim event${totalInserted === 1 ? "" : "s"} across ${coverage.length} protocol${coverage.length === 1 ? "" : "s"}.`,
    coverage,
    pending,
    errors,
    perProtocol: results,
  });
}
