// Load backfilled vester addresses into magna_vesters.
// Usage: node scripts/_magna-load-vesters.mjs <chainId> <json-file>
import { config } from "dotenv"; import postgres from "postgres"; import { readFileSync } from "fs";
config({ path: ".env.local" });
const chainId = Number(process.argv[2]);
const file = process.argv[3];
if (!chainId || !file) { console.error("usage: <chainId> <json-file>"); process.exit(1); }
let list;
try { list = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error("cannot parse", file, e.message); process.exit(1); }
if (!Array.isArray(list) || list.length === 0) { console.log("nothing to load"); process.exit(0); }
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const rows = list.map((a) => ({ chain_id: chainId, address: String(a).toLowerCase(), factory_version: "backfill", discovered_block: 0 }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    const r = await sql`insert into magna_vesters ${sql(slice, 'chain_id','address','factory_version','discovered_block')} on conflict do nothing`;
    inserted += r.count ?? 0;
  }
  const total = await sql`select count(*)::int as n from magna_vesters where chain_id = ${chainId}`;
  console.log(`chain ${chainId}: +${inserted} new (registry now ${total[0].n})`);
} finally { await sql.end(); }
