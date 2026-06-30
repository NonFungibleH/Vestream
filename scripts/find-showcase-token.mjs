// Read-only: find the best token for a SHOWCASE image on the token-detail
// page — many recipient wallets, many distinct schedules, unlocks staggered
// across many FUTURE dates (so the emission chart is rich, not a flat step).
// Throwaway diagnostic.
import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const cn = { 1:"ETH",10:"OP",56:"BSC",137:"Polygon",8453:"Base",42161:"Arbitrum",101:"Solana" };
const d = (s) => new Date(Number(s)*1000).toISOString().slice(0,10);

try {
  const rows = await sql.unsafe(`
    WITH base AS (
      SELECT v.chain_id, v.token_address, v.token_symbol, v.protocol,
             v.recipient,
             (v.stream_data->>'startTime') AS start_time,
             (v.stream_data->>'cliffTime') AS cliff_time,
             v.end_time
      FROM vesting_streams_cache v
      WHERE v.is_fully_vested = false
        AND v.chain_id NOT IN (11155111, 84532)
        AND v.end_time IS NOT NULL AND v.end_time > 0
    )
    SELECT b.chain_id, b.token_address,
           max(b.token_symbol) sym, max(b.protocol) proto,
           count(DISTINCT b.recipient)                                AS wallets,
           count(*)                                                   AS streams,
           count(DISTINCT (b.start_time, b.cliff_time, b.end_time))   AS schedules,
           count(DISTINCT floor(b.end_time/604800))                   AS unlock_weeks,
           count(DISTINCT CASE WHEN b.end_time > extract(epoch from now())
                               THEN floor(b.end_time/604800) END)     AS future_weeks,
           min(b.end_time) first_end, max(b.end_time) last_end,
           bool_or(p.price_usd IS NOT NULL)                           AS has_price
    FROM base b
    LEFT JOIN token_prices_cache p
      ON p.chain_id = b.chain_id AND lower(p.token_address) = lower(b.token_address)
    GROUP BY b.chain_id, b.token_address
    HAVING count(DISTINCT b.recipient) >= 40
       AND count(DISTINCT CASE WHEN b.end_time > extract(epoch from now())
                               THEN floor(b.end_time/604800) END) >= 6
    ORDER BY count(DISTINCT CASE WHEN b.end_time > extract(epoch from now())
                                 THEN floor(b.end_time/604800) END) DESC,
             count(DISTINCT (b.start_time, b.cliff_time, b.end_time)) DESC,
             count(DISTINCT b.recipient) DESC
    LIMIT 30
  `);

  console.log(`\n=== Best token-page showcase candidates (rich, staggered, forward-looking) ===\n`);
  console.log("sym        chain    proto       wallets  schedules  futWeeks  totWeeks  price  unlock span");
  for (const r of rows) {
    console.log(
      `${String(r.sym||"?").padEnd(10)} ${String(cn[r.chain_id]||r.chain_id).padEnd(8)} ${String(r.proto).padEnd(11)} ${String(r.wallets).padStart(6)}  ${String(r.schedules).padStart(8)}  ${String(r.future_weeks).padStart(7)}  ${String(r.unlock_weeks).padStart(7)}   ${r.has_price?" ✓ ":" – "}  ${d(r.first_end)} → ${d(r.last_end)}`
    );
  }
} catch (e) { console.error("ERR", e); } finally { await sql.end(); }
