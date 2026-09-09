// Run the Doppler indexer's scanWindow over the most recent N windows on a
// chain, against the real registry + cache. Usage:
//   npx tsx scripts/_doppler-indexer-test.ts 8453 3 [protocol=doppler]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { makeFallbackClient } = await import("../src/lib/vesting/rpc");
  const { findIndexer } = await import("../src/lib/vesting/indexer");
  const chainId = Number(process.argv[2] ?? 8453);
  const windows = Number(process.argv[3] ?? 3);
  const client = makeFallbackClient(chainId as never, { forLogs: true, batch: false })!;
  const idx = findIndexer(process.argv[4] ?? "doppler", chainId)!;
  const latest = await client.getBlockNumber();
  let total = 0;
  for (let i = 0; i < windows; i++) {
    const to = latest - 30n - BigInt(i) * idx.maxBlocksPerScan;
    const from = to - idx.maxBlocksPerScan + 1n;
    const t0 = Date.now();
    const r = await idx.scanWindow(client, from, to);
    console.log(`window ${from}-${to}: ${r.eventCount} events (${Date.now() - t0}ms)`);
    total += r.eventCount;
  }
  console.log(`chain ${chainId}: ${total} creates seen across ${windows} windows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
