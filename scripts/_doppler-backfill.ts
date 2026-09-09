// Drive the Doppler indexer through the runner (which persists the cursor in
// indexer_state) until it reports caught-up. Local cold-start backfill so the
// hourly prod cron only ever does steady-state work. Usage:
//   npx tsx scripts/_doppler-backfill.ts <chainId> [maxRuns] [pauseMs] [protocol=doppler]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { findIndexer, runIndexer } = await import("../src/lib/vesting/indexer");
  const chainId = Number(process.argv[2] ?? 8453);
  const maxRuns = Number(process.argv[3] ?? 5000);
  const protocol = process.argv[5] ?? "doppler";
  const idx = findIndexer(protocol, chainId);
  if (!idx) throw new Error(`no ${protocol} indexer for chain ${chainId}`);

  let events = 0;
  const pauseMs = Number(process.argv[4] ?? 1500); // breathing room for rate-limited RPCs
  for (let i = 0; i < maxRuns; i++) {
    let r;
    try {
      r = await runIndexer(idx);
    } catch (err) {
      // e.g. a 429 on eth_blockNumber before the runner's own error handling
      // kicks in. Back off and try again rather than dying mid-backfill.
      console.log(`run ${i}: threw ${(err as Error)?.message?.split("\n")[0] ?? err}; backing off 20s`);
      await new Promise((res) => setTimeout(res, 20_000));
      continue;
    }
    await new Promise((res) => setTimeout(res, pauseMs));
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
