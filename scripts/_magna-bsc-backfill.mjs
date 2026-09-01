// BSC backfill via NodeReal public gateway (50k-block eth_getLogs cap).
// v2.1 factory created ~85,217,113. v1 creation found by binary search below.
const NR = "https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3";
const MERKLE_V21 = "0xb19be3f669df1f0238815b36efeeda9af7b6921ac4a36ae4e9bea6f03aa52754";
const V1_TOPIC   = "0x13c091a474cc422eb5bbc53fbf66ccd93e043d23b03db1bad730ea303fa32276";
const F_V21 = "0xaD1b1887CA414cAcF7F19288FE234c3f738dFEA2";
const F_V1  = "0x7fE21700152CB26065B79dfeDd03173e0238E568";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function rpc(method, params, tries = 4) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(NR, { method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({jsonrpc:"2.0",id:1,method,params}) });
      const b = await res.json();
      if (b.error) throw new Error(b.error.message);
      return b.result;
    } catch (e) {
      if (a === tries-1) throw e;
      await sleep(1200 * (a+1));
    }
  }
}
const latest = BigInt(await rpc("eth_blockNumber", []));
console.error("latest block:", latest.toString());
// binary-search v1 creation
let lo=1n, hi=latest;
while (lo < hi) {
  const mid=(lo+hi)/2n;
  const code = await rpc("eth_getCode",[F_V1,"0x"+mid.toString(16)]).catch(()=>null);
  if (code === null || code === "0x") lo = mid+1n; else hi = mid;
  await sleep(120);
}
console.error("v1 creation ~", lo.toString());
const jobs = [ ["v21", F_V21, 85_217_000n], ["v1", F_V1, lo - 10n] ];
const vesters = new Set();
const STEP = 49_999n;
for (const [label, f, from0] of jobs) {
  let scanned = 0;
  for (let from = from0; from <= latest; from += STEP + 1n) {
    const to = from + STEP > latest ? latest : from + STEP;
    try {
      const logs = await rpc("eth_getLogs", [{ address: f, fromBlock: "0x"+from.toString(16), toBlock: "0x"+to.toString(16) }]);
      for (const l of logs) {
        if (l.topics?.[0] === MERKLE_V21 && l.topics[2]) vesters.add("0x"+l.topics[2].slice(26).toLowerCase());
        else if (l.topics?.[0] === V1_TOPIC && l.data?.length >= 66) vesters.add("0x"+l.data.slice(26,66).toLowerCase());
      }
    } catch (e) { console.error(`${label} chunk ${from}: ${e.message}`); }
    scanned++;
    if (scanned % 50 === 0) console.error(`${label}: ${scanned} chunks, vesters so far=${vesters.size}`);
    await sleep(180);
  }
  console.error(`${label} done, cumulative vesters=${vesters.size}`);
}
console.log(JSON.stringify([...vesters].sort(), null, 2));
