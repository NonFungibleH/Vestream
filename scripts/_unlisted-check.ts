// Prove `unlisted` protocols are excluded from the public unlock window query.
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { getUnlocksInWindow } = await import("../src/lib/vesting/unlock-windows");
  const { UNLISTED_ADAPTER_IDS } = await import("../src/lib/protocol-constants");
  const now = Math.floor(Date.now() / 1000);
  const r = await getUnlocksInWindow(now, now + 120 * 86400, 1000);
  const protocols = new Set(r.groups.map((g) => g.protocol));
  console.log("unlisted ids:", UNLISTED_ADAPTER_IDS);
  console.log("window groups:", r.groups.length, "protocols:", [...protocols].sort().join(", "));
  console.log("leak:", [...protocols].some((p) => UNLISTED_ADAPTER_IDS.includes(p)) ? "YES" : "none");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
