import { config } from "dotenv"; config({ path: ".env.local" });
async function main(){
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const { db } = await import("../src/lib/db");
  const { magnaVesters } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  const c = createPublicClient({ chain: mainnet, transport: http("https://eth.drpc.org") });
  const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const rows = await db.select({address: magnaVesters.address}).from(magnaVesters).where(sql`${magnaVesters.chainId} = 1`);
  const VESTER_ABI=[{name:"token",type:"function",stateMutability:"view",inputs:[],outputs:[{type:"address"}]}] as const;
  const res = await c.multicall({ contracts: rows.slice(0,40).map(r=>({address:r.address as `0x${string}`,abi:VESTER_ABI,functionName:"token" as const})), allowFailure:true });
  const tokens=[...new Set(res.filter(r=>r.status==="success").map(r=>String(r.result).toLowerCase()))] as `0x${string}`[];
  console.log("distinct tokens available:", tokens.length);
  const to=25878021n;
  for (const nAddr of [5,10,20,40]) {
    for (const span of [9999n, 2000n]) {
      if (nAddr > tokens.length) continue;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const logs = await (c.getLogs as any)({ address: tokens.slice(0,nAddr), topics:[TRANSFER], fromBlock: to-span, toBlock: to });
        console.log(`  ${nAddr} addrs / ${span} blocks: OK (${logs.length} logs)`);
      } catch(e){ console.log(`  ${nAddr} addrs / ${span} blocks: FAIL ${(e as Error).message.split("\n")[0].slice(0,70)}`); }
      await new Promise(r=>setTimeout(r,600));
    }
  }
  process.exit(0);
}
main();
