import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const r = await sql`select chain_id, count(*)::int n, count(distinct recipient)::int wallets, count(distinct token_address)::int tokens from vesting_streams_cache where protocol='magna' group by chain_id order by n desc`;
  for (const x of r) console.log(`chain ${x.chain_id}: ${x.n} streams, ${x.wallets} wallets, ${x.tokens} tokens`);
  if (!r.length) console.log("none");
} finally { await sql.end(); }
