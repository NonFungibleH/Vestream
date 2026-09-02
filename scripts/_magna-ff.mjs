// Fast-forward the Magna indexer cursors. Historical claims were already
// captured by scripts/_magna-claims-backfill.ts (27.5k txs decoded), so the
// live indexer only needs to cover from "recently" onward — otherwise it burns
// ~31 days of hourly ticks re-scanning 8.9M blocks it can only rediscover.
// Leaves a generous overlap so nothing between the backfill and now is missed.
import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
// Overlap ≈ 10 days of blocks per chain (block times differ wildly).
const OVERLAP = { 1: 72_000, 8453: 432_000, 42161: 4_000_000, 10: 432_000, 137: 400_000, 43114: 400_000, 56: 288_000 };
// ONLY the chains whose history the claims backfill actually covered (those
// with a working Blockscout). Base / BSC / Avalanche were NOT backfilled — fast
// -forwarding them would skip their historical claims permanently, so they keep
// crawling from genesis.
const RPC = {
  1:"https://eth.drpc.org", 42161:"https://arbitrum.drpc.org",
  10:"https://optimism.drpc.org", 137:"https://polygon.drpc.org",
};
const apply = process.argv.includes("--apply");
try {
  for (const [cid, url] of Object.entries(RPC)) {
    const cur = await sql`select last_confirmed_block from indexer_state where protocol='magna' and chain_id=${Number(cid)}`;
    if (!cur.length) { console.log(`chain ${cid}: no state row, skipping`); continue; }
    let head;
    try {
      const r = await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]})});
      head = parseInt((await r.json()).result, 16);
    } catch { console.log(`chain ${cid}: head fetch failed`); continue; }
    const target = head - (OVERLAP[cid] ?? 100_000);
    const now = Number(cur[0].last_confirmed_block);
    if (now >= target) { console.log(`chain ${cid}: already at ${now} (>= ${target}), no change`); continue; }
    console.log(`chain ${cid}: ${now} -> ${target} (head ${head}, skipping ${(target-now).toLocaleString()} already-backfilled blocks)${apply?"":"  [dry-run]"}`);
    if (apply) await sql`update indexer_state set last_confirmed_block=${target}, last_scanned_block=${target}, updated_at=now() where protocol='magna' and chain_id=${Number(cid)}`;
  }
} finally { await sql.end(); }
