// Historical Magna claim backfill.
//
// The Phase 2 indexer advances ~9,999 blocks/tick, so catching up from the
// factory genesis would take ~890 hourly ticks on Ethereum. Instead we ask an
// explorer which blocks actually contain claim payouts (ERC-20 transfers OUT
// of a known vester), coalesce those into minimal scan windows, and hand each
// window to the SAME indexer.scanWindow() — so the decode path (and therefore
// the resulting VestingStream shape) is identical to steady-state indexing.
//
// Usage: npx tsx scripts/_magna-claims-backfill.ts <chainId> [maxVesters]
import { config } from "dotenv";
config({ path: ".env.local" });

const BLOCKSCOUT: Record<number, string> = {
  1: "https://eth.blockscout.com",
  10: "https://optimism.blockscout.com",
  137: "https://polygon.blockscout.com",
  42161: "https://arbitrum.blockscout.com",
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function claimTxsFor(base: string, vester: string): Promise<string[]> {
  const hashes: string[] = [];
  let params = "";
  for (let page = 0; page < 20; page++) {
    let body: { items?: { from?: { hash?: string }; transaction_hash?: string }[]; next_page_params?: Record<string, unknown> };
    try {
      const res = await fetch(`${base}/api/v2/addresses/${vester}/token-transfers?type=ERC-20${params ? "&" + params : ""}`);
      if (!res.ok) break;
      body = await res.json();
    } catch { break; }
    for (const it of body.items ?? []) {
      if (it.from?.hash?.toLowerCase() === vester.toLowerCase() && it.transaction_hash) hashes.push(it.transaction_hash);
    }
    if (!body.next_page_params) break;
    params = new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)])).toString();
    await sleep(220);
  }
  return hashes;
}

async function main() {
  const chainId = Number(process.argv[2]);
  const maxVesters = Number(process.argv[3] ?? 9999);
  const base = BLOCKSCOUT[chainId];
  if (!base) { console.error(`no explorer configured for chain ${chainId}`); process.exit(1); }

  const { createPublicClient, http } = await import("viem");
  const viemChains = await import("viem/chains");
  const { findIndexer } = await import("../src/lib/vesting/indexer");
  const { db } = await import("../src/lib/db");
  const { magnaVesters } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  const rows = await db.select({ address: magnaVesters.address }).from(magnaVesters)
    .where(sql`${magnaVesters.chainId} = ${chainId}`);
  const vesters = rows.map((r) => r.address).slice(0, maxVesters);
  console.log(`chain ${chainId}: ${vesters.length} vesters in registry`);

  const allTx = new Map<string, string>();   // txHash -> vester
  for (let i = 0; i < vesters.length; i++) {
    const hs = await claimTxsFor(base, vesters[i]);
    hs.forEach((h) => allTx.set(h, vesters[i]));
    if (i % 20 === 0) console.log(`  scanned ${i}/${vesters.length} vesters, ${allTx.size} claim txs`);
    await sleep(180);
  }
  const DRPC: Record<number, string> = {
    1: "https://eth.drpc.org", 10: "https://optimism.drpc.org",
    137: "https://polygon.drpc.org", 42161: "https://arbitrum.drpc.org",
  };
  const CHAIN_OBJ: Record<number, unknown> = {
    1: viemChains.mainnet, 10: viemChains.optimism,
    137: viemChains.polygon, 42161: viemChains.arbitrum,
  };
  const txs = [...allTx];
  console.log(`found ${txs.length} distinct claim transactions`);
  if (txs.length === 0) { process.exit(0); }

  // Decode each claim tx directly — no eth_getLogs at all. Free-tier providers
  // either ignore topic-address filters or blow past response-size caps when
  // filtering by token address, so log scanning is the wrong tool for a
  // historical sweep. The explorer already told us exactly which txs matter.
  const client = createPublicClient({
    chain: CHAIN_OBJ[chainId] as never,
    transport: http(DRPC[chainId]),
  }) as never;
  const { decodeClaimTx } = await import("../src/lib/vesting/indexer/magna");
  const { writeToCache } = await import("../src/lib/vesting/dbcache");

  const vesterToken = new Map<string, string>();
  const tokenCache  = new Map<string, { symbol: string; decimals: number }>();
  let total = 0;
  const batch: unknown[] = [];
  for (let i = 0; i < txs.length; i++) {
    const [hash, vester] = txs[i];
    try {
      const decoded = await decodeClaimTx(client, chainId as never, hash as `0x${string}`,
        [vester], vesterToken, tokenCache);
      batch.push(...decoded);
      total += decoded.length;
    } catch (e) {
      console.log(`  tx ${hash.slice(0, 12)} failed: ${(e as Error).message.slice(0, 90)}`);
    }
    if (batch.length >= 40) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await writeToCache(batch as any); batch.length = 0;
    }
    if (i % 50 === 0) console.log(`  ${i}/${txs.length} txs, ${total} streams`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (batch.length) await writeToCache(batch as any);

  console.log(`DONE chain ${chainId}: ${total} streams indexed`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
