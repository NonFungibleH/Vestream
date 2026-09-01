import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const rows = await sql`select chain_id, tvl_usd::float8 as tvl, tvl_low::float8 as low, stream_count, tokens_priced, tokens_total, methodology, computed_at, last_error from protocol_tvl_snapshots where protocol='magna' order by tvl desc nulls last`;
  if (!rows.length) { console.log("NOROWS"); }
  for (const r of rows) console.log(`chain ${String(r.chain_id).padEnd(6)} tvl=$${Number(r.tvl||0).toLocaleString()} low=$${Number(r.low||0).toLocaleString()} streams=${r.stream_count} priced=${r.tokens_priced}/${r.tokens_total} err=${r.last_error ?? 'ok'}`);
} finally { await sql.end(); }
