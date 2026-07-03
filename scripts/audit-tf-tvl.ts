// Read-only audit: where does Team Finance's BNB headline TVL come from?
import { runWalker } from "../src/lib/vesting/tvl-walker";
import { priceAggregates } from "../src/lib/vesting/tvl";

const LIQUIDITY_MULTIPLIER = 10;
const MIN_PER_TOKEN_CEILING_USD = 1_000_000;
const COINGECKO_PER_TOKEN_CEILING = 20_000_000;
const ABSOLUTE_PER_TOKEN_CEILING_USD = 500_000_000;
const HIGH_BAND_CEILING_USD = 200_000_000;
const MEDIUM_BAND_CEILING_USD = 10_000_000;
const LOW_BAND_CEILING_USD = 500_000;

function perTokenCeiling(p: { source: string; liquidityUsd: number | null; confidence: string }): number {
  let cap: number;
  if (p.source === "coingecko" || p.source === "defillama") cap = COINGECKO_PER_TOKEN_CEILING;
  else cap = Math.max(MIN_PER_TOKEN_CEILING_USD, (p.liquidityUsd ?? 0) * LIQUIDITY_MULTIPLIER);
  const band = p.confidence === "high" ? HIGH_BAND_CEILING_USD : p.confidence === "medium" ? MEDIUM_BAND_CEILING_USD : LOW_BAND_CEILING_USD;
  return Math.min(cap, band, ABSOLUTE_PER_TOKEN_CEILING_USD);
}

async function main() {
  const walker = await runWalker("team-finance", 56);
  if (!walker) { console.log("no walker result"); return; }
  const input = walker.tokens.map((t) => ({
    chainId: t.chainId, tokenAddress: t.tokenAddress, tokenSymbol: t.tokenSymbol,
    tokenDecimals: t.tokenDecimals, lockedAmount: t.lockedAmount,
  }));
  const { priced } = await priceAggregates(input);

  let rawTotal = 0, creditedTotal = 0, floorHits = 0;
  const rows = priced.map((p) => {
    const credited = Math.min(p.usd, perTokenCeiling(p));
    rawTotal += p.usd; creditedTotal += credited;
    if (Math.abs(credited - MIN_PER_TOKEN_CEILING_USD) < 1) floorHits++;
    return { sym: p.tokenSymbol, usd: p.usd, credited, liq: p.liquidityUsd, conf: p.confidence, src: p.source };
  }).sort((a, b) => b.credited - a.credited);

  console.log(`TF BNB: ${priced.length} priced tokens`);
  console.log(`  raw sum      = $${(rawTotal / 1e6).toFixed(1)}M`);
  console.log(`  credited sum = $${(creditedTotal / 1e6).toFixed(1)}M  (this is the headline)`);
  console.log(`  tokens crediting exactly the $1M floor: ${floorHits}`);
  console.log(`  tokens with liquidity < $10k crediting >= $500k: ${rows.filter(r => (r.liq ?? 0) < 10000 && r.credited >= 500000).length}`);
  console.log("\n  Top 15 credited:");
  for (const r of rows.slice(0, 15)) {
    console.log(`    ${(r.sym || "?").padEnd(10)} credited=$${(r.credited/1e6).toFixed(2)}M  raw=$${(r.usd/1e6).toFixed(2)}M  liq=$${((r.liq ?? 0)/1e3).toFixed(1)}k  ${r.conf}/${r.src}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
