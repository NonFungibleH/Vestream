import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const t = await sql`select count(*)::int n, count(distinct recipient)::int wallets, count(distinct case when token_address like '0x%' then lower(token_address) else token_address end)::int tokens, count(*) filter (where is_fully_vested = false)::int active from vesting_streams_cache where protocol='magna'`;
  console.log(`TOTAL: ${t[0].n} streams | ${t[0].wallets} wallets | ${t[0].tokens} tokens | ${t[0].active} still vesting`);
  const top = await sql`select token_symbol, count(*)::int n, count(distinct recipient)::int w from vesting_streams_cache where protocol='magna' group by token_symbol order by n desc limit 8`;
  for (const r of top) console.log(`  ${(r.token_symbol||'?').padEnd(10)} ${String(r.n).padStart(5)} streams  ${r.w} wallets`);
} finally { await sql.end(); }
