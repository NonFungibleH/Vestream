"use client";

// src/app/dashboard/explorer/ExplorerTable.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Results table for the Vesting Explorer (calendar mode), now SERVER-PAGINATED.
//
// The server reads ONE page (25 tokens) straight off the cron-maintained
// rollup, ordered + filtered in SQL, plus the true total. So this component
// just renders the current page: column headers are sort LINKS (clicking
// re-queries with ?sort=&dir= and resets to page 1), and a footer paginates
// with ?page=. This replaced the old "load the soonest ~923 and sort in the
// browser" approach, which both capped browsing at ~1/5 of tokens and made
// every render re-aggregate/price the whole pool. Sorting across pages can
// only be correct server-side, hence the move.
//
// Columns (the narrow ones auto-hide below md):
//   Token · Amount · USD · Wallets · Top holder · Rounds · Cliff · Risk · Vested · Next
// Mobile collapses to Token · USD · Wallets.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getProtocol } from "@/lib/protocol-constants";
import { WatchButton } from "./WatchButton";

export interface ExplorerRow {
  groupKey:          string;
  protocol:          string;
  protocolCount?:    number;          // distinct protocols vesting this token (≥2 → "N protocols")
  chainId:           number;
  tokenSymbol:       string | null;
  tokenAddress:      string;
  tokenDecimals:     number;
  amount:            string | null;   // stringified bigint (locked)
  usdValue:          number | null;
  usdConfidence:     "high" | "medium" | "low" | null;
  walletCount:       number;          // per-bucket fallback
  tokenWalletCount?: number;          // true uncapped count
  tokenRoundCount?:  number;
  vestStart?:        number | null;   // earliest active start (unix sec) — progress bar
  vestEnd?:          number | null;   // latest active end (unix sec)
  hasCliff?:         boolean;         // any active stream has a lump-unlock cliff (own column)
  topHolderShare?:   number | null;   // largest recipient's share (0–1) of locked — concentration
  unlockCurve?:      number[] | null; // 12 cumulative-% samples → row sparkline
  eventTime:         number;
  absorptionRatio:   number | null;
  marketCapShare:    number | null;   // unlock value ÷ market cap — the risk basis
}

type SortCol = "token" | "amount" | "usd" | "wallets" | "concentration" | "rounds" | "cliff" | "risk" | "progress" | "date";
type SortDir = "asc" | "desc";

// ── Sort accessors ───────────────────────────────────────────────────────────
function walletsOf(r: ExplorerRow): number { return r.tokenWalletCount ?? r.walletCount; }
/** Fraction (0–1) of the token's whole vesting span that has elapsed, or null
 *  if we lack a valid start/end span. Clamped so pre-start = 0, past-end = 1. */
