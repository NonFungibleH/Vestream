import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
async function main() {
  const r: any = await db.execute(sql`
    select adapter_id, chain_id, last_streams_written, last_error,
           round(extract(epoch from (now() - last_attempt_at))/60) as mins
    from seeder_state where adapter_id = 'team-finance'
    order by chain_id`);
  for (const x of (r.rows ?? r)) {
    const m = Number(x.mins);
    const age = m < 120 ? `${m}m` : `${(m/1440).toFixed(1)}d`;
    console.log(`team-finance chain ${String(x.chain_id).padEnd(9)} ${age.padStart(7)} ago  wrote=${String(x.last_streams_written ?? "-").padEnd(5)} err=${x.last_error ?? "ok"}`);
  }
}
main().then(() => process.exit(0));
