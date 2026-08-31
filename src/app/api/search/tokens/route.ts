// src/app/api/search/tokens/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public token search for the global nav search box. One fast indexed read of
// token_vesting_rollups by symbol OR contract-address prefix, ranked by locked
// value. Powers the "find any token by ticker / project / contract" flow. Only
// returns public token metadata (symbol, chain, address, locked value) → the
// client links each result to the cached, fast /token/[chainId]/[address] page.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface TokenSearchResult {
  chainId:        number;
  tokenAddress:   string;
  tokenSymbol:    string | null;
  walletCount:    number;
  lockedValueUsd: number | null;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Escape LIKE metacharacters; prefix match keeps it index-friendly.
  const esc = q.replace(/([%_\\])/g, "\\$1");
  const like = `${esc}%`;
  type Row = Record<string, unknown>;
  try {
    // Match ticker/project (symbol prefix) OR contract address (prefix). Rank by
    // locked value so the most significant token for an ambiguous ticker wins.
    // ILIKE on token_address is fine: EVM addresses are stored lowercased, and
    // a full pasted address prefix-matches regardless of ecosystem.
    const rows = (await db.execute(sql`
      SELECT chain_id AS "chainId", token_address AS "tokenAddress",
             token_symbol AS "tokenSymbol", wallet_count AS "walletCount",
             locked_value_usd AS "lockedValueUsd"
      FROM token_vesting_rollups
      WHERE token_symbol ILIKE ${like} OR token_address ILIKE ${like}
      ORDER BY locked_value_usd DESC NULLS LAST, wallet_count DESC
      LIMIT 10
    `) as unknown as Row[]) ?? [];
    const results: TokenSearchResult[] = rows.map((r) => ({
      chainId:        Number(r.chainId),
      tokenAddress:   String(r.tokenAddress),
      tokenSymbol:    r.tokenSymbol == null ? null : String(r.tokenSymbol),
      walletCount:    Number(r.walletCount ?? 0),
      lockedValueUsd: r.lockedValueUsd == null ? null : Number(r.lockedValueUsd),
    }));
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[search/tokens] failed:", err);
    return NextResponse.json({ results: [] });
  }
}
