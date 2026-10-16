// CSV of the unclaimed-vesting study, generated from the same data as the page
// (lib/unclaimed-research.ts) so the download can never disagree with it.
import { UNCLAIMED_SUMMARY } from "@/lib/unclaimed-research";

export const dynamic = "force-static";

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function GET() {
  const header = [
    "protocol", "chains", "method", "finished_measured", "finished_estimated", "scope",
    "unclaimed_pct", "unclaimed_pct_ci_low", "unclaimed_pct_ci_high",
    "unclaimed_pct_adjusted", "adjustment_note", "never_claimed_pct_of_unclaimed",
    "unclaimed_value_usd_low", "unclaimed_value_usd_high", "value_note", "measured",
  ];
  const lines = UNCLAIMED_SUMMARY.map((r) => [
    r.protocol, r.chains, r.method, r.finished, r.finishedEst ?? "", r.scope,
    r.unclaimedPct, r.ci?.[0] ?? "", r.ci?.[1] ?? "",
    r.unclaimedPctAdj?.pct ?? "", r.unclaimedPctAdj?.note ?? "", r.neverTouchedPct,
    r.valueUsd?.low ?? "", r.valueUsd?.high ?? "", r.valueUsd?.note ?? "", r.measured,
  ].map(esc).join(","));
  const body = [
    "# Unclaimed token vesting, October 2026. Pearce, H. / Vestream. CC BY 4.0. https://www.vestream.io/research/unclaimed-vesting",
    header.join(","), ...lines,
  ].join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="unclaimed-vesting-2026-10.csv"',
    },
  });
}
