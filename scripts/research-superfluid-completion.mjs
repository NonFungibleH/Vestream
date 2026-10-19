// Superfluid vesting completion census (research, Oct 2026).
//
// Superfluid's VestingScheduler is PUSH: tokens stay in the sender's wallet
// and an automation must call executeCliffAndFlow within START_DATE_VALID_AFTER
// (3 days) of cliffAndFlowDate. v2/v3 schedules with claimValidityDate != 0 are
// claim-based instead: the sender OR receiver must claim before that date, or
// the schedule can never start (contract reverts with TimeWindowInvalid).
//
// "Finished" = endDate more than 30 days before now (same cut as the main
// unclaimed study). Reads Superfluid's own vesting-scheduler subgraphs.
//
//   node scripts/research-superfluid-completion.mjs

const CHAINS = [
  "eth-mainnet", "base-mainnet", "optimism-mainnet", "polygon-mainnet",
  "arbitrum-one", "bsc-mainnet", "xdai-mainnet", "avalanche-c", "celo-mainnet", "scroll-mainnet",
];
const now = Math.floor(Date.now() / 1000);
const cut = now - 30 * 86400;

async function q(chain, query) {
  const r = await fetch(`https://subgraph-endpoints.superfluid.dev/${chain}/vesting-scheduler`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(`${chain}: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return j.data;
}

const tot = { ncAuto: 0, ncAutoStarted: 0, ncClaim: 0, ncClaimed: 0, ncClaimPast: 0, autoFinished: 0, autoStarted: 0, autoNeverStarted: 0, autoNeverStartedNotDeleted: 0, finished: 0, started: 0, neverStarted: 0, failed: 0, deleted: 0, claimBased: 0, claimed: 0, claimExpired: 0, neverStartedNotDeleted: 0 };
for (const chain of CHAINS) {
  let last = "", rows = [];
  try {
    for (;;) {
      const d = await q(chain, `{ vestingSchedules(first: 1000, where: { endDate_lt: "${cut}", id_gt: "${last}" }, orderBy: id) {
        id endDate cliffAndFlowExecutedAt failedAt deletedAt claimValidityDate claimedAt } }`);
      const page = d.vestingSchedules;
      rows.push(...page);
      if (page.length < 1000) break;
      last = page[page.length - 1].id;
    }
  } catch (e) { console.log(`skip ${e.message}`); continue; }
  const c = { ncAuto: 0, ncAutoStarted: 0, ncClaim: 0, ncClaimed: 0, ncClaimPast: 0, autoFinished: 0, autoStarted: 0, autoNeverStarted: 0, autoNeverStartedNotDeleted: 0, finished: rows.length, started: 0, neverStarted: 0, failed: 0, deleted: 0, claimBased: 0, claimed: 0, claimExpired: 0, neverStartedNotDeleted: 0 };
  for (const s of rows) {
    const started = s.cliffAndFlowExecutedAt != null;
    if (started) c.started++; else c.neverStarted++;
    if (!started && s.deletedAt == null) c.neverStartedNotDeleted++;
    if (s.failedAt != null) c.failed++;
    if (s.deletedAt != null) c.deleted++;
    const cv = Number(s.claimValidityDate ?? 0);
    // Excluding schedules the payer cancelled (deletedAt), which say nothing about the recipient.
    if (s.deletedAt == null) {
      if (cv === 0) { c.ncAuto++; if (started) c.ncAutoStarted++; }
      else { c.ncClaim++; if (s.claimedAt != null) c.ncClaimed++; else if (cv < now) c.ncClaimPast++; }
    }
    if (cv === 0) {
      c.autoFinished++;
      if (started) c.autoStarted++; else { c.autoNeverStarted++; if (s.deletedAt == null) c.autoNeverStartedNotDeleted++; }
    }
    if (cv > 0) {
      c.claimBased++;
      if (s.claimedAt != null) c.claimed++;
      else if (cv < now) c.claimExpired++;
    }
  }
  console.log(chain, JSON.stringify(c));
  for (const k of Object.keys(tot)) tot[k] += c[k];
}
console.log("TOTAL", JSON.stringify(tot));
console.log(`EXCLUDING CANCELLED: automatic ${tot.ncAutoStarted}/${tot.ncAuto} started (${(100*tot.ncAutoStarted/tot.ncAuto).toFixed(1)}%); claim-based ${tot.ncClaim - tot.ncClaimed}/${tot.ncClaim} never claimed (${(100*(tot.ncClaim-tot.ncClaimed)/tot.ncClaim).toFixed(1)}%), ${tot.ncClaimPast} past deadline`);
console.log(`AUTOMATIC (push): ${tot.autoFinished} finished, ${tot.autoStarted} started (${(100*tot.autoStarted/tot.autoFinished).toFixed(1)}%), ${tot.autoNeverStarted} never started, of which ${tot.autoNeverStartedNotDeleted} were not cancelled`);
console.log(`ALL: started ${(100 * tot.started / tot.finished).toFixed(1)}% | never started (not cancelled) ${tot.neverStartedNotDeleted} | claim-based unclaimed ${tot.claimBased - tot.claimed} of ${tot.claimBased} (${tot.claimExpired} past their claim deadline)`);