function progressOf(r: ExplorerRow): number | null {
  const s = r.vestStart, e = r.vestEnd;
  if (s == null || e == null || e <= s) return null;
  const now = Date.now() / 1000;
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}
export function ExplorerTable({
  rows, totalMatches, page, totalPages, pageSize, sort, dir, params,
}: {
  rows:         ExplorerRow[];
  totalMatches: number;
  page:         number;
  totalPages:   number;
  pageSize:     number;
  sort:         SortCol;
  dir:          SortDir;
  /** Current URL search params, so headers + pagination can build hrefs. */
  params:       Record<string, string | undefined>;
}) {
  // Build a URL preserving current params, with overrides (undefined clears).
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const usp = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") usp.set(k, v);
    const qs = usp.toString();
    return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
  };
  // Header link: set sort col + direction, reset to page 1. Clicking the
  // active column flips direction.
  const sortHref = (col: SortCol, defaultDir: SortDir): string => {
    const nextDir = col === sort ? (dir === "asc" ? "desc" : "asc") : defaultDir;
    return hrefFor({ sort: col, dir: nextDir, page: undefined });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>No tokens match these filters.</p>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--preview-text-3)" }}>
          Your filters are too tight — widen a slider, set the date to “Any time”, or clear everything.
        </p>
        <Link href="/dashboard/explorer" scroll={false}
          className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: "#0F8A8A", color: "white" }}>
          Clear all filters
        </Link>
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to   = (page - 1) * pageSize + rows.length;

  // Shared grid template: mobile = Token · USD · Wallets (3); desktop adds
  // Amount, Rounds, Risk, Next (7). Desktop-only cells use `hidden md:flex`,
  // so on mobile they're removed from the grid and the 3 visible cells fill
  // the 3-column template.
  // Proportional `fr` columns (NOT auto): the template is deterministic, so
  // the header grid and every row grid resolve to identical column widths and
  // line up — `auto` sized each grid to its own content, which is why headers
  // and values drifted. `fr` units also fill the width evenly instead of one
  // 1fr token column hogging all the slack (the empty space). Mobile shows
  // Token · USD · Wallets; the desktop-only cells are display:none below md so
  // they drop out of the 3-col mobile grid.
  const GRID = "grid grid-cols-[1.7fr_1fr_1fr] md:grid-cols-[1.7fr_0.8fr_0.8fr_0.6fr_0.75fr_0.5fr_0.5fr_0.5fr_1.05fr_0.85fr] items-center gap-3 px-4 md:px-5";

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches.toLocaleString()} token{totalMatches === 1 ? "" : "s"}
        </p>
        {totalPages > 1 && (
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Page {page} of {totalPages.toLocaleString()}</p>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {/* Sortable header — each is a Link that re-queries server-side. */}
        <div className="flex items-center" style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
          <div className={`flex-1 ${GRID} py-2`}>
            <Th label="Token"       active={sort === "token"}         dir={dir} href={sortHref("token", "asc")} title={TOKEN_HELP} />
            <Th label="Amount"      active={sort === "amount"}        dir={dir} href={sortHref("amount", "desc")} align="right" className="hidden md:flex" title={AMOUNT_HELP} />
            <Th label="USD"         active={sort === "usd"}           dir={dir} href={sortHref("usd", "desc")} align="right" minW={64} title={USD_HELP} />
            <Th label="Wallets"     active={sort === "wallets"}       dir={dir} href={sortHref("wallets", "desc")} align="right" minW={56} title={WALLETS_HELP} />
            <Th label="Top holder"  active={sort === "concentration"} dir={dir} href={sortHref("concentration", "desc")} align="right" className="hidden md:flex" minW={64} title={CONCENTRATION_HELP} />
            <Th label="Rounds"      active={sort === "rounds"}        dir={dir} href={sortHref("rounds", "desc")} align="right" className="hidden md:flex" title={ROUNDS_HELP} />
            <Th label="Cliff"       active={sort === "cliff"}         dir={dir} href={sortHref("cliff", "desc")} className="hidden md:flex" title={CLIFF_HELP} />
            <Th label="Risk"        active={sort === "risk"}          dir={dir} href={sortHref("risk", "desc")} align="right" className="hidden md:flex" minW={48} title={RISK_METHODOLOGY} />
            <Th label="Vested"      active={sort === "progress"}      dir={dir} href={sortHref("progress", "desc")} className="hidden md:flex" title={PROGRESS_HELP} />
            <Th label="Next unlock" active={sort === "date"}          dir={dir} href={sortHref("date", "asc")} align="right" className="hidden md:flex" title={NEXT_HELP} />
          </div>
          <div className="pr-3 pl-1"><div style={{ width: 26 }} aria-hidden /></div>
        </div>

        {/* Rows — already ordered + paginated server-side. */}
        {rows.map((r, i) => (
          <Row key={r.groupKey} r={r} grid={GRID} showTopBorder={i > 0} />
        ))}
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of {totalMatches.toLocaleString()}
          </p>
          <div className="flex items-center gap-1.5">
            <PageLink href={page > 1 ? hrefFor({ page: page - 1 <= 1 ? undefined : String(page - 1) }) : null}>‹ Prev</PageLink>
            <PageLink href={page < totalPages ? hrefFor({ page: String(page + 1) }) : null}>Next ›</PageLink>
          </div>
        </div>
      )}
    </>
  );
}

