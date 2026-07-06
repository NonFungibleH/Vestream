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
// Columns (the narrow ones auto-hide below lg):
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
  vestStart?:        number | null;   // earliest active start (unix sec) – progress bar
  vestEnd?:          number | null;   // latest active end (unix sec)
  hasCliff?:         boolean;         // any active stream has a lump-unlock cliff (own column)
  topHolderShare?:   number | null;   // largest recipient's share (0–1) of locked – concentration
  unlockCurve?:      number[] | null; // 12 cumulative-% samples → row sparkline
  eventTime:         number;
  absorptionRatio:   number | null;
  marketCapShare:    number | null;   // unlock value ÷ market cap – the risk basis
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
  onSort, onPage, onClear,
}: {
  rows:         ExplorerRow[];
  totalMatches: number;
  page:         number;
  totalPages:   number;
  pageSize:     number;
  sort:         SortCol;
  dir:          SortDir;
  /** Current URL search params, so headers + pagination can build hrefs.
   *  Only used in LINK mode (server-paginated pages). */
  params:       Record<string, string | undefined>;
  /** CLIENT mode – when provided, headers/pagination/clear become buttons that
   *  mutate in-memory state instead of navigating (instant, no round-trip).
   *  The client-side explorer passes these; server pages omit them. */
  onSort?:      (col: SortCol, dir: SortDir) => void;
  onPage?:      (page: number) => void;
  onClear?:     () => void;
}) {
  const clientMode = onSort != null;

  // Build a URL preserving current params, with overrides (undefined clears).
  const hrefFor = (overrides: Record<string, string | undefined>): string => {
    const usp = new URLSearchParams();
    const merged = { ...params, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v != null && v !== "") usp.set(k, v);
    const qs = usp.toString();
    return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
  };
  // Set sort col + direction, reset to page 1. Clicking the active column flips
  // direction. In client mode → callback; else → href.
  const nextDirFor = (col: SortCol, defaultDir: SortDir): SortDir =>
    col === sort ? (dir === "asc" ? "desc" : "asc") : defaultDir;
  const sortHref = (col: SortCol, defaultDir: SortDir): string =>
    hrefFor({ sort: col, dir: nextDirFor(col, defaultDir), page: undefined });
  // Props for a sort header – either { href } (link mode) or { onClick } (client).
  const sortProps = (col: SortCol, defaultDir: SortDir): { href?: string; onClick?: () => void } =>
    clientMode
      ? { onClick: () => onSort!(col, nextDirFor(col, defaultDir)) }
      : { href: sortHref(col, defaultDir) };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>No tokens match these filters.</p>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--preview-text-3)" }}>
          Your filters are too tight – widen a slider, set the date to “Any time”, or clear everything.
        </p>
        {clientMode ? (
          <button type="button" onClick={onClear}
            className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "#0F8A8A", color: "white" }}>
            Clear all filters
          </button>
        ) : (
          <Link href="/dashboard/explorer" scroll={false}
            className="inline-block text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "#0F8A8A", color: "white" }}>
            Clear all filters
          </Link>
        )}
      </div>
    );
  }

  const from = (page - 1) * pageSize + 1;
  const to   = (page - 1) * pageSize + rows.length;

  // Shared grid template: mobile = Token · USD · Wallets (3); desktop adds
  // Amount, Rounds, Risk, Next (7). Desktop-only cells use `hidden lg:flex`,
  // so on mobile they're removed from the grid and the 3 visible cells fill
  // the 3-column template.
  // Proportional `fr` columns (NOT auto): the template is deterministic, so
  // the header grid and every row grid resolve to identical column widths and
  // line up – `auto` sized each grid to its own content, which is why headers
  // and values drifted. `fr` units also fill the width evenly instead of one
  // 1fr token column hogging all the slack (the empty space). Mobile shows
  // Token · USD · Wallets; the desktop-only cells are display:none below md so
  // they drop out of the 3-col mobile grid.
  // minmax(0,…) on every track (not bare `fr`) so a wide cell can't blow out
  // its column and shove the others – grid `fr` tracks otherwise floor at their
  // content's min width. Columns stay put when you sort.
  // Token column soaks up the full-width slack (its name + protocol·chain
  // subtitle can use the room) so the data columns stay packed instead of
  // spreading into big gaps. Vested tightened (it's just a small sparkline).
  // Breakpoint is `lg` (1024px), NOT `md` (768px): ten columns plus the two-word
  // headers ("Top recipient", "Next unlock") don't fit in the 768–1023px band, so
  // at `md` the header labels overflowed their tracks and overlapped. Below `lg`
  // we fall back to the clean 3-column layout (Token · USD · Wallets).
  const GRID = "grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.75fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.55fr)_minmax(0,0.85fr)_minmax(0,0.85fr)] items-center gap-3 px-4 lg:px-5";

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
        {/* Sortable header – each is a Link that re-queries server-side. */}
        <div className="flex items-center" style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
          <div className={`flex-1 ${GRID} py-2`}>
            <Th label="Token"       active={sort === "token"}         dir={dir} {...sortProps("token", "asc")} title={TOKEN_HELP} />
            <Th label="Amount"      active={sort === "amount"}        dir={dir} {...sortProps("amount", "desc")} align="right" className="hidden lg:flex" title={AMOUNT_HELP} />
            <Th label="USD"         active={sort === "usd"}           dir={dir} {...sortProps("usd", "desc")} align="right" minW={64} title={USD_HELP} />
            <Th label="Wallets"     active={sort === "wallets"}       dir={dir} {...sortProps("wallets", "desc")} align="right" minW={56} title={WALLETS_HELP} />
            <Th label="Top %" active={sort === "concentration"} dir={dir} {...sortProps("concentration", "desc")} align="right" className="hidden lg:flex" minW={44} title={CONCENTRATION_HELP} />
            <Th label="Rounds"      active={sort === "rounds"}        dir={dir} {...sortProps("rounds", "desc")} align="right" className="hidden lg:flex" title={ROUNDS_HELP} />
            <Th label="Cliff"       active={sort === "cliff"}         dir={dir} {...sortProps("cliff", "desc")} className="hidden lg:flex" title={CLIFF_HELP} />
            <Th label="Risk"        active={sort === "risk"}          dir={dir} {...sortProps("risk", "desc")} align="right" className="hidden lg:flex" minW={48} title={RISK_METHODOLOGY} />
            <Th label="Vested"      active={sort === "progress"}      dir={dir} {...sortProps("progress", "desc")} align="right" className="hidden lg:flex" title={PROGRESS_HELP} />
            <Th label="Next" active={sort === "date"}          dir={dir} {...sortProps("date", "asc")} align="right" className="hidden lg:flex" title={NEXT_HELP} />
          </div>
          <div className="pr-3 pl-1"><div style={{ width: 26 }} aria-hidden /></div>
        </div>

        {/* Rows – already ordered + paginated server-side. */}
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
            {clientMode ? (
              <>
                <PageLink onClick={page > 1 ? () => onPage!(page - 1) : undefined}>‹ Prev</PageLink>
                <PageLink onClick={page < totalPages ? () => onPage!(page + 1) : undefined}>Next ›</PageLink>
              </>
            ) : (
              <>
                <PageLink href={page > 1 ? hrefFor({ page: page - 1 <= 1 ? undefined : String(page - 1) }) : null}>‹ Prev</PageLink>
                <PageLink href={page < totalPages ? hrefFor({ page: String(page + 1) }) : null}>Next ›</PageLink>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Header cell (sort control) ────────────────────────────────────────────────
// Renders a Link (server-paginated pages) or a <button> (client-side explorer)
// depending on whether href or onClick is supplied – identical appearance.
function Th({
  label, active, dir, href, onClick, align = "left", minW, className = "", title,
}: {
  label: string; active: boolean; dir: SortDir; href?: string; onClick?: () => void;
  align?: "left" | "right"; minW?: number; className?: string; title?: string;
}) {
  const inner = (
    <>
      <span className="text-[10px] font-semibold uppercase tracking-wider transition-colors truncate min-w-0"
        style={{ color: active ? "#0F8A8A" : "var(--preview-text-3)" }}>
        {label}
      </span>
      <span className="text-[8px] shrink-0" style={{ color: active ? "#0F8A8A" : "transparent" }}>
        {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
      </span>
    </>
  );
  // min-w-0 + overflow-hidden so a label can never spill into the neighbouring
  // column (the dense 10-col grid has 0.55fr tracks narrower than some labels).
  const cls = `flex items-center gap-1 min-w-0 overflow-hidden ${align === "right" ? "justify-end" : ""} ${className}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={{ minWidth: minW }}
        aria-label={`Sort by ${label}`} title={title}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={href ?? "#"} scroll={false} className={cls} style={{ minWidth: minW }}
      aria-label={`Sort by ${label}`} title={title}>
      {inner}
    </Link>
  );
}

// ── Pagination button ─────────────────────────────────────────────────────────
// Link mode: pass `href` (null = disabled). Client mode: pass `onClick`
// (undefined = disabled).
function PageLink({ href, onClick, children }: { href?: string | null; onClick?: () => void; children: React.ReactNode }) {
  const base = "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors";
  const disabled = href == null && onClick == null;
  if (disabled) {
    return <span className={base} style={{ color: "var(--preview-text-3)", borderColor: "var(--preview-border)", opacity: 0.5 }}>{children}</span>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} hover:bg-[var(--preview-muted)]`}
        style={{ color: "var(--preview-text-2)", borderColor: "var(--preview-border)" }}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href!} scroll={false} className={`${base} hover:bg-[var(--preview-muted)]`}
      style={{ color: "var(--preview-text-2)", borderColor: "var(--preview-border)" }}>
      {children}
    </Link>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
// Hover preview – a compact summary of the row's key facts (native title, so
// it works everywhere without extra JS). The top-holder ADDRESS isn't in the
// rollup, so we surface the metrics we have; the full breakdown is one click.
function rowPreview(r: ExplorerRow, chainName: string): string {
  const sym = r.tokenSymbol ?? shortAddr(r.tokenAddress);
  const when = r.eventTime ? new Date(r.eventTime * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–";
  const lines = [
    `${sym} · ${getProtocol(r.protocol)?.name ?? r.protocol} · ${chainName}`,
    `Next unlock: ${when} (in ${relativeUntil(r.eventTime)})`,
    r.usdValue != null
      ? `Locked: ${formatUsdCompact(r.usdValue)} (${fmtAmount(r.amount, r.tokenDecimals)} ${sym})`
      : `Locked: ${fmtAmount(r.amount, r.tokenDecimals)} ${sym} – no market price`,
    `Wallets: ${walletsOf(r).toLocaleString()} · Schedules: ${r.tokenRoundCount ?? "–"}`,
  ];
  if (r.topHolderShare != null && walletsOf(r) > 1) {
    const top = topHolderOfMarketCap(r);
    lines.push(`Vest concentration: ${Math.round(r.topHolderShare * 100)}% of locked${top != null ? ` (≈ ${(top * 100).toFixed(top < 0.01 ? 2 : 1)}% of mkt cap)` : ""}`);
  }
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
            {/* Token name – the cliff flag moved to its own column so the name
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
        <div className="text-right tabular-nums hidden lg:block">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--preview-text-2)" }}>{fmtAmount(r.amount, r.tokenDecimals)}</p>
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
              title={r.usdConfidence === "low" ? "Low liquidity – estimate" : r.usdConfidence === "medium" ? "Medium liquidity – DEX pool < $10k" : undefined}>
              {formatUsdCompact(r.usdValue)}
            </p>
          ) : (
            <p className="text-sm font-bold cursor-help" style={{ color: "var(--preview-text-3)" }}
              title="No liquid market – this token has no tradeable DEX pair, so there's no price to show.">–</p>
          )}
        </div>
        {/* Wallets */}
        <div className="text-right tabular-nums" style={{ minWidth: 56 }}>
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{walletsOf(r).toLocaleString()}</p>
        </div>
        {/* Top holder concentration (desktop) */}
        <div className="text-right hidden lg:block" style={{ minWidth: 64 }}>
          <ConcentrationChip r={r} />
        </div>
        {/* Rounds (desktop) */}
        <div className="text-right tabular-nums hidden lg:block">
          <p className="text-sm font-semibold" style={{ color: "var(--preview-text-2)" }}>{r.tokenRoundCount ?? "–"}</p>
        </div>
        {/* Cliff (desktop) – moved off the token name into its own column */}
        <div className="hidden lg:block">
          <CliffChip r={r} />
        </div>
        {/* Risk (desktop) */}
        <div className="text-right hidden lg:block" style={{ minWidth: 48 }}>
          <RiskChip r={r} />
        </div>
        {/* Vesting progress (desktop) */}
        <div className="hidden lg:flex justify-end" title={progressTitle(r)}>
          <VestingProgress r={r} />
        </div>
        {/* Next unlock (desktop) */}
        <div className="text-right hidden lg:block">
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

// Column header tooltips – every column explains itself on hover.
const TOKEN_HELP   = "The vesting token – symbol, protocol, and chain. Click a row to open its full breakdown.";
const AMOUNT_HELP  = "Total tokens still locked (not yet vested) across all of this token's schedules.";
const USD_HELP     = "Locked amount × current price. Dimmed = thin DEX liquidity (estimate); “–” = no tradeable market.";
const WALLETS_HELP = "Distinct wallets receiving this token's vesting – a fair launch has many, a team grant has few.";
const ROUNDS_HELP  = "Distinct vesting schedules (terms) – same protocol + shape + cliff + duration = one round.";
const NEXT_HELP    = "Time until this token's next unlock event. Sorted soonest-first by default.";

// Shown on the "Risk" header (hover) so the score is self-explanatory.
const RISK_METHODOLOGY =
  "Risk = how hard this unlock could hit the market:\n" +
  "• Market-cap share – its USD value vs the token's market cap\n" +
  "• Absorption – its USD value vs the token's 24h volume (when known)\n" +
  "HIGH: ≥10% of market cap (or > a full day's volume)\n" +
  "MED: ≥2.5% of market cap (or ≥25% of a day's volume) · LOW: below that\n" +
  "Tokens with no market price aren't scored.";

/** Per-row tooltip – the methodology plus THIS row's actual numbers. */
function riskTitle(r: ExplorerRow): string {
  const band = classifyRisk(r);
  if (!band) return "Not scored – no market price / market cap for this token, so unlock impact can't be measured.";
  const share = r.marketCapShare == null ? "–" : `${(r.marketCapShare * 100).toFixed(r.marketCapShare < 0.01 ? 2 : 1)}% of market cap`;
  const absorption = r.absorptionRatio == null ? "–" : `${Math.round(r.absorptionRatio * 100)}% of a day's volume`;
  return `Risk: ${band}\n\n${RISK_METHODOLOGY}\n\nThis unlock: ${share} · ${absorption}`;
}

function RiskChip({ r }: { r: ExplorerRow }) {
  const band = classifyRisk(r);
  const title = riskTitle(r);
  if (!band) return <span className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }} title={title}>–</span>;
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
  "Cliff unlock – a lump of tokens unlocks at once rather than vesting " +
  "gradually. The kind of event worth bracing for around its date.";

function CliffChip({ r }: { r: ExplorerRow }) {
  if (!r.hasCliff) return <span className="text-xs" style={{ color: "var(--preview-text-3)" }}>–</span>;
  return (
    <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-help"
      style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}
      title={CLIFF_HELP}>
      Cliff
    </span>
  );
}

// ── Vest concentration ───────────────────────────────────────────────────────
// Largest single recipient's share of the token's LOCKED (vesting) supply – NOT
// total token supply. Two guards stop it over-reading (it used to flag 93% of
// rows red):
//   1. A single-recipient token is tautologically 100% – shown "–", not red.
//   2. Colour is driven by MATERIALITY (the top wallet's unlock as a share of
//      market cap), not the raw vest %. Concentrated-but-immaterial, or no
//      market price to judge by → muted, not alarming.
const CONCENTRATION_HELP =
  "Concentration WITHIN this token's vesting – the largest single recipient's " +
  "share of the LOCKED (vesting) supply, not total token supply.\n" +
  "• A single-recipient token is always 100%, so it's shown as “–” (not a signal).\n" +
  "• Coloured by real impact: red/amber only when that wallet's unlock is also a " +
  "material share of the token's MARKET CAP. Greyed when there's no market price " +
  "to judge supply impact.";

/** Largest recipient's locked value as a fraction of market cap – the genuine
 *  "one wallet could move the market" number. null when unknowable. */
function topHolderOfMarketCap(r: ExplorerRow): number | null {
  return r.topHolderShare != null && r.marketCapShare != null ? r.topHolderShare * r.marketCapShare : null;
}
type ConcBand = "high" | "med" | "muted" | "na";
function classifyConcentration(r: ExplorerRow): ConcBand {
  if (r.topHolderShare == null) return "na";
  if (walletsOf(r) <= 1) return "na";            // tautological – one recipient
  const top = topHolderOfMarketCap(r);
  if (top == null) return "muted";               // no market cap → can't judge impact
  if (top >= 0.05)  return "high";               // one wallet ≥5% of market cap
  if (top >= 0.015) return "med";
  return "muted";
}

function ConcentrationChip({ r }: { r: ExplorerRow }) {
  const s = r.topHolderShare;
  const band = classifyConcentration(r);
  if (band === "na") {
    const title = walletsOf(r) <= 1
      ? "Single recipient – concentration isn't meaningful (one wallet is always 100% of its own vest)."
      : "No concentration data for this token yet.";
    return <span className="text-sm cursor-help" style={{ color: "var(--preview-text-3)" }} title={title}>–</span>;
  }
  const pct = Math.round((s ?? 0) * 100);
  const fg = band === "high" ? "#dc2626" : band === "med" ? "#d97706" : "var(--preview-text-3)";
  const top = topHolderOfMarketCap(r);
  const matLine = top != null
    ? `That wallet's unlock ≈ ${(top * 100).toFixed(top < 0.01 ? 2 : 1)}% of market cap.`
    : "No market price – supply impact unknown (shown muted).";
  const title = `Top recipient holds ${pct}% of the LOCKED (vesting) supply.\n${matLine}\n\n${CONCENTRATION_HELP}`;
  return (
    <span className="text-sm font-semibold tabular-nums cursor-help" style={{ color: fg }} title={title}>
      {pct < 1 ? "<1%" : `${pct}%`}
    </span>
  );
}

// ── Vesting progress (whole-token span elapsed) ──────────────────────────────
// Shown on the "Vested" header (hover).
const PROGRESS_HELP =
  "How far through its full vesting span the token is – from the earliest " +
  "active start to the latest active end.\n0% = just started · 100% = fully unlocked.";

function fmtMonthYear(sec: number | null | undefined): string {
  if (!sec) return "–";
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

  if (pct == null) return <p className="text-xs cursor-help" style={{ color: "var(--preview-text-3)" }}>–</p>;
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
  if (!raw) return "–";
  try {
    const n = Number(BigInt(raw)) / 10 ** Math.min(decimals, 18);
    if (!Number.isFinite(n)) return "–";
    // Bound the width. Memecoin supplies reach 1e60+, and .toFixed() silently
    // falls back to FULL exponential ("1.2000…e+61") above 1e21 – a giant
    // unbreakable string that shoves the whole table sideways when you sort by
    // Amount. Cap with a short compact exponential ("1.2e61").
    if (n >= 1e15) return n.toExponential(1).replace("e+", "e");
    if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)    return n.toFixed(2);
    return n.toFixed(4);
  } catch {
    return "–";
  }
}
// Inlined (not imported from quick-prices.ts – that module pulls in the
// Upstash Redis SDK, which must not enter the client bundle).
function formatUsdCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return "–";
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(1)}K`;
  if (usd >= 1)   return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(4)}`;
}
function relativeUntil(unix: number | null): string {
  if (!unix) return "–";
  const diff = Math.max(0, unix - Math.floor(Date.now() / 1000));
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}
