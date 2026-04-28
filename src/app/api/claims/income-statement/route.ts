// /api/claims/income-statement
// ─────────────────────────────────────────────────────────────────────────────
// Aggregated tax/income view of the user's claim history. Powers the
// /dashboard/income-statement page.
//
// Returns server-side aggregations (avoiding shipping every row to the
// client just to bucket it):
//
//   - byYear:        { year, rows, usd, gasUsd } sorted desc
//   - byProtocol:    { protocol, rows, usd, gasUsd } across all time
//   - byToken:       { tokenSymbol, tokenAddress, rows, usd, units }
//                    top 25 tokens by USD value at claim
//   - byYearProtocol:{ year, protocol, usd } — pivot grid for the
//                    "income by protocol per tax year" table
//   - confidenceMix: { exact, nearest, missing } — surfaces how reliable
//                    the USD-at-claim numbers are; we don't want to lull
//                    the user into a false sense of completeness when
//                    half the rows are nearest-day fallbacks.
//
// Query params:
//   ?year=2024    → restrict every aggregate to that year
//   ?since=YYYY-MM-DD&until=YYYY-MM-DD → custom range
//   (no params)  → all time
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { claimEvents, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

async function getAuthedUser(): Promise<{ userId: string } | null> {
  const session = await getSession();
  if (!session.address) return null;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.address, session.address.toLowerCase()))
    .limit(1);
  if (!u) return null;
  return { userId: u.id };
}