// ── Header cell (sort link) ───────────────────────────────────────────────────
function Th({
  label, active, dir, href, align = "left", minW, className = "", title,
}: {
  label: string; active: boolean; dir: SortDir; href: string;
  align?: "left" | "right"; minW?: number; className?: string; title?: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""} ${className}`}
      style={{ minWidth: minW }}
      aria-label={`Sort by ${label}`}
      title={title}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
        style={{ color: active ? "#0F8A8A" : "var(--preview-text-3)" }}>
        {label}
      </span>
      <span className="text-[8px]" style={{ color: active ? "#0F8A8A" : "transparent" }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </Link>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────
function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  const base = "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors";
  if (!href) {
    return <span className={base} style={{ color: "var(--preview-text-3)", borderColor: "var(--preview-border)", opacity: 0.5 }}>{children}</span>;
  }
  return (
    <Link href={href} scroll={false} className={`${base} hover:bg-[var(--preview-muted)]`}
      style={{ color: "var(--preview-text-2)", borderColor: "var(--preview-border)" }}>
      {children}
    </Link>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
// Hover preview — a compact summary of the row's key facts (native title, so
// it works everywhere without extra JS). The top-holder ADDRESS isn't in the
// rollup, so we surface the metrics we have; the full breakdown is one click.
function rowPreview(r: ExplorerRow, chainName: string): string {
  const sym = r.tokenSymbol ?? shortAddr(r.tokenAddress);
  const when = r.eventTime ? new Date(r.eventTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  const lines = [
    `${sym} · ${getProtocol(r.protocol)?.name ?? r.protocol} · ${chainName}`,
    `Next unlock: ${when} (in ${relativeUntil(r.eventTime)})`,
    r.usdValue != null
      ? `Locked: ${formatUsdCompact(r.usdValue)} (${fmtAmount(r.amount, r.tokenDecimals)} ${sym})`
      : `Locked: ${fmtAmount(r.amount, r.tokenDecimals)} ${sym} — no market price`,
    `Wallets: ${walletsOf(r).toLocaleString()} · Schedules: ${r.tokenRoundCount ?? "—"}`,
  ];
  if (r.topHolderShare != null) lines.push(`Top holder: ${Math.round(r.topHolderShare * 100)}% of locked`);
  const p = progressOf(r);
  if (p != null) lines.push(`Vested: ${Math.round(p * 100)}%`);
  if (r.hasCliff) lines.push("⚠ Has a cliff (lump) unlock");
  lines.push("Click to open the full breakdown →");
  return lines.join("\n");
}

function Row({ r, grid, showTopBorder }: { r: ExplorerRow; grid: string; showTopBorder: boolean }) {
  const meta      = getProtocol(r.protocol);
  const accent    = meta?.color ?? "#64748b";
  const chainName = CHAIN_NAMES[r.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${r.chainId}`;

  return (
    <div className="flex items-center" style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <Link href={`/dashboard/explorer/token/${r.chainId}/${r.tokenAddress}`}
        title={rowPreview(r, chainName)}
        className={`flex-1 ${grid} py-3 transition-colors hover:bg-[var(--preview-muted)]`}>
        {/* Token */}
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0" style={{ background: accent }}>
            {tokenInitial(r.tokenSymbol, r.tokenAddress)}
          </div>
          <div className="min-w-0">
            {/* Token name — the cliff flag moved to its own column so the name
                stays clean (the ⚠️ read as a scary catch-all risk marker). */}
            <p className="font-semibold text-sm truncate" style={{ color: "var(--preview-text)" }}>
              {r.tokenSymbol ?? shortAddr(r.tokenAddress)}
            </p>
            <p className="text-xs truncate" style={{ color: "var(--preview-text-3)" }}>
              <span style={{ color: accent }}>
                {r.protocolCount && r.protocolCount > 1 ? `${r.protocolCount} protocols` : (meta?.name ?? r.protocol)}
              </span> · {chainName}
            </p>
          </div>
        </div>
        {/* Amount (desktop) */}
        <div className="text-right tabular-nums hidden md:block">
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{fmtAmount(r.amount, r.tokenDecimals)}</p>
        </div>
        {/* USD */}
        <div className="text-right tabular-nums" style={{ minWidth: 64 }}>
          {r.usdValue != null ? (
            <p className="text-sm font-bold"
              style={{
                color: "var(--preview-text)",
                fontStyle: r.usdConfidence === "low" ? "italic" : "normal",
                opacity:   r.usdConfidence === "low" ? 0.65 : r.usdConfidence === "medium" ? 0.8 : 1,
              }}
              title={r.usdConfidence === "low" ? "Low liquidity — estimate" : r.usdConfidence === "medium" ? "Medium liquidity — DEX pool < $10k" : undefined}>
              {formatUsdCompact(r.usdValue)}
            </p>
          ) : (
            <p className="text-sm font-bold cursor-help" style={{ color: "var(--preview-text-3)" }}
              title="No liquid market — this token has no tradeable DEX pair, so there's no price to show.">—</p>
          )}
        </div>
        {/* Wallets */}
        <div className="text-right tabular-nums" style={{ minWidth: 56 }}>
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{walletsOf(r).toLocaleString()}</p>
        </div>
        {/* Top holder concentration (desktop) */}
        <div className="text-right hidden md:block" style={{ minWidth: 64 }}>
          <ConcentrationChip r={r} />
        </div>
        {/* Rounds (desktop) */}
        <div className="text-right tabular-nums hidden md:block">
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{r.tokenRoundCount ?? "—"}</p>
        </div>
        {/* Cliff (desktop) — moved off the token name into its own column */}
        <div className="hidden md:block">
          <CliffChip r={r} />
        </div>
        {/* Risk (desktop) */}
        <div className="text-right hidden md:block" style={{ minWidth: 48 }}>
          <RiskChip r={r} />
        </div>
        {/* Vesting progress (desktop) */}
        <div className="hidden md:block" title={progressTitle(r)}>
          <VestingProgress r={r} />
        </div>
        {/* Next unlock (desktop) */}
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>in {relativeUntil(r.eventTime)}</p>
        </div>
      </Link>
      <div className="pr-3 pl-1">
        <WatchButton tokenAddress={r.tokenAddress} chainId={r.chainId} tokenSymbol={r.tokenSymbol} />
      </div>
    </div>
  );
}

