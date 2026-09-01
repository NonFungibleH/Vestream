import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
async function main() {
  const r: any = await db.execute(sql`
    select protocol, chain_id, tvl_usd, tvl_low, tokens_total, stream_count, methodology,
           round(extract(epoch from (now() - computed_at))/3600) as hrs
    from protocol_tvl_snapshots
    where protocol in ('sablier','sablier-flow')
    order by tvl_usd desc`);
  console.log("proto          chain      tvlUsd            tvlLow         tokens streams  age  methodology");
  for (const x of (r.rows ?? r)) {
    console.log(
      `${String(x.protocol).padEnd(14)} ${String(x.chain_id).padEnd(9)} ` +
      `${Number(x.tvl_usd).toLocaleString("en-US",{maximumFractionDigits:0}).padStart(15)} ` +
      `${Number(x.tvl_low??0).toLocaleString("en-US",{maximumFractionDigits:0}).padStart(14)} ` +
      `${String(x.tokens_total??"-").padStart(6)} ${String(x.stream_count??"-").padStart(7)} ` +
      `${String(x.hrs).padStart(4)}h  ${x.methodology}`);
  }
}
main().then(()=>process.exit(0), e=>{console.error(e);process.exit(1);});
