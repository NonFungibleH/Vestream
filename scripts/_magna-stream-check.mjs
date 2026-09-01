import { config } from "dotenv"; import postgres from "postgres";
config({ path: ".env.local" });
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  const rows = await sql`select stream_id, recipient, token_symbol, token_address, is_fully_vested, end_time, stream_data from vesting_streams_cache where protocol='magna' order by last_refreshed_at desc limit 3`;
  console.log('magna streams in cache:', rows.length);
  for (const r of rows) {
    const d = typeof r.stream_data === 'string' ? JSON.parse(r.stream_data) : r.stream_data;
    const dec = d.tokenDecimals ?? 18;
    const fmt = (v) => (Number(BigInt(v || 0) / 10n**BigInt(Math.max(0,dec-4))) / 1e4).toLocaleString();
    console.log(`\n  ${r.stream_id}`);
    console.log(`  recipient: ${r.recipient}`);
    console.log(`  token: ${r.token_symbol} decimals=${dec}`);
    console.log(`  total=${fmt(d.totalAmount)}  withdrawn=${fmt(d.withdrawnAmount)}  claimable=${fmt(d.claimableNow)}  locked=${fmt(d.lockedAmount)}`);
    console.log(`  start=${d.startTime?new Date(d.startTime*1000).toISOString().slice(0,10):'-'} end=${d.endTime?new Date(d.endTime*1000).toISOString().slice(0,10):'-'} next=${d.nextUnlockTime?new Date(d.nextUnlockTime*1000).toISOString().slice(0,10):'—'}`);
    console.log(`  shape=${d.shape} steps=${(d.unlockSteps||[]).length} fullyVested=${r.is_fully_vested} cancelable=${d.cancelable}`);
    if ((d.unlockSteps||[]).length) {
      const s=d.unlockSteps;
      console.log(`  first step: ${new Date(s[0].timestamp*1000).toISOString().slice(0,10)} amt=${fmt(s[0].amount)}`);
      console.log(`  last step:  ${new Date(s[s.length-1].timestamp*1000).toISOString().slice(0,10)} amt=${fmt(s[s.length-1].amount)}`);
    }
  }
} finally { await sql.end(); }
