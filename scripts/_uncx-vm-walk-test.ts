// Run walkUncxVm for one chain and print the aggregate it would snapshot.
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { walkUncxVm } = await import("../src/lib/vesting/tvl-walker/uncx-vm");
  const chainId = Number(process.argv[2] ?? 1);
  const t0 = Date.now();
  const r = await walkUncxVm(chainId as never);
  const totalTokens = r.tokens.length;
  console.log(`chain ${chainId}: streamCount=${r.streamCount} tokens=${totalTokens} elapsed=${Date.now()-t0}ms`);
  if (r.error) console.log("error:", r.error.slice(0, 200));
  for (const t of r.tokens.slice(0, 5)) console.log(`  ${t.tokenSymbol} ${t.lockedAmount} (${t.streamCount} streams)`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
