// Holder distribution + vesting-span panel for the token detail page.
//
// "Who holds the locked supply, and over what timeframe" — the core
// informed-decision signal. A fair launch (many wallets, no dominant holder,
// long linear vest) reads very differently from 3 wallets holding 95% behind
// a near-term cliff. Renders concentration headline stats, a plain-language
// verdict, the whole-token vesting span, and a ranked bar list of the largest
// recipients (each links to its wallet view).
//
// Server component — purely presentational, no interactivity. Data is computed
// once on the page (computeDistribution) from streams already loaded.

import Link from "next/link";

export interface HolderRow {
  recipient:   string;
  lockedWhole: number;
  usd:         number | null;
  share:       number;   // 0–1 of total locked
}

const fmtNum = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K`
  : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtUsd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K`
  : `$${n.toFixed(2)}`;
const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const pct = (s: number) => (s > 0 && s < 0.01 ? "<1%" : `${Math.round(s * 100)}%`);
const fmtDate = (t: number | null) =>
  t ? new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";

function fmtSpan(firstStart: number | null, lastEnd: number | null): string {
  if (firstStart == null || lastEnd == null || lastEnd <= firstStart) return "—";
  const days = (lastEnd - firstStart) / 86_400;
  if (days >= 730) {
    const years = days / 365.25;
    const r = Math.round(years);
    return Math.abs(years - r) < 0.08 ? `${r} yr` : `${years.toFixed(1)} yr`;
  }
  const months = Math.round(days / 30.44);
  if (months >= 1) return `${months} mo`;
  return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
}

// Plain-language read on concentration — the one-line takeaway.
function verdict(top1: number, top5: number, totalHolders: number): { text: string; tone: "bad" | "warn" | "ok" } {
  if (top1 >= 0.5) return { text: "Highly concentrated — a single wallet holds the majority of locked supply.", tone: "bad" };
  if (top5 >= 0.8) return { text: "Concentrated — the top 5 wallets hold most of the locked supply.", tone: "warn" };
  if (totalHolders >= 25 && top10Below(top5)) return { text: `Well distributed across ${totalHolders.toLocaleString()} wallets — no dominant holder.`, tone: "ok" };
  return { text: `Moderately distributed across ${totalHolders.toLocaleString()} wallet${totalHolders === 1 ? "" : "s"}.`, tone: "warn" };
}
// Small helper so the "well distributed" branch reads cleanly above.
function top10Below(top5: number): boolean { return top5 < 0.6; }

export function HolderDistribution({
  holders, totalHolders, top1, top5, symbol,
  firstStart, lastEnd, spanPct, isFree, rowCap,
}: {
  holders:     HolderRow[];
  totalHolders: number;
  top1:        number;
  top5:        number;
  symbol:      string;
  firstStart:  number | null;
  lastEnd:     number | null;
  spanPct:     number | null;
  isFree:      boolean;
  rowCap:      number;
}) {
  if (holders.length === 0) return null;
  const v = verdict(top1, top5, totalHolders);
  const toneColor = v.tone === "bad" ? "#dc2626" : v.tone === "warn" ? "#d97706" : "#0F8A8A";
  const shown  = isFree ? holders.slice(0, Math.min(rowCap, 10)) : holders.slice(0, 25);
  const hidden = holders.length - shown.length;
  // Bars are scaled to the largest holder (not to 100%) so the distribution
  // SHAPE is visible even when the top wallet is only a few % of supply.
  const maxShare = holders[0]?.share || 1;

  return (
    <div className="rounded-2xl border p-4 md:p-5 mb-5" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
          Holder distribution <span className="font-normal" style={{ color: "var(--preview-text-3)" }}>— who holds the locked supply</span>
        </h2>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Stat label="Top holder" value={pct(top1)} tone={top1 >= 0.5 ? "bad" : top1 >= 0.25 ? "warn" : undefined} />
        <Stat label="Top 5 wallets" value={pct(top5)} tone={top5 >= 0.8 ? "bad" : top5 >= 0.5 ? "warn" : undefined} />
        <Stat label="Recipients" value={totalHolders.toLocaleString()} />
        <Stat
          label="Vesting span"
          value={fmtSpan(firstStart, lastEnd)}
          sub={spanPct != null ? `${Math.round(spanPct * 100)}% elapsed` : undefined}
        />
      </div>

      {/* Verdict */}
      <p className="text-xs mb-1" style={{ color: toneColor }}>
        {v.tone === "ok" ? "✓ " : "● "}{v.text}
      </p>
      {firstStart != null && lastEnd != null && (
        <p className="text-[11px] mb-3" style={{ color: "var(--preview-text-3)" }}>
          Vests {fmtDate(firstStart)} → {fmtDate(lastEnd)}
        </p>
      )}

      {/* Ranked holder bars */}
      <div className="flex flex-col gap-1.5">
        {shown.map((h, i) => (
          <Link
            key={h.recipient}
            href={`/dashboard/explorer?mode=wallet&q=${encodeURIComponent(h.recipient)}`}
            className="group flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--preview-muted)]"
          >
            <span className="text-[11px] tabular-nums w-5 flex-shrink-0 text-right" style={{ color: "var(--preview-text-3)" }}>{i + 1}</span>
            <span className="text-xs font-mono w-28 flex-shrink-0 truncate group-hover:underline" style={{ color: "#0F8A8A" }}>
              {shortAddr(h.recipient)}
            </span>
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--preview-muted-2)" }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.max(2, (h.share / maxShare) * 100)}%`,
                background: h.share >= 0.5 ? "#dc2626" : h.share >= 0.25 ? "#d97706" : "#0F8A8A",
              }} />
            </div>
            <span className="text-[11px] tabular-nums w-12 flex-shrink-0 text-right font-semibold" style={{ color: "var(--preview-text-2)" }}>
              {pct(h.share)}
            </span>
            <span className="text-[11px] tabular-nums w-24 flex-shrink-0 text-right hidden sm:block" style={{ color: "var(--preview-text-3)" }}>
              {fmtNum(h.lockedWhole)} {symbol}
            </span>
            <span className="text-[11px] tabular-nums w-16 flex-shrink-0 text-right hidden md:block" style={{ color: "var(--preview-text-3)" }}>
              {h.usd != null ? fmtUsd(h.usd) : ""}
            </span>
          </Link>
        ))}
      </div>

      {hidden > 0 && (
        <p className="text-[11px] mt-2.5 pt-2.5 border-t" style={{ borderColor: "var(--preview-border-2)", color: "var(--preview-text-3)" }}>
          {isFree ? (
            <>+{hidden} more wallet{hidden !== 1 ? "s" : ""} — <Link href="/pricing" className="underline" style={{ color: "#1CB8B8" }}>upgrade to Pro</Link> to see the full distribution.</>
          ) : (
            <>Showing the top 25 of {holders.length.toLocaleString()} recipients by locked amount.</>
          )}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "#dc2626" : tone === "warn" ? "#d97706" : "var(--preview-text)";
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>{sub}</p>}
    </div>
  );
}
