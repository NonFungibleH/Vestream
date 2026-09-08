// Smoke test the Doppler adapter's registry → live-state path for one or
// more wallets. Usage: npx tsx scripts/_doppler-adapter-test.ts 8453 0xabc 0xdef
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { dopplerAdapter } = await import("../src/lib/vesting/adapters/doppler");
  const chainId = Number(process.argv[2] ?? 8453);
  const wallets = process.argv.slice(3);
  if (wallets.length === 0) throw new Error("pass at least one wallet");
  const streams = await dopplerAdapter.fetch(wallets, chainId as never);
  console.log(`chain ${chainId}: ${streams.length} streams for ${wallets.length} wallet(s)`);
  for (const s of streams) console.log(" ", s.id, s.tokenSymbol, "claimable", s.claimableNow, "cliff", s.cliffTime, "next", s.nextUnlockTime);
  process.exit(0);
}
main().catch((e) => { console.error("ADAPTER ERROR:", e?.message ?? e); process.exit(1); });
