// Local test harness for the Magna TVL walker. Run:
//   npx tsx scripts/_magna-walk-test.ts <chainId> [chainId...]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { walkMagna } = await import("../src/lib/vesting/tvl-walker/magna");
  const chains = process.argv.slice(2).map(Number);
  for (const chainId of chains) {
    console.log(`\n=== walkMagna(${chainId}) ===`);
    const r = await walkMagna(chainId as never);
    console.log(`streams=${r.streamCount} tokens=${r.tokens.length} elapsed=${r.elapsedMs}ms error=${r.error ?? "none"}`);
    const sorted = [...r.tokens].sort((a, b) => Number(BigInt(b.lockedAmount) / 10n ** BigInt(b.tokenDecimals)) - Number(BigInt(a.lockedAmount) / 10n ** BigInt(a.tokenDecimals)));
    for (const t of sorted.slice(0, 10)) {
      const units = Number(BigInt(t.lockedAmount) / 10n ** BigInt(Math.max(0, t.tokenDecimals - 2))) / 100;
      console.log(`  ${(t.tokenSymbol ?? "?").padEnd(12)} ${t.tokenAddress.slice(0, 12)}…  escrow=${units.toLocaleString()} units  (${t.streamCount} vesters)`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