// ── Risk classification ──────────────────────────────────────────────────────
// Market-impact risk: how hard would this unlock hit the market? Measured as
// the unlock's value vs the token's MARKET CAP (primary) and vs its 24h volume
// (secondary, when we have it). This replaced the old "unlock ÷ locked supply"
// basis, which flagged every single-wallet token HIGH (its one unlock = ~100%
// of its own lock). No market cap (and no volume) → not scored (no badge).
function classifyRisk(r: ExplorerRow): "HIGH" | "MED" | "LOW" | null {
  const a = r.absorptionRatio;   // unlock ÷ 24h volume
  const m = r.marketCapShare;    // unlock ÷ market cap
  if (a == null && m == null) return null;
  if ((m != null && m >= 0.10) || (a != null && a >= 1.0)) return "HIGH";
  if ((m != null && m >= 0.025) || (a != null && a >= 0.25)) return "MED";
  return "LOW";
}

// Column header tooltips — every column explains itself on hover.
const TOKEN_HELP   = "The vesting token — symbol, protocol, and chain. Click a row to open its full breakdown.";
const AMOUNT_HELP  = "Total tokens still locked (not yet vested) across all of this token's schedules.";
const USD_HELP     = "Locked amount × current price. Dimmed = thin DEX liquidity (estimate); “—” = no tradeable market.";
const WALLETS_HELP = "Distinct wallets receiving this token's vesting — a fair launch has many, a team grant has few.";
const ROUNDS_HELP  = "Distinct vesting schedules (terms) — same protocol + shape + cliff + duration = one round.";
const NEXT_HELP    = "Time until this token's next unlock event. Sorted soonest-first by default.";

