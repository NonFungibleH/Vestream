// Streamflow coverage check: open Contract accounts on chain vs
// vesting_streams_cache rows, per mint.
//
// One program-wide scan (closed=false) is the ground truth; cache rows are
// matched to it by stream id. For each mint (CARDS, UFO and the 8 mints with
// the most open streams, or the mints passed as arguments) it prints open
// streams on chain, cache rows, rows matching an open stream, stale rows
// (stream no longer open) and truncated-symbol rows.
//
// Usage: npx tsx scripts/_streamflow-coverage.ts [mint ...]
// RPC: STREAMFLOW_RPC_URL, else the public mainnet endpoint (Alchemy 429s the
// scan).
import { config } from "dotenv";
config({ path: ".env.local" });

const DEFAULT_MINTS = [
  "CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp", // CARDS
  "2JuPuNjpnbVoCqD4f1kCthy7xeiJAbT9KqmNj6gM7JeM", // UFO
];

async function main() {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { Connection } = await import("@solana/web3.js");
  const { scanOpenStreamflowContracts } = await import("../src/lib/vesting/adapters/streamflow");

  const url  = process.env.STREAMFLOW_RPC_URL || "https://api.mainnet-beta.solana.com";
  const t0   = Date.now();
  const open = await scanOpenStreamflowContracts(new Connection(url, "confirmed"));
  console.log(`on-chain: ${open.length} open Contract accounts (${Date.now() - t0}ms)`);

  const openIds    = new Set(open.map((c) => `streamflow-101-${c.id}`));
  const openByMint = new Map<string, number>();
  for (const c of open) openByMint.set(c.stream.mint, (openByMint.get(c.stream.mint) ?? 0) + 1);

  const argMints = process.argv.slice(2);
  const top = [...openByMint.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([m]) => m);
  const mints = argMints.length ? argMints : [...new Set([...DEFAULT_MINTS, ...top])];

  const rows = (await db.execute(sql`
    SELECT stream_id AS "streamId", token_address AS "mint", token_symbol AS "symbol"
    FROM vesting_streams_cache WHERE protocol = 'streamflow'
  `)) as unknown as { streamId: string; mint: string; symbol: string | null }[];

  const isTruncated = (s: string | null) => !!s && s.endsWith("…");
  const table = mints.map((m) => {
    const cached  = rows.filter((r) => r.mint === m);
    const matched = cached.filter((r) => openIds.has(r.streamId)).length;
    const onchain = openByMint.get(m) ?? 0;
    return {
      mint:      `${m.slice(0, 8)}…`,
      symbol:    cached.find((r) => r.symbol && !isTruncated(r.symbol))?.symbol ?? cached[0]?.symbol ?? "-",
      onchain,
      cached:    cached.length,
      matched,
      stale:     cached.length - matched,
      coverage:  onchain ? `${Math.round((matched / onchain) * 100)}%` : "-",
      truncated: cached.filter((r) => isTruncated(r.symbol)).length,
    };
  });
  console.table(table);

  const matchedAll = rows.filter((r) => openIds.has(r.streamId)).length;
  console.log(
    `overall: ${open.length} open on chain, ${rows.length} cache rows, ${matchedAll} match an open stream ` +
    `(${((matchedAll / open.length) * 100).toFixed(1)}% coverage), ${rows.length - matchedAll} stale, ` +
    `${rows.filter((r) => isTruncated(r.symbol)).length} truncated symbols`,
  );
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
