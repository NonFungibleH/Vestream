// One-off repair (2026-10-17): cache rows whose stream_data.tokenDecimals is 0
// although the token contract reports more. Sablier's Envio indexer returned
// decimals 0 for some tokens and the resolver trusted it, so raw amounts read
// as whole tokens on the token pages (QOIN on Base: 5.4 quintillion "vesting").
// The resolver now confirms a 0 on-chain; this fixes the rows already written.
//
//   npx tsx scripts/repair-zero-decimals.ts          # dry run
//   npx tsx scripts/repair-zero-decimals.ts --apply
//
// EVM only. Solana mints are skipped (their decimals come from the mint, and
// 0-decimal SPL tokens are common).

import postgres from "postgres";
import { erc20Abi } from "viem";
import { makeFallbackClient } from "../src/lib/vesting/rpc";
import type { SupportedChainId } from "../src/lib/vesting/types";

const apply = process.argv.includes("--apply");

async function main() {
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const tokens = await sql<{ chain_id: number; tok: string; n: number }[]>`
  select chain_id, lower(token_address) tok, count(*)::int n
  from vesting_streams_cache
  where (stream_data->>'tokenDecimals')::int = 0 and token_address like '0x%'
  group by 1, 2 order by 3 desc`;

let fixedRows = 0;
for (const t of tokens) {
  const client = makeFallbackClient(t.chain_id as SupportedChainId);
  let onChain: number | null = null;
  try {
    onChain = Number(await client!.readContract({ address: t.tok as `0x${string}`, abi: erc20Abi, functionName: "decimals" }));
  } catch { onChain = null; }
  const verdict = onChain == null ? "unreadable, left alone" : onChain === 0 ? "really 0, left alone" : `fix -> ${onChain}`;
  console.log(`${t.chain_id} ${t.tok} rows=${t.n} on-chain=${onChain} ${verdict}`);
  if (!apply || onChain == null || onChain === 0) continue;
  const res = await sql`
    update vesting_streams_cache
    set stream_data = jsonb_set(stream_data, '{tokenDecimals}', to_jsonb(${onChain}::int))
    where chain_id = ${t.chain_id} and lower(token_address) = ${t.tok}
      and (stream_data->>'tokenDecimals')::int = 0`;
  fixedRows += res.count;
}
console.log(apply ? `updated ${fixedRows} rows` : "dry run, nothing written");
await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