// Shown on the "Risk" header (hover) so the score is self-explanatory.
const RISK_METHODOLOGY =
  "Risk = how hard this unlock could hit the market:\n" +
  "• Market-cap share — its USD value vs the token's market cap\n" +
  "• Absorption — its USD value vs the token's 24h volume (when known)\n" +
  "HIGH: ≥10% of market cap (or > a full day's volume)\n" +
  "MED: ≥2.5% of market cap (or ≥25% of a day's volume) · LOW: below that\n" +
  "Tokens with no market price aren't scored.";

/** Per-row tooltip — the methodology plus THIS row's actual numbers. */
function riskTitle(r: ExplorerRow): string {
  const band = classifyRisk(r);
  if (!band) return "Not scored — no market price / market cap for this token, so unlock impact can't be measured.";
  const share = r.marketCapShare == null ? "—" : `${(r.marketCapShare * 100).toFixed(r.marketCapShare < 0.01 ? 2 : 1)}% of market cap`;
  const absorption = r.absorptionRatio == null ? "—" : `${Math.round(r.absorptionRatio * 100)}% of a day's volume`;
  return `Risk: ${band}\n\n${RISK_METHODOLOGY}\n\nThis unlock: ${share} · ${absorption}`;
}

function RiskChip({ r }: { r: ExplorerRow }) {
  const band = classifyRisk(r);
  const title = riskTitle(r);
  if (!band) return <span className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }} title={title}>—</span>;
  const style =
    band === "HIGH" ? { bg: "rgba(220,38,38,0.12)", fg: "#dc2626" } :
    band === "MED"  ? { bg: "rgba(217,119,6,0.12)", fg: "#d97706" } :
                      { bg: "rgba(28,184,184,0.10)", fg: "#0F8A8A" };
  return (
    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help"
      style={{ background: style.bg, color: style.fg }}
      title={title}>
      {band}
    </span>
  );
}

// ── Cliff flag (own column) ──────────────────────────────────────────────────
// Moved off the token name (where the ⚠️ read as a generic risk warning) into
// a dedicated, sortable column. A cliff = a lump unlocks at once vs gradually.
const CLIFF_HELP =
  "Cliff unlock — a lump of tokens unlocks at once rather than vesting " +
  "gradually. The kind of event worth bracing for around its date.";

function CliffChip({ r }: { r: ExplorerRow }) {
  if (!r.hasCliff) return <span className="text-xs" style={{ color: "var(--preview-text-3)" }}>—</span>;
  return (
    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help"
      style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}
      title={CLIFF_HELP}>
      Cliff
    </span>
  );
}

// ── Top-holder concentration ─────────────────────────────────────────────────
// Largest single recipient's share of the token's total locked supply — the
// "whale" / centralisation signal. From the token rollup (cron-maintained).
// Colour-banded: ≥50% red (one wallet dominates), ≥25% amber, below teal.
const CONCENTRATION_HELP =
  "Top holder — the single largest recipient's share of this token's total " +
  "locked supply.\nHigh concentration (one wallet holding most of the locked " +
  "tokens) means that wallet's unlock can move the market on its own.\n" +
  "≥50% = one wallet dominates · ≥25% = concentrated · below = more distributed.";

