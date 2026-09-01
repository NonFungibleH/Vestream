import { config } from "dotenv"; config({ path: ".env.local" });
async function main(){
  const { makeFallbackClient } = await import("../src/lib/vesting/rpc");
  const { db } = await import("../src/lib/db");
  const { magnaVesters } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  const rows = await db.select({address: magnaVesters.address}).from(magnaVesters).where(sql`${magnaVesters.chainId} = 1`);
  console.log("registry rows for chain 1:", rows.length);
  const target = "0x0ff6786b81b836f62780e15dd8fc4e3ed0a1ed01";
  console.log("target vester in registry?", rows.some(r=>r.address.toLowerCase()===target));
  const client = makeFallbackClient(1 as never, {forLogs:true, batch:false})!;
  const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const fromTopic = `0x${"0".repeat(24)}${target.slice(2)}`;
  const logs = await (client.getLogs as any)({ topics:[TRANSFER,[fromTopic]], fromBlock: 25877921n, toBlock: 25878021n });
  console.log("direct getLogs hits:", logs.length);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1)});
