// Find a real Magna claim and run the indexer's scanWindow over it.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { makeFallbackClient } = await import("../src/lib/vesting/rpc");
  const { findIndexer } = await import("../src/lib/vesting/indexer");
  const chainId = Number(process.argv[2] ?? 1);
  const client = makeFallbackClient(chainId as never, { forLogs: true, batch: false })!;
  const idx = findIndexer("magna", chainId)!;
  const latest = await client.getBlockNumber();

  // Walk back in 9,999-block windows until we find claims (max 40 windows).
  let total = 0;
  for (let i = 0; i < Number(process.argv[3] ?? 12); i++) {
    const to = latest - BigInt(i) * 10_000n;
    const from = to - 9_999n;
    const r = await idx.scanWindow(client, from, to);
    if (r.eventCount > 0) console.log(`  window ${from}-${to}: ${r.eventCount} streams`);
    total += r.eventCount;
  }
  console.log(`chain ${chainId}: ${total} streams indexed`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
