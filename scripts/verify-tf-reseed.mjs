// scripts/verify-tf-reseed.mjs — run AFTER a Team Finance reseed to confirm it worked.
//   cd ~/vestr && node scripts/verify-tf-reseed.mjs
import dotenv from "dotenv";
import postgres from "postgres";

// This repo's env lives in .env.local (not .env), so load it explicitly —
// dotenv's default only reads .env, which left DATABASE_URL unset and made
// postgres fall back to localhost:5432 (ECONNREFUSED).
dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run this from ~/vestr (it reads .env.local).");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const rows = await sql`
  select stream_data, last_refreshed_at
  from vesting_streams_cache where protocol = 'team-finance'`;

const today = new Date().toISOString().slice(0, 10);
let total = rows.length, badStart = 0, badEnd = 0, refreshedToday = 0;
for (const r of rows) {
  const d = r.stream_data || {};
  const stBad = d.startTime == null || !Number.isFinite(d.startTime) || d.startTime <= 0;
  const enBad = d.endTime   == null || !Number.isFinite(d.endTime)   || d.endTime   <= 0;
  if (stBad) badStart++;
  if (enBad) badEnd++;
  if (r.last_refreshed_at && new Date(r.last_refreshed_at).toISOString().slice(0, 10) === today) refreshedToday++;
}
const pctValid = total ? (100 * (total - Math.max(badStart, badEnd)) / total).toFixed(1) : "0";
console.log(`Team Finance cache: ${total} rows`);
console.log(`  valid start/end : ${pctValid}%   (bad start=${badStart}, bad end=${badEnd})`);
console.log(`  refreshed today : ${refreshedToday} rows (${today})`);
console.log("");
const schedulesOk = total > 0 && badStart === 0 && badEnd === 0;
const seedRan = refreshedToday > 0;
console.log(schedulesOk ? "✅ SCHEDULES OK — new endpoint is producing valid start/end." 
                        : "❌ BROKEN SCHEDULES — some rows have null/0 start or end. New endpoint NOT working.");
console.log(seedRan ? "✅ SEED WROTE — rows were refreshed today (endpoint was reachable + returned data)."
                    : "⚠️  NO ROWS REFRESHED TODAY — either the reseed hasn't run, or data was byte-identical so writeToCache skipped it (unchanged rows keep their old timestamp). Not necessarily a failure; judge by the schedule check + the reseed's own JSON summary.");
await sql.end();
