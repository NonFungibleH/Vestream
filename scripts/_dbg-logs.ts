import { config } from "dotenv"; config({ path: ".env.local" });
async function main(){
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const c = createPublicClient({ chain: mainnet, transport: http("https://eth.drpc.org") });
  const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  // 1 token, 7000-block range
  for (const [label, addrs, span] of [
    ["1 token / 7000 blocks", ["0x28d38df637db75533bd3f71426f3410a82041544"], 7000n],
    ["1 token / 2000 blocks", ["0x28d38df637db75533bd3f71426f3410a82041544"], 2000n],
  ] as [string,string[],bigint][]) {
    try {
      const to = 25878021n; const from = to - span;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (c.getLogs as any)({ address: addrs, topics: [TRANSFER], fromBlock: from, toBlock: to });
      console.log(`${label}: OK ${logs.length} logs`);
    } catch(e){ console.log(`${label}: FAIL ${(e as Error).message.slice(0,220).replace(/\n/g,' ')}`); }
  }
  process.exit(0);
}
main();
