import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const r = await sql`select * from protocol_summaries where protocol='magna'`;
  if (!r.length) { console.log("no magna row yet"); }
  else { const x=r[0]; console.log(JSON.stringify({streams:x.total_streams,active:x.active_streams,recipients:x.recipient_count,tokens:x.tokens_tracked,unclaimed:x.unclaimed_streams,updated:x.computed_at||x.updated_at}, null, 1)); }
} finally { await sql.end(); }
