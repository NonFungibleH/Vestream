// Drive the Doppler indexer through the runner (which persists the cursor in
// indexer_state) until it reports caught-up. Local cold-start backfill so the
// hourly prod cron only ever does steady-state work. Usage:
//   npx tsx scripts/_doppler-backfill.ts 8453 [maxRuns]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { findIndexer, runIndexer } = await import("../src/lib/vesting/indexer");
  const chainId = Number(process.argv[2] ?? 8453);
  const maxRuns = Number(process.argv[3] ?? 5000);
  const idx = findIndexer("doppler", chainId);
  if (!idx) throw new Error(`no doppler indexer for chain ${chainId}`);

  let events = 0;
  for (let i = 0; i < maxRuns; i++) {
    const r = await runIndexer(idx);
    events += r.eventCount;
    console.log(`run ${i}: ${r.fromBlock}-${r.toBlock} windows=${r.windows ?? 0} events=${r.eventCount} ${r.durationMs}ms${r.skipped ? " " + r.skipped : ""}${r.error ? " ERR " + r.error : ""}`);
    if (r.skipped === "caught-up") break;
    if (r.skipped === "no-client") break;
    if (r.error) await new Promise((res) => setTimeout(res, 5000)); // back off on RPC errors
  }
  console.log(`chain ${chainId}: ${events} creates processed`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
