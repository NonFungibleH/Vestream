// /api/fees-owed?address=0x…
// ─────────────────────────────────────────────────────────────────────────────
// Doppler fee streams a wallet can claim right now, priced. Companion to
// /api/find-vestings: the scan client calls this after the vesting scan and
// renders the result as a "Fees owed" block, last, inside the personal view.
//
// Deliberately its own endpoint rather than a field on the scan response so
// a slow locker RPC can never delay the vestings, and so nothing about fees
// leaks into the cached ScanResponse shape that other surfaces read.
//
// Public, unauthenticated, rate-limited like the scan. EVM only (no locker
// on Solana). Returns [] rather than an error when a chain fails.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { isValidWalletAddress, normaliseAddress, detectEcosystem } from "@/lib/address-validation";
import { checkRateLimit, rateLimitResponse } from "@/lib/ratelimit";
import { readFeesOwed, DOPPLER_FEE_CHAINS, type FeeOwed } from "@/lib/vesting/doppler-fees";
import { logWalletSearch } from "@/lib/search-log";

export const runtime = "nodejs";
export const maxDuration = 25;

export interface FeesOwedResponse {
  address:  string;
  fees:     FeeOwed[];
  totalUsd: number | null;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("address") ?? "";
  if (!isValidWalletAddress(raw) || detectEcosystem(raw) === "solana") {
    return NextResponse.json({ error: "Invalid EVM address" }, { status: 400 });
  }
  const address = normaliseAddress(raw);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await checkRateLimit("fees-owed", ip, 30, "1 m");
  const limited = rateLimitResponse(rl, "Too many lookups. Try again in a minute.");
  if (limited) return limited;

  const perChain = await Promise.all(
    DOPPLER_FEE_CHAINS.map((chainId) =>
      readFeesOwed([address], chainId).catch((err) => {
        console.error(`[fees-owed] chain ${chainId}:`, err);
        return [] as FeeOwed[];
      })),
  );
  const fees = perChain.flat().sort((a, b) => (b.claimableUsd ?? 0) - (a.claimableUsd ?? 0));
  const totalUsd = fees.reduce<number | null>(
    (acc, f) => (f.claimableUsd == null ? acc : (acc ?? 0) + f.claimableUsd), null);

  // Outcome marker for the share-of-wallets measurement (see search-log.ts).
  if (fees.length > 0) logWalletSearch({ walletAddress: address, source: "fees_owed_hit", ip });

  const body: FeesOwedResponse = { address, fees, totalUsd };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
