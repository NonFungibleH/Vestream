// One-off: run the rollup refresh from a machine without Vercel's 300s cap.
// The scheduled /api/cron/refresh-rollups runs the work in after(), which has
// been getting killed before completion since 2026-06-21, freezing the Explorer's
// Upcoming tab (and never indexing Team Finance, re-enabled 2026-06-30).
import { refreshTokenRollups } from "../src/lib/vesting/token-rollups";
import { refreshProtocolSummaries } from "../src/lib/vesting/protocol-stats";

async function main() {
  const t0 = Date.now();
  console.log("refreshTokenRollups() starting…");
  const r = await refreshTokenRollups();
  console.log(`refreshTokenRollups() done: ${r.rows} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const t1 = Date.now();
  console.log("refreshProtocolSummaries() starting…");
  await refreshProtocolSummaries();
  console.log(`refreshProtocolSummaries() done in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