function ConcentrationChip({ r }: { r: ExplorerRow }) {
  const s = r.topHolderShare;
  if (s == null) return <span className="text-sm cursor-help" style={{ color: "var(--preview-text-3)" }} title="No concentration data for this token yet.">—</span>;
  const pct = Math.round(s * 100);
  const fg = s >= 0.5 ? "#dc2626" : s >= 0.25 ? "#d97706" : "var(--preview-text-2)";
  const title = `Top holder owns ${pct}% of locked supply.\n\n${CONCENTRATION_HELP}`;
  return (
    <span className="text-sm font-semibold tabular-nums cursor-help" style={{ color: fg }} title={title}>
      {pct < 1 ? "<1%" : `${pct}%`}
    </span>
  );
}

// ── Vesting progress (whole-token span elapsed) ──────────────────────────────
// Shown on the "Vested" header (hover).
const PROGRESS_HELP =
  "How far through its full vesting span the token is — from the earliest " +
  "active start to the latest active end.\n0% = just started · 100% = fully unlocked.";

function fmtMonthYear(sec: number | null | undefined): string {
  if (!sec) return "—";
  return new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Per-row tooltip: the full start→end span plus elapsed %. */
function progressTitle(r: ExplorerRow): string {
  const p = progressOf(r);
  if (p == null) return "Vesting span unavailable for this token.";
  return `Vesting: ${fmtMonthYear(r.vestStart)} → ${fmtMonthYear(r.vestEnd)}\n${Math.round(p * 100)}% elapsed`;
}

function VestingProgress({ r }: { r: ExplorerRow }) {
  const p = progressOf(r);                 // 0–1 elapsed (or null)
  const pct = p == null ? null : Math.round(p * 100);
  const curve = r.unlockCurve;

  // Sparkline of the cumulative-unlock shape (cliff vs linear vs back-loaded),
  // with a dashed "now" marker at the elapsed point. Far more informative than
  // a flat progress bar. Falls back to the bar when no curve is available.
  if (curve && curve.length >= 2) {
    const SW = 54, SH = 16, n = curve.length;
    const xAt = (i: number) => (i / (n - 1)) * SW;
    const yAt = (v: number) => SH - (Math.max(0, Math.min(100, v)) / 100) * SH;
    const line = curve.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
    const area = `0,${SH} ${line} ${SW},${SH}`;
    const nowX = p != null ? p * SW : null;
    return (
      <div className="flex items-center gap-1.5 cursor-help">
        <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} style={{ display: "block", overflow: "visible" }}>
          <polygon points={area} fill="#0F8A8A" fillOpacity={0.12} />
          <polyline points={line} fill="none" stroke="#0F8A8A" strokeWidth={1.25} strokeLinejoin="round" />
          {nowX != null && <line x1={nowX} y1={-1} x2={nowX} y2={SH + 1} stroke="var(--preview-text-3)" strokeWidth={1} strokeDasharray="2 2" />}
        </svg>
        {pct != null && <span className="text-[10px] tabular-nums" style={{ color: "var(--preview-text-3)" }}>{pct}%</span>}
      </div>
    );
  }

  if (pct == null) return <p className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }}>—</p>;
  return (
    <div className="flex items-center gap-2 cursor-help">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--preview-muted-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0F8A8A" }} />
      </div>
      <span className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--preview-text-3)" }}>{pct}%</span>
    </div>
  );
}

// ── Presentation helpers (mirrors page.tsx) ──────────────────────────────────
function tokenInitial(symbol: string | null, address: string): string {
  if (symbol && symbol !== "UNKNOWN") return symbol.slice(0, 2).toUpperCase();
  return address.slice(2, 4).toUpperCase();
}
function shortAddr(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
function fmtAmount(raw: string | null, decimals: number): string {
  if (!raw) return "—";
  try {
    const n = Number(BigInt(raw)) / 10 ** Math.min(decimals, 18);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "—";
  }
}
// Inlined (not imported from quick-prices.ts — that module pulls in the
// Upstash Redis SDK, which must not enter the client bundle).
function formatUsdCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "—";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  if (usd >= 1)   return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
function relativeUntil(unix: number | null): string {
  if (!unix) return "—";
  const diff = Math.max(0, unix - Math.floor(Date.now() / 1000));
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}
