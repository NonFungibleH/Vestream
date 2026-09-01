// Base-only backfill (blockscout recovered after the initial recon).
const MERKLE_V21 = "0xb19be3f669df1f0238815b36efeeda9af7b6921ac4a36ae4e9bea6f03aa52754";
const V1_TOPIC   = "0x13c091a474cc422eb5bbc53fbf66ccd93e043d23b03db1bad730ea303fa32276";
const FACTORIES = [
  ["v21", "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920"],
  ["v1",  "0x0F15a081b6f28f3863EE0206EA512C011A24b37C"],
];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const vesters = new Set();
for (const [label, f] of FACTORIES) {
  let params = "", total = 0;
  for (let p = 0; p < 100; p++) {
    const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${f}/logs${params}`, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0", accept: "application/json" } });
    if (!res.ok) { console.error(label, "HTTP", res.status, "page", p); break; }
    const body = await res.json();
    for (const it of body.items ?? []) {
      total++;
      const t0 = (it.topics ?? [])[0];
      if (t0 === MERKLE_V21 && it.topics[2]) vesters.add("0x" + it.topics[2].slice(26).toLowerCase());
      else if (t0 === V1_TOPIC && it.data?.length >= 66) vesters.add("0x" + it.data.slice(26, 66).toLowerCase());
    }
    if (!body.next_page_params) break;
    params = "?" + new URLSearchParams(Object.entries(body.next_page_params).map(([k,v])=>[k,String(v)])).toString();
    await sleep(250);
  }
  console.error(`${label}: scanned ${total} logs so far, cumulative vesters=${vesters.size}`);
}
console.log(JSON.stringify([...vesters].sort(), null, 2));
