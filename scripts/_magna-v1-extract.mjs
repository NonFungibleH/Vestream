// Extract V1 vester addresses: event 0x13c091a4... has vester = first word of data.
const V1_TOPIC = "0x13c091a474cc422eb5bbc53fbf66ccd93e043d23b03db1bad730ea303fa32276";
const TARGETS = {
  1:     { bs: "https://eth.blockscout.com",      f: "0x47546C3A473aa5150F8de23561fFE4e0ceb367a7" },
  10:    { bs: "https://optimism.blockscout.com", f: "0x87c4FbeB13Bfa441Ce561670020C85bf93625428" },
  137:   { bs: "https://polygon.blockscout.com",  f: "0xC6cC1A91082471dB3D15202cf40CfC953d8CA966" },
  42161: { bs: "https://arbitrum.blockscout.com", f: "0xbD69143518303Eacfa41Ec0af91Df1E02b61f897" },
  43114: { rs: 43114,                             f: "0xe3286f4220ecCeF9747D6e6e329FE5E73B965455" },
};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const out = {};
for (const [cid, t] of Object.entries(TARGETS)) {
  const vesters = [];
  try {
    if (t.bs) {
      let params = "";
      for (let p = 0; p < 50; p++) {
        const res = await fetch(`${t.bs}/api/v2/addresses/${t.f}/logs${params}`);
        const body = await res.json();
        for (const it of body.items ?? []) {
          const t0 = (it.topics ?? [])[0];
          if (t0 === V1_TOPIC && it.data && it.data.length >= 66) {
            vesters.push("0x" + it.data.slice(26, 66).toLowerCase());
          }
        }
        if (!body.next_page_params) break;
        params = "?" + new URLSearchParams(Object.entries(body.next_page_params).map(([k,v])=>[k,String(v)])).toString();
        await sleep(250);
      }
    } else {
      const url = `https://api.routescan.io/v2/network/mainnet/evm/${t.rs}/etherscan/api?module=logs&action=getLogs&address=${t.f}&fromBlock=0&toBlock=latest&page=1&offset=1000`;
      const body = await (await fetch(url)).json();
      for (const it of (Array.isArray(body.result) ? body.result : [])) {
        if (it.topics?.[0] === V1_TOPIC && it.data && it.data.length >= 66) {
          vesters.push("0x" + it.data.slice(26, 66).toLowerCase());
        }
      }
    }
  } catch (e) { console.error(cid, "ERR", e.message); }
  out[cid] = [...new Set(vesters)];
  console.log(`chain ${cid}: ${out[cid].length} v1 vesters`);
  await sleep(300);
}
console.log(JSON.stringify(out, null, 2));
