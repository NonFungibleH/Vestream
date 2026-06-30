// Read-only analysis: find tokens whose LARGEST wallets unlock BEFORE the
// smallest wallets — the classic "insiders exit first, retail left holding
// the bag" pattern. Marketing case-study finder. Throwaway diagnostic.
//
// Metric: Spearman (rank) correlation per token between
//   - allocation size per recipient (sum of totalAmount)
//   - amount-weighted unlock time per recipient (when their tokens vest)
// A strongly NEGATIVE correlation = big allocations unlock early = predatory.
// Rank correlation so one mega-whale can't skew a linear fit.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const TESTNETS = [11155111, 84532];

try {
  // Stablecoins / wrapped payment tokens — these are Superfluid payroll &
  // treasury STREAMS, not investor vesting. Their size↔time correlation is
  // noise, so they must not appear in a "bad vesting design" case study.
  const STABLE = "('USDC','USDCx','USDT','USDTx','DAI','DAIx','BUSD','TUSD','FRAX','USDC.e','WETH','WETHx','ETHx','WBTC')";

  // ── Stage 1: rank tokens by predatory-ness ──────────────────────────────
  const candidates = await sql.unsafe(`
    WITH per_recipient AS (
      SELECT chain_id, token_address,
             max(token_symbol) AS symbol,
             recipient,
             sum((stream_data->>'totalAmount')::numeric) AS amount,
             sum((stream_data->>'totalAmount')::numeric * end_time)
               / NULLIF(sum((stream_data->>'totalAmount')::numeric), 0) AS w_end
      FROM vesting_streams_cache
      WHERE end_time IS NOT NULL
        AND end_time > 0
        AND (stream_data->>'totalAmount') IS NOT NULL
        AND (stream_data->>'totalAmount')::numeric > 0
        AND chain_id NOT IN (${TESTNETS.join(",")})
        AND coalesce(token_symbol, '') NOT IN ${STABLE}
      GROUP BY chain_id, token_address, recipient
    ),
    ranked AS (
      SELECT chain_id, token_address, symbol, recipient, amount, w_end,
             rank() OVER (PARTITION BY chain_id, token_address ORDER BY amount)  AS amt_rank,
             rank() OVER (PARTITION BY chain_id, token_address ORDER BY w_end)   AS time_rank
      FROM per_recipient
    )
    SELECT r.chain_id, r.token_address,
           max(r.symbol)                 AS symbol,
           count(*)                      AS wallets,
           corr(r.amt_rank, r.time_rank) AS spearman,
           min(r.w_end)                  AS earliest_end,
           max(r.w_end)                  AS latest_end,
           p.price_usd IS NOT NULL       AS has_price
    FROM ranked r
    LEFT JOIN token_prices_cache p
      ON p.chain_id = r.chain_id AND lower(p.token_address) = lower(r.token_address)
    GROUP BY r.chain_id, r.token_address, p.price_usd
    HAVING count(*) >= 12
       AND corr(r.amt_rank, r.time_rank) <= -0.45
       AND (max(r.w_end) - min(r.w_end)) > 5184000   -- > 60 days spread
    ORDER BY corr(r.amt_rank, r.time_rank) ASC
    LIMIT 25
  `);

  const chainName = { 1: "ETH", 56: "BSC", 137: "Polygon", 8453: "Base", 42161: "Arbitrum", 101: "Solana" };
  const fmtDate = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10);
  const now = Math.floor(Date.now() / 1000);

  console.log(`\n=== Top predatory-unlock candidates (stablecoins excluded, Spearman ≤ -0.45, ≥12 wallets) ===\n`);
  console.log("rank  sym         chain     wallets  spearman  price?  timing      unlock span");
  candidates.forEach((r, i) => {
    const future = Number(r.latest_end) > now;
    const allPast = Number(r.latest_end) < now;
    const timing = allPast ? "past" : Number(r.earliest_end) > now ? "FUTURE" : "ongoing";
    console.log(
      `${String(i + 1).padStart(2)}.  ${String(r.symbol || "?").padEnd(11)} ${String(chainName[r.chain_id] || r.chain_id).padEnd(8)} ${String(r.wallets).padStart(6)}   ${Number(r.spearman).toFixed(3).padStart(7)}  ${(r.has_price ? "  ✓ " : "  – ")}   ${timing.padEnd(8)}   ${fmtDate(r.earliest_end)} → ${fmtDate(r.latest_end)}`
    );
  });

  // ── Stage 2: wallet-level breakdown for the strongest few ────────────────
  const topN = candidates.slice(0, 6);
  for (const t of topN) {
    const rows = await sql.unsafe(`
      SELECT recipient,
             sum((stream_data->>'totalAmount')::numeric) AS amount,
             sum((stream_data->>'totalAmount')::numeric * end_time)
               / NULLIF(sum((stream_data->>'totalAmount')::numeric), 0) AS w_end,
             min(end_time) AS first_end, max(end_time) AS last_end,
             count(*) AS streams
      FROM vesting_streams_cache
      WHERE chain_id = ${t.chain_id}
        AND token_address = '${t.token_address}'
        AND end_time IS NOT NULL AND end_time > 0
        AND (stream_data->>'totalAmount')::numeric > 0
      GROUP BY recipient
    `);
    const total = rows.reduce((a, r) => a + Number(r.amount), 0);
    const bySize = [...rows].sort((a, b) => Number(b.amount) - Number(a.amount));
    const top5 = bySize.slice(0, 5);
    const bottom5 = bySize.slice(-5);
    // share of supply held by the wallets that unlock in the first third of the timeline
    const span = Number(t.latest_end) - Number(t.earliest_end);
    const firstThirdCut = Number(t.earliest_end) + span / 3;
    const earlyShare = rows.filter(r => Number(r.w_end) <= firstThirdCut)
                           .reduce((a, r) => a + Number(r.amount), 0) / total;

    console.log(`\n\n──────── ${t.symbol} on ${chainName[t.chain_id] || t.chain_id}  (${t.token_address}) ────────`);
    console.log(`wallets=${t.wallets}  spearman=${Number(t.spearman).toFixed(3)}  total tracked alloc=${total.toExponential(3)}`);
    console.log(`Supply unlocking in the FIRST THIRD of the timeline: ${(earlyShare * 100).toFixed(1)}%`);
    console.log(`\n  TOP 5 wallets by size — when do they unlock?`);
    top5.forEach(r => console.log(
      `    ${(Number(r.amount) / total * 100).toFixed(1).padStart(5)}% of supply  unlocks ~${fmtDate(r.w_end)}  ${Number(r.last_end) < now ? "(ALREADY UNLOCKED)" : ""}  ${r.recipient.slice(0, 10)}…`
    ));
    console.log(`  BOTTOM 5 wallets by size — when do they unlock?`);
    bottom5.forEach(r => console.log(
      `    ${(Number(r.amount) / total * 100).toFixed(3).padStart(6)}% of supply  unlocks ~${fmtDate(r.w_end)}  ${r.recipient.slice(0, 10)}…`
    ));
  }
} catch (e) {
  console.error("ERR", e);
} finally {
  await sql.end();
}
