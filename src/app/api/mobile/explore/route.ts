// src/app/api/mobile/explore/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Token-level unlock data for the mobile app — the bearer-authed sibling of
// the web /api/explore route. Given (chainId, token) it returns the aggregate
// unlock schedule across ALL holders of that token, plus a collapsed summary
// the watchlist card renders directly.
//
// Unlike the web explorer this is NOT Pro-gated: the watchlist is a free
// feature (capped at 5 tokens), and the empty-portfolio "radar" needs this
// data for brand-new users. Abuse is bounded by a 30/min per-user rate limit
// (subgraph credits cost us, not the caller) + a 15-minute edge cache. The
// streams array is capped so a whale token with thousands of holders can't
// return a multi-MB payload to a phone. 2026-06-11.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { explorerFetch } from "@/lib/vesting/explorer";
import { summariseToken } from "@/lib/vesting/token-summary";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";

// Cap the per-holder stream list returned to the phone. The summary already
// carries the headline totals; the raw list is only for an optional "top
// holders" detail view, where 60 rows is plenty.
const MAX_STREAMS = 60;

function toBig(raw: string | undefined | null): bigint {
  if (!raw) return 0n;
  try { return BigInt(raw); } catch { return 0n; }
}

export async function GET(req: NextRequest) {
  try {
    const token  = extractBearerToken(req);
    const userId = token ? await validateMobileToken(token) : null;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit("mobile-explore", userId, 30, "1 m");
    const blocked = rateLimitResponse(rl, "Too many token lookups. Try again in a minute.");
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const rawToken = searchParams.get("token");
    const chainId  = Number(searchParams.get("chainId") ?? "1");

    if (!rawToken || !isValidWalletAddress(rawToken)) {
      return NextResponse.json({ error: "Invalid token address — expected EVM 0x… or Solana SPL mint" }, { status: 400 });
    }
    if (!ALL_CHAIN_IDS.includes(chainId as SupportedChainId)) {
      return NextResponse.json({ error: "Unsupported chainId" }, { status: 400 });
    }
    const tokenAddress = normaliseAddress(rawToken);

    const streams = await explorerFetch(tokenAddress, chainId as SupportedChainId);
    const summary = summariseToken(streams, chainId, tokenAddress);

    // Largest locked positions first so a truncated list still shows the
    // holders that matter most.
    const top = [...streams]
      .sort((a, b) => (toBig(b.lockedAmount) > toBig(a.lockedAmount) ? 1 : -1))
      .slice(0, MAX_STREAMS);

    return NextResponse.json(
      { summary, streams: top, truncated: streams.length > MAX_STREAMS, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=300" } },
    );
  } catch (err) {
    console.error("GET /api/mobile/explore error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
