// One-off recon for the Magna integration: enumerate every vesting contract
// ("vester") each Magna Airlock factory has deployed, per chain, via free
// explorer APIs (Blockscout v2 / Routescan etherscan-compat). Outputs a JSON
// seed file consumed by tvl-walker/magna.ts so the daily walker only needs a
// recent-window log scan on free RPCs. Also verifies the V1 factory's event
// signature (topic0 histogram) since V1 is unverified on some explorers.
//
// Usage: node scripts/_magna-recon.mjs
import { writeFileSync } from "fs";

const MERKLE_CREATED = "0xb19be3f669df1f0238815b36efeeda9af7b6921ac4a36ae4e9bea6f03aa52754";

// chainId -> { name, factories: {label -> address}, explorer }
const CHAINS = {
  1:     { name: "ethereum",  bs: "https://eth.blockscout.com",      factories: { v21: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", v1: "0x47546C3A473aa5150F8de23561fFE4e0ceb367a7" } },
  8453:  { name: "base",      bs: "https://base.blockscout.com",     factories: { v21: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", v1: "0x0F15a081b6f28f3863EE0206EA512C011A24b37C" } },
  10:    { name: "optimism",  bs: "https://optimism.blockscout.com", factories: { v21: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", v1: "0x87c4FbeB13Bfa441Ce561670020C85bf93625428" } },
  137:   { name: "polygon",   bs: "https://polygon.blockscout.com",  factories: { v21: "0x052d4671F4AE15E6215fb7135d8c2e3E587b0920", v1: "0xC6cC1A91082471dB3D15202cf40CfC953d8CA966" } },
  42161: { name: "arbitrum",  bs: "https://arbitrum.blockscout.com", factories: { v21: "0x76Abb45629189E3227E7b544a1949207a7d24dd5", v1: "0xbD69143518303Eacfa41Ec0af91Df1E02b61f897" } },
  43114: { name: "avalanche", rs: 43114,                             factories: { v21: "0x11A7e1f79A5c7AE62c09Ec8CA0326ade8Ba7A5E9", v1: "0xe3286f4220ecCeF9747D6e6e329FE5E73B965455" } },
  56:    { name: "bsc",       rs: 56,                                factories: { v21: "0xaD1b1887CA414cAcF7F19288FE234c3f738dFEA2", v1: "0x7fE21700152CB26065B79dfeDd03173e0238E568" } },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function blockscoutLogs(base, address) {
  // Paginated /api/v2/addresses/{addr}/logs — 50/page, next_page_params cursor.
  const out = [];
  let params = "";
  for (let page = 0; page < 200; page++) {
    const res = await fetch(`${base}/api/v2/addresses/${address}/logs${params}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`${base} HTTP ${res.status}`);
    const body = await res.json();
    for (const it of body.items ?? []) {
      out.push({ topics: (it.topics ?? []).filter(Boolean), block: it.block_number, data: it.data });
    }
    const np = body.next_page_params;
    if (!np) break;
    params = "?" + new URLSearchParams(Object.entries(np).map(([k, v]) => [k, String(v)])).toString();
    await sleep(250);
  }
  return out;
}

async function routescanLogs(chainId, address) {
  // Etherscan-compatible, keyless. Paginate via page param (1000/page cap).
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const url = `https://api.routescan.io/v2/network/mainnet/evm/${chainId}/etherscan/api?module=logs&action=getLogs&address=${address}&fromBlock=0&toBlock=latest&page=${page}&offset=1000`;
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`routescan HTTP ${res.status}`);
    const body = await res.json();
    const items = Array.isArray(body.result) ? body.result : [];
    for (const it of items) {
      out.push({ topics: (it.topics ?? []).filter(Boolean), block: parseInt(it.blockNumber, 16), data: it.data });
    }
    if (items.length < 1000) break;
    await sleep(300);
  }
  return out;
}

const summary = {};
for (const [chainId, cfg] of Object.entries(CHAINS)) {
  summary[chainId] = { name: cfg.name, factories: {} };
  for (const [label, factory] of Object.entries(cfg.factories)) {
    process.stderr.write(`\n=== ${cfg.name} ${label} ${factory} ===\n`);
    try {
      const logs = cfg.bs ? await blockscoutLogs(cfg.bs, factory) : await routescanLogs(cfg.rs, factory);
      const topicHist = {};
      const vesters = [];
      let minB = Infinity, maxB = 0;
      for (const l of logs) {
        const t0 = l.topics[0];
        topicHist[t0] = (topicHist[t0] ?? 0) + 1;
        if (t0 === MERKLE_CREATED && l.topics[2]) {
          vesters.push("0x" + l.topics[2].slice(26).toLowerCase());
        }
        if (l.block < minB) minB = l.block;
        if (l.block > maxB) maxB = l.block;
      }
      summary[chainId].factories[label] = {
        factory, totalLogs: logs.length, topicHist,
        vesters: [...new Set(vesters)],
        firstBlock: logs.length ? minB : null, lastBlock: logs.length ? maxB : null,
      };
      process.stderr.write(`  logs=${logs.length} vesters=${new Set(vesters).size} blocks=${minB}..${maxB}\n`);
      process.stderr.write(`  topics=${JSON.stringify(topicHist)}\n`);
    } catch (err) {
      summary[chainId].factories[label] = { factory, error: String(err.message ?? err) };
      process.stderr.write(`  ERROR: ${err.message ?? err}\n`);
    }
    await sleep(400);
  }
}
writeFileSync("/tmp/magna-recon.json", JSON.stringify(summary, null, 2));
process.stderr.write("\nWritten /tmp/magna-recon.json\n");
