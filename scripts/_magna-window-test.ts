// Run the Magna indexer over an exact block window containing a known claim.
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { makeFallbackClient } = await import("../src/lib/vesting/rpc");
  const { findIndexer } = await import("../src/lib/vesting/indexer");
  const chainId = Number(process.argv[2]);
  const center  = BigInt(process.argv[3]);
  const client = makeFallbackClient(chainId as never, { forLogs: true, batch: false })!;
  const idx = findIndexer("magna", chainId)!;
  const r = await idx.scanWindow(client, center - 50n, center + 50n);
  console.log(`window ${center-50n}..${center+50n} → eventCount=${r.eventCount}`);
  process.exit(0);
}
main().catch((e)=>{console.error(e);process.exit(1)});
