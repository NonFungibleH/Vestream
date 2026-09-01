// Repair pass for cached streams whose token metadata failed to resolve.
//
// `symbol()` / `decimals()` are read once when a stream is first indexed. A
// transient RPC failure at that moment bakes "???" / 18 into the cached row
// permanently — the row is otherwise valid, so nothing ever retries it. This
// showed up as 337 streams site-wide (299 of them Magna, incl. Wormhole's W
// and PTB) rendering "???" to users.
//
// This re-reads metadata for every DISTINCT (chain, token) that currently has
// a bad symbol and rewrites both the `token_symbol` column and the mirrored
// fields inside `stream_data`. Idempotent and safe to re-run; skips tokens
// whose symbol still won't resolve.
//
// Usage: npx tsx scripts/repair-token-symbols.ts [--apply]
import { config } from "dotenv";
config({ path: ".env.local" });

// Drizzle inlines a JS array as a tuple, not a PG array — use an explicit
// IN-list instead of = ANY().


async function main() {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { makeFallbackClient } = await import("../src/lib/vesting/rpc");
  const { erc20Abi } = await import("viem");

  const rows = (await db.execute(sql`
    SELECT chain_id AS "chainId", token_address AS "tokenAddress", count(*)::int AS n
    FROM vesting_streams_cache
    WHERE token_symbol IS NULL OR token_symbol IN ('???', '')
    GROUP BY 1, 2 ORDER BY n DESC
  `)) as unknown as { chainId: number; tokenAddress: string; n: number }[];

  console.log(`${rows.length} distinct (chain, token) pairs need repair`);
  let fixed = 0, skipped = 0;

  for (const r of rows) {
    // Solana mints can't be read with an EVM client — leave for the SVM path.
    if (!r.tokenAddress.startsWith("0x")) { skipped++; continue; }
    const client = makeFallbackClient(r.chainId as never, { batch: false });
    if (!client) { skipped++; continue; }
    let symbol: string | null = null, decimals: number | null = null;
    try {
      const [s, d] = await Promise.all([
        client.readContract({ address: r.tokenAddress as `0x${string}`, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: r.tokenAddress as `0x${string}`, abi: erc20Abi, functionName: "decimals" }),
      ]);
      symbol = String(s).trim(); decimals = Number(d);
    } catch (e) {
      console.log(`  chain ${r.chainId} ${r.tokenAddress.slice(0, 12)}… unresolved: ${(e as Error).message.slice(0, 60)}`);
      skipped++; continue;
    }
    if (!symbol || symbol === "???") { skipped++; continue; }

    console.log(`  chain ${r.chainId} ${r.tokenAddress.slice(0, 12)}… -> ${symbol} (${decimals}dp), ${r.n} streams${apply ? "" : "  [dry-run]"}`);
    if (!apply) { fixed++; continue; }
    await db.execute(sql`
      UPDATE vesting_streams_cache
      SET token_symbol = ${symbol},
          stream_data = jsonb_set(
            jsonb_set(stream_data, '{tokenSymbol}', to_jsonb(${symbol}::text), true),
            '{tokenDecimals}', to_jsonb(${decimals}::int), true)
      WHERE chain_id = ${r.chainId} AND token_address = ${r.tokenAddress}
        AND (token_symbol IS NULL OR token_symbol IN ('???', ''))
    `);
    fixed++;
  }
  console.log(`${apply ? "repaired" : "would repair"} ${fixed} tokens; skipped ${skipped}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
