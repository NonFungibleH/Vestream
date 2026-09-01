// Base backfill via mainnet.base.org (10k-block eth_getLogs cap, keyless).
// Blockscout for Base is persistently 500ing, so we scan logs directly.
const RPC="https://mainnet.base.org";
const MERKLE_V21="0xb19be3f669df1f0238815b36efeeda9af7b6921ac4a36ae4e9bea6f03aa52754";
const V1_TOPIC  ="0x13c091a474cc422eb5bbc53fbf66ccd93e043d23b03db1bad730ea303fa32276";
const JOBS=[["v21","0x052d4671F4AE15E6215fb7135d8c2e3E587b0920",24_794_000n],
            ["v1", "0x0F15a081b6f28f3863EE0206EA512C011A24b37C", 4_609_000n]];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function rpc(method,params,tries=4){
  for(let a=0;a<tries;a++){
    try{
      const r=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
      const b=await r.json();
      if(b.error) throw new Error(b.error.message);
      return b.result;
    }catch(e){ if(a===tries-1) throw e; await sleep(700*(a+1)); }
  }
}
const latest=BigInt(await rpc("eth_blockNumber",[]));
console.error("latest:",latest.toString());
const vesters=new Set();
const STEP=9_999n, CONC=4;
for(const [label,f,from0] of JOBS){
  const chunks=[];
  for(let from=from0; from<=latest; from+=STEP+1n) chunks.push([from, from+STEP>latest?latest:from+STEP]);
  console.error(`${label}: ${chunks.length} chunks`);
  for(let i=0;i<chunks.length;i+=CONC){
    const batch=chunks.slice(i,i+CONC);
    const res=await Promise.allSettled(batch.map(([a,b])=>rpc("eth_getLogs",[{address:f,fromBlock:"0x"+a.toString(16),toBlock:"0x"+b.toString(16)}])));
    for(const r of res){
      if(r.status!=="fulfilled") continue;
      for(const l of r.value||[]){
        if(l.topics?.[0]===MERKLE_V21 && l.topics[2]) vesters.add("0x"+l.topics[2].slice(26).toLowerCase());
        else if(l.topics?.[0]===V1_TOPIC && l.data?.length>=66) vesters.add("0x"+l.data.slice(26,66).toLowerCase());
      }
    }
    if(i%400===0) console.error(`  ${label} ${i}/${chunks.length} vesters=${vesters.size}`);
    await sleep(120);
  }
  console.error(`${label} done, vesters=${vesters.size}`);
}
console.log(JSON.stringify([...vesters].sort(),null,2));
