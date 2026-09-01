import { config } from "dotenv"; config({ path: ".env.local" });
async function main(){
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const c = createPublicClient({ chain: mainnet, transport: http("https://eth.drpc.org") });
  const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`;
  const vester="0x0ff6786b81b836f62780e15dd8fc4e3ed0a1ed01";
  const pad=(a:string)=>`0x${"0".repeat(24)}${a.slice(2)}` as `0x${string}`;
  const to=25878021n;
  // A) single from-topic
  for (const span of [100n, 9999n]) {
    try{
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logs = await (c.getLogs as any)({ topics:[TRANSFER, pad(vester)], fromBlock: to-span, toBlock: to });
      const froms = new Set(logs.map((l:{topics:string[]})=>("0x"+l.topics[1].slice(26)).toLowerCase()));
      console.log(`A single from-topic / ${span} blocks: ${logs.length} logs, distinct froms=${froms.size}, correct=${froms.size<=1}`);
    }catch(e){console.log(`A ${span}: FAIL ${(e as Error).message.split("\n")[0].slice(0,80)}`)}
    await new Promise(r=>setTimeout(r,500));
  }
  // B) array of 20 from-topics
  const many = Array.from({length:20},(_,i)=>pad("0x"+String(i).padStart(40,"a")));
  many[0]=pad(vester);
  try{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logs = await (c.getLogs as any)({ topics:[TRANSFER, many], fromBlock: to-9999n, toBlock: to });
    const froms = new Set(logs.map((l:{topics:string[]})=>("0x"+l.topics[1].slice(26)).toLowerCase()));
    console.log(`B 20 from-topics / 9999 blocks: ${logs.length} logs, distinct froms=${froms.size}`);
  }catch(e){console.log(`B: FAIL ${(e as Error).message.split("\n")[0].slice(0,80)}`)}
  process.exit(0);
}
main();
