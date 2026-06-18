// src/app/api/dashboard/explorer/suggest/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Type-ahead token suggestions for the explorer search box. One fast indexed
// read of token_vesting_rollups by symbol prefix, ranked by locked value. Used
// by SearchInput's autocomplete dropdown. Returns only public token metadata.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Escaped prefix match (case-insensitive). Prefix keeps it index-friendly.
  const esc = q.replace(/([%_\\])/g, "\\$1");
  type Row = Record<string, unknown>;
  try {
    const rows = (await db.execute(sql`
      SELECT chain_id AS "chainId", token_address AS "tokenAddress",
             token_symbol AS "tokenSymbol", wallet_count AS "walletCount",
             locked_value_usd AS "lockedValueUsd"
      FROM token_vesting_rollups
      WHERE token_symbol ILIKE ${esc + "%"} AND next_unlock IS NOT NULL
      ORDER BY locked_value_usd DESC NULLS LAST, wallet_count DESC
      LIMIT 8
    `) as unknown as Row[]) ?? [];
    const results = rows.map((r) => ({
      chainId:       Number(r.chainId),
      tokenAddress:  String(r.tokenAddress),
      tokenSymbol:   r.tokenSymbol == null ? null : String(r.tokenSymbol),
      walletCount:   Number(r.walletCount ?? 0),
      lockedValueUsd: r.lockedValueUsd == null ? null : Number(r.lockedValueUsd),
    }));
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[explorer/suggest] failed:", err);
    return NextResponse.json({ results: [] });
  }
}
