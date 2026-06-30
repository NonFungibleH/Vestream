import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const c = await sql`SELECT chain_id, count(*) rows FROM vesting_streams_cache WHERE protocol='team-finance' GROUP BY chain_id ORDER BY chain_id`;
console.log("team-finance cache by chain:", c.length ? JSON.stringify(c.map(r=>({c:r.chain_id,n:Number(r.rows)}))) : "(still 0)");
await sql.end();
