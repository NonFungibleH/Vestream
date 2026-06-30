// Read-only: find the best "showcase" wallet for the explorer's wallet-search
// view — a recipient vesting across MANY distinct tokens / protocols / chains,
// ideally with real USD value. Throwaway diagnostic.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const chainName = { 1: "ETH", 10: "OP", 56: "BSC", 137: "Polygon", 8453: "Base", 42161: "Arbitrum", 101: "Solana" };

try {
  const top = await sql.unsafe(`
    WITH s AS (
      SELECT v.recipient, v.chain_id, v.token_address, v.protocol, v.token_symbol,
             (v.stream_data->>'lockedAmount')::numeric AS locked_raw,
             coalesce((v.stream_data->>'tokenDecimals')::int, 18) AS dec,
             p.price_usd
      FROM vesting_streams_cache v
      LEFT JOIN token_prices_cache p
        ON p.chain_id = v.chain_id AND lower(p.token_address) = lower(v.token_address)
      WHERE v.is_fully_vested = false
        AND v.chain_id NOT IN (11155111, 84532)
        AND v.stream_data->>'lockedAmount' IS NOT NULL
        AND v.recipient <> '0x0000000000000000000000000000000000000000'
        -- Drop liquidity-locker noise: LP pairs aren't investor vesting.
        AND v.protocol <> 'pinksale'
        AND coalesce(v.token_symbol, '') NOT IN ('UNI-V2','SLP','Cake-LP','vAMM','sAMM','BPT','UNCX')
        AND coalesce(v.token_symbol, '') NOT ILIKE '%-LP'
    )
    SELECT recipient,
           count(DISTINCT (chain_id, token_address)) AS tokens,
           count(DISTINCT protocol)                  AS protocols,
           count(DISTINCT chain_id)                  AS chains,
           count(*)                                  AS streams,
           sum(CASE WHEN price_usd IS NOT NULL
                    THEN (locked_raw / power(10, dec)) * price_usd ELSE 0 END) AS usd_locked,
           count(DISTINCT CASE WHEN price_usd IS NOT NULL THEN (chain_id, token_address) END) AS priced_tokens
    FROM s
    GROUP BY recipient
    HAVING count(DISTINCT CASE WHEN price_usd IS NOT NULL THEN (chain_id, token_address) END) >= 2
    ORDER BY count(DISTINCT protocol) DESC,
             count(DISTINCT CASE WHEN price_usd IS NOT NULL THEN (chain_id, token_address) END) DESC,
             sum(CASE WHEN price_usd IS NOT NULL THEN (locked_raw / power(10, dec)) * price_usd ELSE 0 END) DESC
    LIMIT 25
  `);

  console.log(`\n=== Candidate showcase wallets (≥4 distinct tokens, active vestings) ===\n`);
  console.log("recipient                                     tokens  priced  protos  chains  streams  ~USD locked");
  for (const r of top) {
    console.log(
      `${r.recipient.padEnd(44)}  ${String(r.tokens).padStart(5)}  ${String(r.priced_tokens).padStart(5)}  ${String(r.protocols).padStart(5)}  ${String(r.chains).padStart(5)}  ${String(r.streams).padStart(6)}   $${Math.round(Number(r.usd_locked)).toLocaleString()}`
    );
  }

  // Detail for the most interesting few (prefer breadth + priced value).
  const detailFor = top
    .filter(r => Number(r.priced_tokens) >= 1)
    .sort((a, b) => (Number(b.tokens) + Number(b.usd_locked) / 1e7) - (Number(a.tokens) + Number(a.usd_locked) / 1e7))
    .slice(0, 6);

  for (const w of detailFor) {
    const rows = await sql.unsafe(`
      SELECT v.chain_id, v.token_address, max(v.token_symbol) AS symbol, max(v.protocol) AS protocol,
             count(*) AS streams,
             sum((v.stream_data->>'lockedAmount')::numeric) AS locked_raw,
             coalesce(max((v.stream_data->>'tokenDecimals')::int), 18) AS dec,
             max(p.price_usd) AS price_usd
      FROM vesting_streams_cache v
      LEFT JOIN token_prices_cache p
        ON p.chain_id = v.chain_id AND lower(p.token_address) = lower(v.token_address)
      WHERE v.recipient = '${w.recipient}' AND v.is_fully_vested = false
      GROUP BY v.chain_id, v.token_address
      ORDER BY sum((v.stream_data->>'lockedAmount')::numeric) DESC
    `);
    console.log(`\n\n──────── ${w.recipient}  (${w.tokens} tokens · ${w.protocols} protocols · ~$${Math.round(Number(w.usd_locked)).toLocaleString()}) ────────`);
    rows.slice(0, 10).forEach(t => {
      const usd = t.price_usd ? (Number(t.locked_raw) / Math.pow(10, Number(t.dec))) * Number(t.price_usd) : null;
      console.log(`    ${String(t.symbol || "?").padEnd(10)} ${String(chainName[t.chain_id] || t.chain_id).padEnd(8)} ${String(t.protocol).padEnd(11)} streams=${String(t.streams).padStart(3)}  ${usd != null ? "$" + Math.round(usd).toLocaleString() : "(unpriced)"}`);
    });
    if (rows.length > 10) console.log(`    … +${rows.length - 10} more tokens`);
  }
} catch (e) {
  console.error("ERR", e);
} finally {
  await sql.end();
}
