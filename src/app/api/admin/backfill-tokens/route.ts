// src/app/api/admin/backfill-tokens/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only backfill: walks `vesting_streams_cache` for rows where the
// stored token_symbol is "UNKNOWN" / NULL / empty, re-resolves the
// token metadata via the shared on-chain resolver (which now handles
// bytes32-symbol tokens), and updates the row in place.
//
// Why this exists:
//   The adapter UNKNOWN fix (sablier.ts / hedgey.ts wired to
//   `resolveTokenMeta`) only catches tokens going forward — the next
//   time the seeder writes that row, the symbol becomes correct.
//   Existing cache rows persisted with "UNKNOWN" stick around until
//   their next refresh (which on a fully-vested stream may be a
//   long time, since `lastRefreshedAt` only updates when data moves).
//   This route does a one-shot pass to clean them up immediately.
//
// Gated by `bearerEquals(req.headers.authorization, CRON_SECRET)` —
// same convention as the cron endpoints. Curl it with:
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     "https://www.vestream.io/api/admin/backfill-tokens?limit=100"
//
// Bounded by `?limit=N` (default 100, max 500) so a single invocation
// completes well within Vercel's 300s function ceiling even when
// every token needs a chain call. Re-invoke until `remaining: 0`.
// 2026-05-20.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { and, or, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { vestingStreamsCache } from "@/lib/db/schema";
import { bearerEquals } from "@/lib/auth/timing-safe-bearer";
import { env } from "@/lib/env";
import { resolveTokenMeta } from "@/lib/vesting/token-resolver";
import type { SupportedChainId } from "@/lib/vesting/types";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

async function handle(req: NextRequest) {
  if (!bearerEquals(req.headers.get("authorization"), env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url   = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitParam)
    ? Math.min(500, Math.max(1, Math.floor(limitParam)))
    : 100;

  // Pick rows where the symbol looks unusable. Three shapes to catch:
  //   - literal "UNKNOWN" (Hedgey's old explicit fallback)
  //   - NULL (Envio subgraph returned null/no symbol)
  //   - empty string (defensive — shouldn't happen but cheap to cover)
  // tokenAddress IS NOT NULL because resolution needs an address to
  // call. The rare row with null tokenAddress is a data-quality bug
  // upstream and skipped here.
  const rows = await db
    .select({
      streamId:     vestingStreamsCache.streamId,
      chainId:      vestingStreamsCache.chainId,
      tokenAddress: vestingStreamsCache.tokenAddress,
      tokenSymbol:  vestingStreamsCache.tokenSymbol,
      streamData:   vestingStreamsCache.streamData,
    })
    .from(vestingStreamsCache)
    .where(
      and(
        or(
          isNull(vestingStreamsCache.tokenSymbol),
          eq(vestingStreamsCache.tokenSymbol, "UNKNOWN"),
          eq(vestingStreamsCache.tokenSymbol, ""),
        ),
        sql`${vestingStreamsCache.tokenAddress} is not null`,
      ),
    )
    .limit(limit);

  let resolved = 0;
  let unchanged = 0;
  const failures: Array<{ streamId: string; reason: string }> = [];

  for (const row of rows) {
    if (!row.tokenAddress) continue;

    let meta;
    try {
      meta = await resolveTokenMeta(row.chainId as SupportedChainId, row.tokenAddress, {
        existingSymbol:   row.tokenSymbol,
        // Pull existingDecimals from the jsonb streamData if we have it.
        existingDecimals: (row.streamData as { tokenDecimals?: number })?.tokenDecimals ?? null,
      });
    } catch (err) {
      failures.push({ streamId: row.streamId, reason: err instanceof Error ? err.message : "resolve threw" });
      continue;
    }

    // Decide whether to write. If the resolver still produced "UNKNOWN"-
    // equivalent (truncated address ending in "…"), we still write it —
    // the truncated address is more useful in the UI than the literal
    // "UNKNOWN" string. Skip writes only when nothing changed (same
    // symbol + same decimals as already stored).
    const existingDecimals = (row.streamData as { tokenDecimals?: number })?.tokenDecimals;
    const sameSymbol   = (row.tokenSymbol ?? "") === meta.symbol;
    const sameDecimals = existingDecimals === meta.decimals;
    if (sameSymbol && sameDecimals) {
      unchanged++;
      continue;
    }

    // Write both the indexed column AND the jsonb mirror so downstream
    // consumers see consistent data regardless of which they read.
    await db
      .update(vestingStreamsCache)
      .set({
        tokenSymbol: meta.symbol,
        // streamData is a jsonb blob — merge the new fields atomically
        // via a postgres jsonb concat. Preserves every other field.
        streamData: sql`${vestingStreamsCache.streamData} || jsonb_build_object('tokenSymbol', ${meta.symbol}::text, 'tokenDecimals', ${meta.decimals})`,
      })
      .where(eq(vestingStreamsCache.streamId, row.streamId));
    resolved++;
  }

  // Count how many rows still need attention so the caller knows
  // whether to re-invoke. Cheap COUNT(*) — uses the
  // vsc_token_symbol_idx index.
  const [remainingRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vestingStreamsCache)
    .where(
      and(
        or(
          isNull(vestingStreamsCache.tokenSymbol),
          eq(vestingStreamsCache.tokenSymbol, "UNKNOWN"),
          eq(vestingStreamsCache.tokenSymbol, ""),
        ),
        sql`${vestingStreamsCache.tokenAddress} is not null`,
      ),
    );

  return NextResponse.json({
    ok: true,
    scanned:   rows.length,
    resolved,
    unchanged,
    failures,
    remaining: remainingRow?.n ?? 0,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
