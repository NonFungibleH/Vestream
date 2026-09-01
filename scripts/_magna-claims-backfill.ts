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

async function claimBlocksFor(base: string, vester: string): Promise<number[]> {
  const blocks: number[] = [];
  let params = "";
  for (let page = 0; page < 20; page++) {
    let body: { items?: { from?: { hash?: string }; block_number?: number }[]; next_page_params?: Record<string, unknown> };
    try {
      const res = await fetch(`${base}/api/v2/addresses/${vester}/token-transfers?type=ERC-20${params ? "&" + params : ""}`);
      if (!res.ok) break;
      body = await res.json();
    } catch { break; }
    for (const it of body.items ?? []) {
      if (it.from?.hash?.toLowerCase() === vester.toLowerCase() && it.block_number) blocks.push(it.block_number);
    }
    if (!body.next_page_params) break;
    params = new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)])).toString();
    await sleep(220);
  }
  return blocks;
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

  const all = new Set<number>();
  for (let i = 0; i < vesters.length; i++) {
    const bs = await claimBlocksFor(base, vesters[i]);
    bs.forEach((b) => all.add(b));
    if (i % 20 === 0) console.log(`  scanned ${i}/${vesters.length} vesters, ${all.size} claim blocks`);
    await sleep(180);
  }
  const blocks = [...all].sort((a, b) => a - b);
  console.log(`found ${blocks.length} distinct claim blocks`);
  if (blocks.length === 0) { process.exit(0); }

  // Coalesce into <=9,999-block windows.
  const windows: [bigint, bigint][] = [];
  let start = blocks[0], prev = blocks[0];
  for (const b of blocks.slice(1)) {
    if (b - start > 9_000) { windows.push([BigInt(start), BigInt(prev)]); start = b; }
    prev = b;
  }
  windows.push([BigInt(start), BigInt(prev)]);
  console.log(`coalesced into ${windows.length} scan windows`);

  // Pin to dRPC rather than the shared pool: the pool rotates across providers
  // and some (e.g. 1rpc.io) cap eth_getLogs at ~50 blocks, which fails every
  // multi-thousand-block backfill window. dRPC serves 10k ranges reliably.
  const DRPC: Record<number, string> = {
    1: "https://eth.drpc.org", 10: "https://optimism.drpc.org",
    137: "https://polygon.drpc.org", 42161: "https://arbitrum.drpc.org",
  };
  const CHAIN_OBJ: Record<number, unknown> = {
    1: viemChains.mainnet, 10: viemChains.optimism,
    137: viemChains.polygon, 42161: viemChains.arbitrum,
  };
  const client = createPublicClient({
    chain: CHAIN_OBJ[chainId] as never,
    transport: http(DRPC[chainId]),
  }) as never;
  const idx = findIndexer("magna", chainId)!;
  let total = 0;
  for (let i = 0; i < windows.length; i++) {
    const [from, to] = windows[i];
    try {
      const r = await idx.scanWindow(client, from, to);
      total += r.eventCount;
      if (r.eventCount) console.log(`  window ${from}-${to}: +${r.eventCount} (total ${total})`);
    } catch (e) {
      console.log(`  window ${from}-${to} failed: ${(e as Error).message.slice(0, 200).replace(/\n/g, " ")}`);
    }
    if (i % 10 === 0) await sleep(400);
  }
  console.log(`DONE chain ${chainId}: ${total} streams indexed`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
