import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try { const r = await sql`select chain_id, count(*)::int as n from magna_vesters group by chain_id order by chain_id`;
  for (const x of r) console.log('chain', x.chain_id, '→', x.n, 'vesters');
  if (!r.length) console.log('EMPTY');
} finally { await sql.end(); }
