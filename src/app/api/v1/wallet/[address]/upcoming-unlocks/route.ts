/**
 * GET /api/v1/wallet/{address}/upcoming-unlocks
 *
 * Returns vesting streams with unlock events in the next N days.
 * Ideal for AI agents building unlock forecasts or alerts.
 *
 * Auth:    Authorization: Bearer vstr_live_...
 * Params:  ?days=30     (default: 30, max: 365)
 *          ?protocol=sablier,uncx
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidWalletAddress } from "@/lib/address-validation";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey, authErrorResponse, withRateLimitHeaders } from "@/lib/api-key-auth";
import { VestingStream } from "@/lib/vesting/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return authErrorResponse(auth);

  const { address } = await params;

  if (!isValidWalletAddress(address)) {
    return NextResponse.json(
      { error: "Invalid wallet address. Expected an EVM 0x… address or a Solana base58 pubkey." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(req.url);
  const days     = Math.min(parseInt(searchParams.get("days") ?? "30"), 365);
  const protocol = searchParams.get("protocol")?.split(",").map(p => p.trim().toLowerCase());

  const nowSec     = Math.floor(Date.now() / 1000);
  const windowEnd  = nowSec + days * 86400;

  // Fetch all active streams for this wallet from cache
  const rows = await db
    .select()
    .from(vestingStreamsCache)
    .where(
      and(
        eq(vestingStreamsCache.recipient, address.toLowerCase()),
        eq(vestingStreamsCache.isFullyVested, false)
      )
    );

  const unlocks: {
    stream_id:    string;
    protocol:     string;
    chain_id:     number;
    token_symbol: string;
    token_address:string;
    unlock_time:  number;
    unlock_type:  "cliff" | "end" | "tranche";
    amount_unlocking: string;
  }[] = [];

  for (const row of rows) {
    const s = row.streamData as unknown as VestingStream;

    if (protocol?.length && !protocol.includes(s.protocol)) continue;

    // Cliff unlock
    if (s.cliffTime && s.cliffTime > nowSec && s.cliffTime <= windowEnd) {
      unlocks.push({
        stream_id:         s.id,
        protocol:          s.protocol,
        chain_id:          s.chainId,
        token_symbol:      s.tokenSymbol,
        token_address:     s.tokenAddress,
        unlock_time:       s.cliffTime,
        unlock_type:       "cliff",
        amount_unlocking:  s.lockedAmount,
      });
    }

    // Tranche/step unlocks
    if (s.unlockSteps?.length) {
      for (const step of s.unlockSteps) {
        if (step.timestamp > nowSec && step.timestamp <= windowEnd) {
          unlocks.push({
            stream_id:        s.id,
            protocol:         s.protocol,
            chain_id:         s.chainId,
            token_symbol:     s.tokenSymbol,
            token_address:    s.tokenAddress,
            unlock_time:      step.timestamp,
            unlock_type:      "tranche",
            amount_unlocking: step.amount,
          });
        }
      }
    } else if (!s.cliffTime || nowSec >= s.cliffTime) {
      // Linear stream end
      if (s.endTime > nowSec && s.endTime <= windowEnd) {
        unlocks.push({
          stream_id:        s.id,
          protocol:         s.protocol,
          chain_id:         s.chainId,
          token_symbol:     s.tokenSymbol,
          token_address:    s.tokenAddress,
          unlock_time:      s.endTime,
          unlock_type:      "end",
          amount_unlocking: s.lockedAmount,
        });
      }
    }
  }

  // Sort ascending by unlock time
  unlocks.sort((a, b) => a.unlock_time - b.unlock_time);

  const res = NextResponse.json({
    wallet:     address.toLowerCase(),
    window_days: days,
    count:      unlocks.length,
    unlocks,
  });

  return withRateLimitHeaders(res, auth);
}