function parseDateRange(req: NextRequest): { since?: Date; until?: Date } {
  const sp = req.nextUrl.searchParams;
  const year  = sp.get("year");
  const since = sp.get("since");
  const until = sp.get("until");

  if (year && /^\d{4}$/.test(year)) {
    return {
      since: new Date(`${year}-01-01T00:00:00Z`),
      until: new Date(`${year}-12-31T23:59:59Z`),
    };
  }
  return {
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = await getAuthedUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { since, until } = parseDateRange(req);

  // Build a reusable filter clause. and(eq(...), ...filters) collapses
  // cleanly when range fields are undefined.
  const conditions = [eq(claimEvents.userId, auth.userId)];
  if (since) conditions.push(gte(claimEvents.claimedAt, since));
  if (until) conditions.push(lte(claimEvents.claimedAt, until));
  const where = and(...conditions);

  // ── byYear ────────────────────────────────────────────────────────────────
  // EXTRACT(YEAR FROM claimedAt) keeps it in the DB. Drizzle's sql template
  // is unavoidable here — there's no first-class date_trunc helper.
  const byYearRaw = await db
    .select({
      year:   sql<number>`EXTRACT(YEAR FROM ${claimEvents.claimedAt})::int`,
      rows:   sql<number>`COUNT(*)::int`,
      usd:    sql<string>`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0)::text`,
      gasUsd: sql<string>`COALESCE(SUM(${claimEvents.gasUsdValueAtClaim}), 0)::text`,
    })
    .from(claimEvents)
    .where(where)
    .groupBy(sql`EXTRACT(YEAR FROM ${claimEvents.claimedAt})`)
    .orderBy(sql`EXTRACT(YEAR FROM ${claimEvents.claimedAt}) DESC`);

  const byYear = byYearRaw.map((r) => ({
    year:   Number(r.year),
    rows:   Number(r.rows),
    usd:    Number(r.usd),
    gasUsd: Number(r.gasUsd),
  }));

  // ── byProtocol ───────────────────────────────────────────────────────────
  const byProtocolRaw = await db
    .select({
      protocol: claimEvents.protocol,
      rows:     sql<number>`COUNT(*)::int`,
      usd:      sql<string>`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0)::text`,
      gasUsd:   sql<string>`COALESCE(SUM(${claimEvents.gasUsdValueAtClaim}), 0)::text`,
    })
    .from(claimEvents)
    .where(where)
    .groupBy(claimEvents.protocol)
    .orderBy(sql`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0) DESC`);

  const byProtocol = byProtocolRaw.map((r) => ({
    protocol: r.protocol,
    rows:     Number(r.rows),
    usd:      Number(r.usd),
    gasUsd:   Number(r.gasUsd),
  }));

  // ── byToken (top 25 by USD) ──────────────────────────────────────────────
  // SUM(amount) is a stringified bigint sum — Postgres can't natively SUM
  // a TEXT column, so we cast to numeric inside Postgres. tokenDecimals is
  // included so the client can render a human-readable amount alongside.
  const byTokenRaw = await db
    .select({
      tokenSymbol:   claimEvents.tokenSymbol,
      tokenAddress:  claimEvents.tokenAddress,
      tokenDecimals: claimEvents.tokenDecimals,
      chainId:       claimEvents.chainId,
      rows:          sql<number>`COUNT(*)::int`,
      usd:           sql<string>`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0)::text`,
      // amount is stored as TEXT (stringified bigint). Cast to numeric for
      // SUM, then round-trip back through ::text to preserve precision.
      units:         sql<string>`COALESCE(SUM(${claimEvents.amount}::numeric), 0)::text`,
    })
    .from(claimEvents)
    .where(where)
    .groupBy(
      claimEvents.tokenSymbol,
      claimEvents.tokenAddress,
      claimEvents.tokenDecimals,
      claimEvents.chainId,
    )
    .orderBy(sql`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0) DESC`)
    .limit(25);

  const byToken = byTokenRaw.map((r) => ({
    tokenSymbol:   r.tokenSymbol,
    tokenAddress:  r.tokenAddress,
    tokenDecimals: r.tokenDecimals,
    chainId:       r.chainId,
    rows:          Number(r.rows),
    usd:           Number(r.usd),
    units:         r.units, // keep as string — bigint precision
  }));

  // ── byYearProtocol pivot ─────────────────────────────────────────────────
  const byYearProtocolRaw = await db
    .select({
      year:     sql<number>`EXTRACT(YEAR FROM ${claimEvents.claimedAt})::int`,
      protocol: claimEvents.protocol,
      usd:      sql<string>`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0)::text`,
    })
    .from(claimEvents)
    .where(where)
    .groupBy(
      sql`EXTRACT(YEAR FROM ${claimEvents.claimedAt})`,
      claimEvents.protocol,
    );

  const byYearProtocol = byYearProtocolRaw.map((r) => ({
    year:     Number(r.year),
    protocol: r.protocol,
    usd:      Number(r.usd),
  }));

  // ── confidenceMix ─────────────────────────────────────────────────────────
  const confidenceRaw = await db
    .select({
      confidence: claimEvents.priceConfidence,
      rows:       sql<number>`COUNT(*)::int`,
      usd:        sql<string>`COALESCE(SUM(${claimEvents.usdValueAtClaim}), 0)::text`,
    })
    .from(claimEvents)
    .where(where)
    .groupBy(claimEvents.priceConfidence);

  const confidenceMix = {
    exact:   { rows: 0, usd: 0 },
    nearest: { rows: 0, usd: 0 },
    missing: { rows: 0, usd: 0 },
  };
  for (const r of confidenceRaw) {
    const key = r.confidence as keyof typeof confidenceMix;
    if (key in confidenceMix) {
      confidenceMix[key] = { rows: Number(r.rows), usd: Number(r.usd) };
    }
  }

  // ── totals (single row) ───────────────────────────────────────────────────
  const totals = {
    rows:   byYear.reduce((s, r) => s + r.rows, 0),
    usd:    byYear.reduce((s, r) => s + r.usd, 0),
    gasUsd: byYear.reduce((s, r) => s + r.gasUsd, 0),
  };

  return NextResponse.json({
    range: {
      since: since?.toISOString() ?? null,
      until: until?.toISOString() ?? null,
    },
    totals,
    byYear,
    byProtocol,
    byToken,
    byYearProtocol,
    confidenceMix,
  });
}
