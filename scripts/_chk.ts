import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
async function main() {
  const r: any = await db.execute(sql`
    select chain_id, tvl_usd, tokens_total, stream_count, methodology,
           round(extract(epoch from (now() - computed_at))/60) as mins
    from protocol_tvl_snapshots where protocol='sablier' order by tvl_usd desc`);
  let tot = 0;
  for (const x of (r.rows ?? r)) {
    tot += Number(x.tvl_usd);
    console.log(`chain ${String(x.chain_id).padEnd(7)} $${(Number(x.tvl_usd)/1e6).toFixed(1).padStart(8)}M  tokens=${String(x.tokens_total??"-").padStart(4)} streams=${String(x.stream_count??"-").padStart(7)} ${String(x.mins).padStart(4)}m  ${x.methodology}`);
  }
  console.log(`TOTAL = $${(tot/1e6).toFixed(1)}M`);
}
main().then(()=>process.exit(0), e=>{console.error(e);process.exit(1);});
