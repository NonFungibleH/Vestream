import { config } from "dotenv"; config({ path: ".env.local" });
async function main(){
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const c = createPublicClient({ chain: mainnet, transport: http("https://eth.drpc.org") });
  const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`;
  const vester="0x0ff6786b81b836f62780e15dd8fc4e3ed0a1ed01";
  const token ="0x28d38df637db75533bd3f71426f3410a82041544" as `0x${string}`;
  const pad=(a:string)=>`0x${"0".repeat(24)}${a.slice(2)}` as `0x${string}`;
  const to=25878021n;
  for (const span of [9999n, 50000n]) {
    try{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (c.getLogs as any)({ address:[token], topics:[TRANSFER,[pad(vester)]], fromBlock: to-span, toBlock: to });
      const froms=new Set(logs.map((l:{topics:string[]})=>("0x"+l.topics[1].slice(26)).toLowerCase()));
      console.log(`address+from-topic / ${span} blocks: ${logs.length} logs | distinct froms=${[...froms].join(",")||"-"} | filter honoured=${froms.size<=1}`);
    }catch(e){console.log(`${span}: FAIL ${(e as Error).message.split("\n")[0].slice(0,90)}`)}
    await new Promise(r=>setTimeout(r,600));
  }
  process.exit(0);
}
main();
