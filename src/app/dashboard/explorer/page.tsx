// src/app/dashboard/explorer/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Block-explorer-style vesting search engine. The front door for "find any
// vesting position across every protocol and chain we index" — distinct
// from /dashboard (which is the user's own portfolio) and /dashboard/discover
// (which is a one-shot wallet scan).
//
// Architecture:
//   - Server component reads URL params, fetches results server-side, renders
//     SSR HTML. Filter changes navigate (Next.js soft-nav, no full reload).
//   - Search input is a small client island that detects what the user typed
//     and routes to the right URL.
//   - URL is the canonical state: ?q=... &mode=calendar|stream|wallet
//     &chain=... &protocol=... &date=... — every view is shareable.
//
// Data sources (all already built):
//   - calendar mode: getUnlocksInWindow()
//   - stream mode:   getStreamsForExplorer() (lightweight wrapper, this file)
//   - wallet mode:   /api/vesting (existing endpoint, called server-side)
//
// Tier gating: the page renders for everyone authed (free + pro + fund) but
// caps results for free users (50 per query, no multi-filter compose).
// Upgrade prompts appear inline when caps bite.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { getCurrentUserTier, type Tier } from "@/lib/auth/tier";
import {
  getUnlocksInWindow,
  enrichGroupsWithUsd,
  WINDOWS,
  type WindowSlug,
  type WindowUnlockGroup,
} from "@/lib/vesting/unlock-windows";
import { formatUsdCompact, getQuickUsdPrices, toUsdValue } from "@/lib/vesting/quick-prices";
import {
  getStreamsForExplorer,
  getStreamsByRecipient,
  type StreamRow,
} from "@/lib/vesting/explorer-queries";
import { resolveEnsName } from "@/lib/ens";
import { listProtocols, getProtocol } from "@/lib/protocol-constants";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { ExplorerSearchInput } from "./SearchInput";
import { SavedTokensStrip } from "./SavedTokensStrip";
// ExplorerSidebar removed — sidebar is now provided by
// src/app/dashboard/layout.tsx via the shared DashboardSidebar component.
// import { ExplorerSidebar } from "./Sidebar";
import { SaveSearchButton } from "./SaveSearchButton";
import { detectQueryKind } from "./detect-query";
import { WatchButton } from "./WatchButton";

export const dynamic = "force-dynamic";

// ─── Constants ──────────────────────────────────────────────────────────────

const FREE_TIER_ROW_CAP = 50;
const FREE_TIER_FILTER_CAP = 1; // active filters beyond the search query

const CHAIN_FILTERS: ReadonlyArray<{ id: number; label: string }> = [
  { id: 1,    label: "Ethereum"  },
  { id: 8453, label: "Base"      },
  { id: 56,   label: "BNB Chain" },
  { id: 137,  label: "Polygon"   },
  { id: 101,  label: "Solana"    },
];

const STATUS_FILTERS = [
  { id: "active", label: "Active streams" },
  { id: "upcoming", label: "Upcoming unlocks" },
] as const;

const AMOUNT_FILTERS = [
  { id: "1k",   label: "$1k+",   threshold:    1000 },
  { id: "10k",  label: "$10k+",  threshold:   10000 },
  { id: "100k", label: "$100k+", threshold:  100000 },
  { id: "1m",   label: "$1M+",   threshold: 1000000 },
] as const;

// Wallet-count filter — surfaces mass distributions (airdrops, launchpad
// rounds) vs single-recipient team locks. Group-level, calendar mode only.
const WALLET_FILTERS = [
  { id: "10",  label: "10+ wallets",  min: 10  },
  { id: "25",  label: "25+ wallets",  min: 25  },
  { id: "100", label: "100+ wallets", min: 100 },
] as const;

// Calendar sort toggles. "amount" is the raw token amount — honest label
// in the UI ("Largest (token amt)") because we don't price all groups in
// USD on this path yet; cross-token amount comparisons are approximate.
const CALENDAR_SORTS = [
  { id: "date",    label: "Soonest" },
  { id: "wallets", label: "Most wallets" },
  { id: "amount",  label: "Largest (token amt)" },
] as const;
type CalendarSort = (typeof CALENDAR_SORTS)[number]["id"];

const DATE_FILTERS: Array<{ id: WindowSlug | "all"; label: string }> = [
  { id: "all",       label: "Any time" },
  { id: "today",     label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "30-days",   label: "Next 30 days" },
  { id: "90-days",   label: "Next 90 days" },
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExplorerSearchParams {
  q?:        string;
  mode?:     "calendar" | "stream" | "wallet";
  chain?:    string;   // comma-separated ids
  protocol?: string;   // comma-separated slugs
  date?:     string;   // window slug or "all"
  amount?:   string;   // amount-filter id
  wallets?:  string;   // wallet-count filter id ("10" | "25" | "100")
  sort?:     string;   // calendar sort ("date" | "wallets" | "amount")
  status?:   string;
}

interface PageProps {
  searchParams: Promise<ExplorerSearchParams>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function ExplorerPage({ searchParams }: PageProps) {
  // Auth gate — middleware enforces vestr_session for all /dashboard/* routes
  // (see src/middleware.ts). No additional cookie check needed here — any
  // authenticated dashboard user (free or pro) can access the explorer.
  // Tier-based caps (FREE_TIER_ROW_CAP, FREE_TIER_FILTER_CAP) are applied
  // below via isFree so free users still see a limited but functional view.
  // Dark-mode theming is owned by <DarkModeProvider> in the dashboard
  // layout — its single reactive `.dark` wrapper themes this whole
  // subtree. We deliberately do NOT add a per-page SSR `.dark` class:
  // that class is non-reactive (only updates after router.refresh
  // completes), so it kept the page dark for a beat after the user
  // toggled back to light. Removed 2026-06-12.

  const tier: Tier | null = await getCurrentUserTier();
  const isFree = tier === "free" || tier == null;

  const sp = await searchParams;
  const query   = (sp.q ?? "").trim();
  const mode    = sp.mode ?? "calendar";
  const dateSlug = (sp.date ?? "30-days") as WindowSlug | "all";

  const chainIds = parseCsvNumbers(sp.chain);
  const protocols = parseCsvStrings(sp.protocol);
  const amountThreshold = AMOUNT_FILTERS.find((f) => f.id === sp.amount)?.threshold;
  const minWallets = WALLET_FILTERS.find((f) => f.id === sp.wallets)?.min;
  const sortKey: CalendarSort = (CALENDAR_SORTS.find((c) => c.id === sp.sort)?.id ?? "date");

  const queryKind = query ? detectQueryKind(query) : { kind: "empty" as const };

  const adapterIds = protocols.length > 0
    ? expandProtocolsToAdapters(protocols)
    : undefined;

  // ── Mode-specific fetch ────────────────────────────────────────────────
  // Each mode populates `modeResult` with the raw data it needs, plus a
  // numeric `totalMatches` for the cap UX. Visible/hidden split and the
  // upgrade banner happen below in render.
  const window = dateSlug === "all"
    ? { startSec: Math.floor(Date.now() / 1000), endSec: Math.floor(Date.now() / 1000) + 5 * 365 * 86400 }
    : WINDOWS[dateSlug as WindowSlug].range();

  let calendarGroups: WindowUnlockGroup[] = [];
  let streamRows:     StreamRow[]         = [];
  let walletRows:     StreamRow[]         = [];
  let walletAddress:  string | null       = null;
  let walletEnsHint:  string | null       = null;

  if (mode === "calendar") {
    let calendarResult;
    try {
      calendarResult = await getUnlocksInWindow(
        window.startSec,
        window.endSec,
        isFree ? FREE_TIER_ROW_CAP * 4 : 2000,
        adapterIds,
        chainIds.length > 0 ? chainIds : undefined,
        // Symbol searches MUST filter in SQL, not on the returned groups:
        // the pool is capped across ALL tokens (soonest-ending first), so a
        // post-hoc filter only sees whichever slice of this token's streams
        // happened to make the global pool. The old post-filter showed
        // "24 wallets" for PYME when the token had 850+ vestings.
        queryKind.kind === "symbol" ? queryKind.symbol : undefined,
      );
    } catch {
      calendarResult = { groups: [], stats: { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] } };
    }
    calendarGroups = calendarResult.groups;
    // Price every group in one DexScreener batch. The explorer is dynamic,
    // so the Upstash Redis layer is allowed; one batch covers up to 30
    // distinct (chain, token) pairs which comfortably absorbs our visible
    // window (≤ 50 rows × usually 5-15 distinct tokens).
    calendarGroups = await enrichGroupsWithUsd(calendarGroups);

    if (amountThreshold) {
      // Filter on REAL USD value once priced. Unpriced rows are kept
      // (we don't penalise tokens DexScreener doesn't cover) — the table
      // sorts them last in "Largest" mode anyway, so they're easy to tell
      // apart from the priced ones.
      calendarGroups = calendarGroups.filter(
        (g) => g.usdValue == null || g.usdValue >= amountThreshold,
      );
    }
    if (minWallets) {
      calendarGroups = calendarGroups.filter((g) => g.walletCount >= minWallets);
    }
    // getUnlocksInWindow returns soonest-first; only re-sort for the
    // non-default toggles.
    if (sortKey === "wallets") {
      calendarGroups = [...calendarGroups].sort((a, b) => b.walletCount - a.walletCount);
    } else if (sortKey === "amount") {
      // Priced rows sort first by USD (honest). Unpriced rows fall to the
      // end, ordered among themselves by raw token amount so a Sablier
      // unlock of 10B BERA-like-token doesn't outrank a $1M priced USDC
      // event. Cross-token raw amounts being compared is the same caveat
      // that's labelled in the sort toggle.
      const rawAmt = (g: WindowUnlockGroup) => {
        try { return BigInt(g.amount ?? "0"); } catch { return 0n; }
      };
      calendarGroups = [...calendarGroups].sort((a, b) => {
        const av = a.usdValue, bv = b.usdValue;
        if (av != null && bv != null) return bv - av;
        if (av != null) return -1;
        if (bv != null) return 1;
        const ar = rawAmt(a), br = rawAmt(b);
        return br > ar ? 1 : br < ar ? -1 : 0;
      });
    }
  } else if (mode === "stream") {
    streamRows = await getStreamsForExplorer({
      chainIds:    chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      tokenSymbol: queryKind.kind === "symbol" ? queryKind.symbol : undefined,
      status:      "active",
      limit:       isFree ? FREE_TIER_ROW_CAP * 4 : 1000,
    });
  } else if (mode === "wallet") {
    // Resolve ENS to address if needed, then query streams keyed on recipient.
    if (queryKind.kind === "address") {
      walletAddress = queryKind.address;
    } else if (queryKind.kind === "ens") {
      walletEnsHint = queryKind.name;
      walletAddress = await resolveEnsName(queryKind.name);
    }
    if (walletAddress) {
      walletRows = await getStreamsByRecipient(walletAddress, {
        chainIds:   chainIds.length > 0 ? chainIds : undefined,
        adapterIds,
        status:     "any",
        limit:      isFree ? FREE_TIER_ROW_CAP * 4 : 1000,
      });
    }
  }

  // ── Wallet-mode portfolio summary ──────────────────────────────────────
  // "Smart money" signal: when a user lands on a wallet (after clicking a
  // recipient from a calendar row or round), tell them what else this
  // wallet is vesting. A whale or fund will hold positions in 5-20 tokens;
  // a one-off recipient will hold one. That number is the punchline.
  // Computed purely from `walletRows` (already loaded), so no extra DB
  // hit; the only side-call is a single price batch for the top 8 tokens.
  let walletPortfolio: WalletPortfolioRow[] = [];
  if (mode === "wallet" && walletRows.length > 0) {
    walletPortfolio = await buildWalletPortfolio(walletRows);
  }

  // Compute the cap split per mode using the same shape, so render below
  // can use one banner component.
  const totalMatches =
    mode === "calendar" ? calendarGroups.length :
    mode === "stream"   ? streamRows.length     :
    walletRows.length;
  const visibleCount = isFree ? Math.min(totalMatches, FREE_TIER_ROW_CAP) : totalMatches;
  const hiddenCount  = totalMatches - visibleCount;
  const visibleCalendar = isFree ? calendarGroups.slice(0, FREE_TIER_ROW_CAP) : calendarGroups;
  const visibleStreams  = isFree ? streamRows.slice(0, FREE_TIER_ROW_CAP) : streamRows;
  const visibleWallets  = isFree ? walletRows.slice(0, FREE_TIER_ROW_CAP) : walletRows;

  // CSV export URL — preserves every active filter param so Pro users
  // download exactly what's on screen (just uncapped to EXPORT_LIMIT).
  const exportParams = new URLSearchParams();
  if (query)              exportParams.set("q", query);
  if (mode)               exportParams.set("mode", mode);
  if (chainIds.length)    exportParams.set("chain", chainIds.join(","));
  if (protocols.length)   exportParams.set("protocol", protocols.join(","));
  if (sp.date)            exportParams.set("date", sp.date);
  if (sp.amount)          exportParams.set("amount", sp.amount);
  if (sp.wallets)         exportParams.set("wallets", sp.wallets);
  const exportHref = `/api/dashboard/explorer/export?${exportParams.toString()}`;

  // Active-filter count for the free-tier multi-filter cap.
  const activeFilters = [
    chainIds.length > 0 ? "chain" : null,
    protocols.length > 0 ? "protocol" : null,
    sp.amount ? "amount" : null,
    sp.wallets ? "wallets" : null,
    dateSlug !== "30-days" ? "date" : null,
  ].filter(Boolean) as string[];
  const overFilterCap = isFree && activeFilters.length > FREE_TIER_FILTER_CAP;

  // The flex shell + sidebar are provided by src/app/dashboard/layout.tsx
  // (DashboardChrome). We render only the right-hand main content here.
  return (
      <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-7xl overflow-y-auto">
        {/* Header */}
        <header className="mb-5">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Vesting Explorer</span>
          </div>
          {/* Hero positioned as the indexed-universe SEARCH surface — distinct
              from /dashboard/discover which is the live wallet SCANNER. The
              two felt redundant visually before; the badge + tighter copy
              makes the boundary obvious. */}
          <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Vesting Search
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
            Search the vesting universe
          </h1>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Query our index by wallet, token, or protocol. Filterable, shareable, and indexed across every supported chain.
          </p>
          <p className="text-xs mt-1.5" style={{ color: "var(--preview-text-3)" }}>
            Need a one-shot live scan of a specific wallet? Use the{" "}
            <Link href="/dashboard/discover" className="font-semibold hover:underline" style={{ color: "#0F8A8A" }}>
              Wallet Scanner →
            </Link>
          </p>
        </header>

        {/* Saved tokens (replaces the old standalone watchlist page) */}
        <SavedTokensStrip />

        {/* Search input */}
        <ExplorerSearchInput
          initialQuery={query}
          mode={mode}
          chainIds={chainIds}
          protocols={protocols}
          dateSlug={dateSlug}
        />

        {/* Active mode tabs + save-search action */}
        <div className="mt-5 flex items-center justify-between gap-3 border-b" style={{ borderColor: "var(--preview-border)" }}>
          <div className="flex items-center gap-1">
            {/* Only the two browse lenses get tabs. Wallet lookups have no tab:
                searching a wallet address / ENS in the box routes to wallet
                results automatically (destinationForQuery → ?mode=wallet), so a
                dedicated tab is redundant. ?mode=wallet links still render. */}
            {(["calendar", "stream"] as const).map((m) => {
              const active = mode === m;
              const href = buildUrl({ ...sp, mode: m });
              return (
                <Link
                  key={m}
                  href={href}
                  className="px-4 py-2 text-sm font-semibold"
                  style={{
                    color: active ? "#0F8A8A" : "var(--preview-text-2)",
                    borderBottom: active ? "2px solid #0F8A8A" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {/* Renamed from Calendar/Streams to Upcoming/Schedules so
                      the facets read as distinct lenses rather than
                      overlapping nouns. URL params (?mode=calendar) kept
                      unchanged so existing links / SEO / saved searches
                      don't break. */}
                  {m === "calendar" ? "Upcoming" : "Schedules"}
                </Link>
              );
            })}
          </div>
          <div className="pb-2">
            <SaveSearchButton isPaid={!isFree} />
          </div>
        </div>

        <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
          {/* Results */}
          <section>
            {mode === "calendar" && (
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[10px] font-bold tracking-widest uppercase mr-1" style={{ color: "var(--preview-text-3)" }}>
                  Sort
                </span>
                {CALENDAR_SORTS.map((c) => (
                  <FilterPill
                    key={c.id}
                    active={sortKey === c.id}
                    href={buildUrl({ ...sp, sort: c.id === "date" ? undefined : c.id })}
                  >
                    {c.label}
                  </FilterPill>
                ))}
              </div>
            )}
            {mode === "calendar" && (
              <CalendarResults
                rows={visibleCalendar}
                totalMatches={totalMatches}
                hiddenCount={hiddenCount}
                isFree={isFree}
                overFilterCap={overFilterCap}
                exportHref={exportHref}
              />
            )}
            {mode === "stream" && (
              <StreamResults
                rows={visibleStreams}
                totalMatches={totalMatches}
                hiddenCount={hiddenCount}
                isFree={isFree}
                overFilterCap={overFilterCap}
                exportHref={exportHref}
              />
            )}
            {mode === "wallet" && (
              <WalletResults
                rows={visibleWallets}
                totalMatches={totalMatches}
                hiddenCount={hiddenCount}
                isFree={isFree}
                walletAddress={walletAddress}
                ensHint={walletEnsHint}
                queryGiven={query.length > 0}
                exportHref={exportHref}
                portfolio={walletPortfolio}
              />
            )}
          </section>

          {/* Filter sidebar — collapsible on mobile via summary/details */}
          <aside className="space-y-4 hidden md:block">
            <FilterGroup label="Chain">
              {CHAIN_FILTERS.map((c) => (
                <FilterPill
                  key={c.id}
                  active={chainIds.includes(c.id)}
                  href={buildUrl({ ...sp, chain: toggleCsvId(sp.chain, c.id) })}
                >
                  {c.label}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Protocol">
              {listProtocols().map((p) => (
                <FilterPill
                  key={p.slug}
                  active={protocols.includes(p.slug)}
                  href={buildUrl({ ...sp, protocol: toggleCsvSlug(sp.protocol, p.slug) })}
                >
                  {p.name}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Date range">
              {DATE_FILTERS.map((d) => (
                <FilterPill
                  key={d.id}
                  active={dateSlug === d.id}
                  href={buildUrl({ ...sp, date: d.id })}
                >
                  {d.label}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Amount (locked tokens)">
              {AMOUNT_FILTERS.map((a) => (
                <FilterPill
                  key={a.id}
                  active={sp.amount === a.id}
                  href={buildUrl({ ...sp, amount: sp.amount === a.id ? undefined : a.id })}
                >
                  {a.label}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Wallets per unlock">
              {WALLET_FILTERS.map((w) => (
                <FilterPill
                  key={w.id}
                  active={sp.wallets === w.id}
                  href={buildUrl({ ...sp, wallets: sp.wallets === w.id ? undefined : w.id })}
                >
                  {w.label}
                </FilterPill>
              ))}
            </FilterGroup>
            {(chainIds.length > 0 || protocols.length > 0 || sp.amount || sp.wallets || dateSlug !== "30-days") && (
              <Link
                href={buildUrl({ q: query })}
                className="block text-center text-xs font-semibold py-2 rounded-lg transition-colors"
                style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
              >
                Clear filters
              </Link>
            )}
          </aside>
        </div>
      </main>
  );
}

// ─── Calendar results block ─────────────────────────────────────────────────

function CalendarResults({
  rows, totalMatches, hiddenCount, isFree, overFilterCap, exportHref,
}: {
  rows:           WindowUnlockGroup[];
  totalMatches:   number;
  hiddenCount:    number;
  isFree:         boolean;
  overFilterCap:  boolean;
  exportHref:     string;
}) {
  if (overFilterCap) {
    return (
      <UpgradeBanner
        title="Combine multiple filters with Pro"
        body="Free accounts can filter by one dimension at a time. Pro lets you stack chain + protocol + amount + date for surgical queries."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
          No upcoming unlocks match your filters.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>
          Try widening the date range or clearing a filter.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches} match{totalMatches === 1 ? "" : "es"}
        </p>
        {!isFree && (
          <a
            href={exportHref}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}
          >
            Export CSV
          </a>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {/* Column headings — reuse CalendarRow's exact grid template so the
            labels sit over their columns. Added because the Risk chip (HIGH/
            MED/LOW) and the USD column had no header, so users couldn't tell
            what the values meant. Trailing spacer matches the WatchButton
            footprint (~26px icon + pr-3 pl-1) so the grid's right edge lines
            up with the rows below. */}
        <div className="flex items-center"
          style={{ borderBottom: "1px solid var(--preview-border-2)", background: "var(--preview-muted)" }}>
          <div className="flex-1 grid grid-cols-[auto_1fr_auto_auto_auto] md:grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-2 md:gap-4 px-4 md:px-5 py-2">
            <div className="w-8" aria-hidden />
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Token</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: "var(--preview-text-3)", minWidth: 64 }}>Value</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: "var(--preview-text-3)", minWidth: 48 }}>Risk</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right hidden md:block" style={{ color: "var(--preview-text-3)" }}>Date</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-right" style={{ color: "var(--preview-text-3)" }}>Unlocks</p>
          </div>
          <div className="pr-3 pl-1"><div style={{ width: 26 }} aria-hidden /></div>
        </div>
        {rows.map((g, i) => (
          <CalendarRow key={g.groupKey} group={g} showTopBorder={i > 0} />
        ))}
      </div>
      {isFree && hiddenCount > 0 && (
        <UpgradeBanner
          title={`${hiddenCount} more match${hiddenCount === 1 ? "" : "es"} above your free limit`}
          body="Pro lifts the per-query cap, adds CSV export, multi-filter compose, and saved-search alerts."
          ctaHref="/pricing"
          ctaLabel="View pricing →"
        />
      )}
    </>
  );
}

// ── Risk chip ────────────────────────────────────────────────────────────
// Categorical at-a-glance signal driven by the worst of three computed
// metrics. The honest numbers live in the tooltip (`title` attr), so a
// power user can sanity-check the chip; a casual user just sees the
// color band. Designed to be conservative — false-positives ("HIGH" on
// a benign event) are worse than false-negatives.

interface RiskBand {
  label: "HIGH" | "MED" | "LOW";
  bg:    string;
  fg:    string;
}

const RISK_HIGH: RiskBand = { label: "HIGH", bg: "rgba(220,38,38,0.12)", fg: "#dc2626" };
const RISK_MED:  RiskBand = { label: "MED",  bg: "rgba(217,119,6,0.12)", fg: "#d97706" };
const RISK_LOW:  RiskBand = { label: "LOW",  bg: "rgba(28,184,184,0.10)", fg: "#0F8A8A" };

function classifyRisk(group: WindowUnlockGroup): RiskBand | null {
  const a = group.absorptionRatio;
  const s = group.supplyShare;
  // Insufficient data — don't pretend to judge.
  if (a == null && s == null) return null;

  // HIGH: this unlock is going to be felt.
  //   absorption ≥ 0.5  → > half a day's volume in one event
  //   supplyShare ≥ 0.05 → > 5% of locked supply releasing here
  if ((a != null && a >= 0.5) || (s != null && s >= 0.05)) return RISK_HIGH;

  // MED: meaningful but not alarming.
  //   absorption ≥ 0.1   → > 10% of daily volume
  //   supplyShare ≥ 0.01 → > 1% of locked supply
  if ((a != null && a >= 0.1) || (s != null && s >= 0.01)) return RISK_MED;

  return RISK_LOW;
}

function fmtPct(x: number | null | undefined): string {
  if (x == null) return "—";
  if (x >= 1)  return `${Math.round(x * 100)}%`;
  if (x >= 0.001) return `${(x * 100).toFixed(1)}%`;
  return `<0.1%`;
}

function RiskChip({ group }: { group: WindowUnlockGroup }) {
  const band = classifyRisk(group);
  // Three-line tooltip via native title. \n is preserved by most browsers
  // in title attrs (Chrome, Safari, Firefox; Edge collapses but still
  // readable). The "vs daily volume" / "of locked supply" / "to top wallet"
  // phrasing tells the user what each number means without a legend.
  const tip = [
    group.absorptionRatio != null
      ? `${(group.absorptionRatio * 100).toFixed(0)}% of token's 24h volume`
      : "Absorption: no volume data",
    group.supplyShare != null
      ? `${fmtPct(group.supplyShare)} of locked supply`
      : "Supply share: not computable",
    group.recipientConcentration != null
      ? `${fmtPct(group.recipientConcentration)} to top wallet`
      : "Concentration: not computable",
  ].join("\n");
  if (!band) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold"
        style={{ color: "var(--preview-text-3)" }}
        title={tip}>
        —
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
      style={{ background: band.bg, color: band.fg }}
      title={tip}>
      {band.label}
    </span>
  );
}

function CalendarRow({ group, showTopBorder }: { group: WindowUnlockGroup; showTopBorder: boolean }) {
  const meta      = getProtocol(group.protocol);
  const accent    = meta?.color ?? "#64748b";
  const chainName = CHAIN_NAMES[group.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${group.chainId}`;
  const ttl       = relativeUntil(group.eventTime);

  return (
    <div className="flex items-center"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <Link
        href={`/dashboard/explorer/token/${group.chainId}/${group.tokenAddress}`}
        className="flex-1 grid grid-cols-[auto_1fr_auto_auto_auto] md:grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-2 md:gap-4 px-4 md:px-5 py-3 transition-colors hover:bg-[var(--preview-muted)]"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
          style={{ background: accent }}>
          {tokenInitial(group.tokenSymbol, group.tokenAddress)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--preview-text)" }}>
            {fmtAmount(group.amount, group.tokenDecimals)} {group.tokenSymbol ?? shortAddr(group.tokenAddress)}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--preview-text-3)" }}>
            <span style={{ color: accent }}>{meta?.name ?? group.protocol}</span>
            <span> · </span>
            {chainName}
            {group.walletCount > 1 && (
              <>
                <span> · </span>
                {group.walletCount} wallets
              </>
            )}
          </p>
        </div>
        {/* USD value column. Medium-confidence prices are dim-italic so a
            user comparing rows can spot the "this number stands on
            thinner liquidity" rows at a glance. Unpriced rows render
            "—" rather than $0 so they don't look like an explicit "zero". */}
        <div className="text-right tabular-nums" style={{ minWidth: 64 }}>
          {group.usdValue != null ? (
            <p
              className="text-sm font-bold"
              style={{
                color: "var(--preview-text)",
                fontStyle: group.usdConfidence === "medium" ? "italic" : "normal",
                opacity:   group.usdConfidence === "medium" ? 0.7 : 1,
              }}
              title={group.usdConfidence === "medium" ? "Medium liquidity — DEX pool < $10k" : undefined}
            >
              {formatUsdCompact(group.usdValue)}
            </p>
          ) : (
            <p className="text-sm font-bold" style={{ color: "var(--preview-text-3)" }}>—</p>
          )}
        </div>
        {/* Risk column — color-coded HIGH/MED/LOW chip driven by the worst
            of the three computed metrics, with all three numbers in the
            native browser tooltip. The chip is only rendered when we can
            actually judge (have usdValue OR supplyShare); pure-token
            rows render "—" rather than guessing. */}
        <div className="text-right" style={{ minWidth: 48 }}>
          <RiskChip group={group} />
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold" style={{ color: "var(--preview-text-2)" }}>
            {fmtDate(group.eventTime)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
            in {ttl}
          </p>
        </div>
      </Link>
      {/* Watch button — adds token to Token Watchlist without navigating */}
      <div className="pr-3 pl-1">
        <WatchButton
          tokenAddress={group.tokenAddress}
          chainId={group.chainId}
          tokenSymbol={group.tokenSymbol}
        />
      </div>
    </div>
  );
}

// ─── Stream-mode results (per-stream rows) ─────────────────────────────────

function StreamResults({
  rows, totalMatches, hiddenCount, isFree, overFilterCap, exportHref,
}: {
  rows:          StreamRow[];
  totalMatches:  number;
  hiddenCount:   number;
  isFree:        boolean;
  overFilterCap: boolean;
  exportHref:    string;
}) {
  if (overFilterCap) {
    return (
      <UpgradeBanner
        title="Combine multiple filters with Pro"
        body="Free accounts can filter by one dimension at a time. Pro lets you stack chain + protocol + amount + status for surgical queries."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
          No active streams match your filters.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>
          Stream mode shows individual vesting schedules. Try clearing a filter or searching by symbol.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches} stream{totalMatches === 1 ? "" : "s"}
        </p>
        {!isFree && (
          <a href={exportHref} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Export CSV
          </a>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {rows.map((s, i) => (
          <StreamRowItem key={s.streamId} row={s} showTopBorder={i > 0} />
        ))}
      </div>
      {isFree && hiddenCount > 0 && (
        <UpgradeBanner
          title={`${hiddenCount} more stream${hiddenCount === 1 ? "" : "s"} above your free limit`}
          body="Pro lifts the per-query cap, adds CSV export, multi-filter compose, and saved-search alerts."
        />
      )}
    </>
  );
}

function StreamRowItem({ row, showTopBorder }: { row: StreamRow; showTopBorder: boolean }) {
  const meta   = getProtocol(row.protocol);
  const accent = meta?.color ?? "#64748b";
  const chain  = CHAIN_NAMES[row.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${row.chainId}`;
  const eventTime = row.nextUnlockTime ?? row.endTime;
  return (
    <div className="flex items-center"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <Link
        href={`/dashboard/explorer/token/${row.chainId}/${row.tokenAddress}`}
        className="flex-1 grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 transition-colors hover:bg-[var(--preview-muted)]"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
          style={{ background: accent }}>
          {tokenInitial(row.tokenSymbol, row.tokenAddress)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--preview-text)" }}>
            {fmtAmount(row.amount, row.tokenDecimals)} {row.tokenSymbol ?? shortAddr(row.tokenAddress)}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--preview-text-3)" }}>
            <span style={{ color: accent }}>{meta?.name ?? row.protocol}</span>
            <span> · </span>
            {chain}
            <span> · </span>
            <span className="font-mono">{shortAddr(row.recipient)}</span>
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-[10px] uppercase tracking-wider font-bold"
            style={{ color: row.status === "active" ? "#0F8A8A" : "var(--preview-text-3)" }}>
            {row.status}
          </p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold" style={{ color: "var(--preview-text-2)" }}>
            {fmtDate(row.endTime)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
            in {relativeUntil(eventTime)}
          </p>
        </div>
      </Link>
      {/* Watch button — adds token to Token Watchlist without navigating */}
      <div className="pr-3 pl-1">
        <WatchButton
          tokenAddress={row.tokenAddress}
          chainId={row.chainId}
          tokenSymbol={row.tokenSymbol}
        />
      </div>
    </div>
  );
}

// ─── Wallet-mode results (positions for a single recipient) ───────────────

function WalletResults({
  rows, totalMatches, hiddenCount, isFree, walletAddress, ensHint, queryGiven, exportHref, portfolio,
}: {
  rows:          StreamRow[];
  totalMatches:  number;
  hiddenCount:   number;
  isFree:        boolean;
  walletAddress: string | null;
  ensHint:       string | null;
  queryGiven:    boolean;
  exportHref:    string;
  portfolio:     WalletPortfolioRow[];
}) {
  if (!queryGiven) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
          Paste a wallet address or ENS name above
        </p>
        <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
          Wallet mode shows every indexed vesting position for one recipient — across all 9 protocols.
        </p>
      </div>
    );
  }
  if (queryGiven && !walletAddress) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
          Couldn&rsquo;t resolve {ensHint ? `${ensHint}` : "that input"}
        </p>
        <p className="text-xs" style={{ color: "var(--preview-text-3)" }}>
          Try a 0x address, a Solana base58 pubkey, or a registered .eth name.
        </p>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
          No indexed vesting positions for this address yet.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>
          Track this wallet in your <Link href="/dashboard" className="underline">dashboard</Link> to live-scan all 9 protocols.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches} position{totalMatches === 1 ? "" : "s"} for{" "}
          <span className="font-mono normal-case" style={{ color: "var(--preview-text-2)" }}>
            {ensHint ?? shortAddr(walletAddress!)}
          </span>
        </p>
        {!isFree && (
          <a href={exportHref} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Export CSV
          </a>
        )}
      </div>
      {/* "Also vesting" smart-money strip — what other tokens does this
          wallet receive? Lets users spot whales / funds at a glance. The
          ≥2 gate stops it appearing for genuinely single-token recipients
          (where it would just restate the row below). */}
      {portfolio.length > 1 && (
        <div className="rounded-2xl border p-4 mb-3"
          style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--preview-text-3)" }}>
            Also vesting · {portfolio.length} distinct token{portfolio.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {portfolio.slice(0, 8).map((t) => (
              <Link
                key={`${t.chainId}-${t.tokenAddress.toLowerCase()}`}
                href={`/dashboard/explorer/token/${t.chainId}/${t.tokenAddress}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold hover:opacity-80 transition-opacity"
                style={{
                  background:   "var(--preview-muted)",
                  border:       "1px solid var(--preview-border)",
                  color:        "var(--preview-text)",
                }}
              >
                <span>{t.tokenSymbol ?? shortAddr(t.tokenAddress)}</span>
                {t.usdValue != null && (
                  <span className="tabular-nums" style={{ color: "var(--preview-text-3)" }}>
                    {formatUsdCompact(t.usdValue)}
                  </span>
                )}
              </Link>
            ))}
            {portfolio.length > 8 && (
              <span className="inline-flex items-center px-2 py-1 text-xs"
                style={{ color: "var(--preview-text-3)" }}>
                +{portfolio.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {rows.map((s, i) => (
          <StreamRowItem key={s.streamId} row={s} showTopBorder={i > 0} />
        ))}
      </div>
      {isFree && hiddenCount > 0 && (
        <UpgradeBanner
          title={`${hiddenCount} more position${hiddenCount === 1 ? "" : "s"} above your free limit`}
          body="Pro shows the full set + saved-search alerts when this wallet's next unlock is imminent."
        />
      )}
    </>
  );
}

// ─── Sub-components (small, local) ──────────────────────────────────────────

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: "var(--preview-text-3)" }}>
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

function FilterPill({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={
        active
          ? { background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.30)" }
          : { background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }
      }
    >
      {children}
    </Link>
  );
}

function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl px-5 py-10 text-center"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      <span className="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mb-3"
        style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
        Soon
      </span>
      <p className="text-base font-semibold mb-1" style={{ color: "var(--preview-text)" }}>{title}</p>
      <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>{body}</p>
    </div>
  );
}

function UpgradeBanner({
  title, body, ctaHref = "/pricing", ctaLabel = "Upgrade to Pro →",
}: {
  title:    string;
  body:     string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="mt-4 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{
        background: "linear-gradient(135deg, rgba(28,184,184,0.04), rgba(15,138,138,0.02))",
        border:     "1px solid rgba(28,184,184,0.20)",
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold mb-0.5" style={{ color: "var(--preview-text)" }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--preview-text-2)" }}>{body}</p>
      </div>
      <Link
        href={ctaHref}
        className="text-xs font-bold px-4 py-2 rounded-lg whitespace-nowrap"
        style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 8px rgba(28,184,184,0.3)" }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

// ─── URL / param helpers ────────────────────────────────────────────────────

// ── Wallet portfolio summary ──────────────────────────────────────────────
// One row per distinct (chain, token) pair this wallet vests, with the
// summed locked amount and a USD value when DexScreener gives us a price.
// Used by the "Also vesting" strip at the top of WalletResults.

interface WalletPortfolioRow {
  chainId:       number;
  tokenAddress:  string;
  tokenSymbol:   string | null;
  tokenDecimals: number;
  amountRaw:     string;     // stringified bigint
  usdValue:      number | null;
}

async function buildWalletPortfolio(rows: StreamRow[]): Promise<WalletPortfolioRow[]> {
  // Aggregate by (chainId, lower(tokenAddress)). Pure JS — `rows` already
  // came back from getStreamsByRecipient.
  const agg = new Map<string, {
    chainId:       number;
    tokenAddress:  string;
    tokenSymbol:   string | null;
    tokenDecimals: number;
    amount:        bigint;
  }>();
  for (const r of rows) {
    if (!r.tokenAddress) continue;
    // Active vests only — finished schedules aren't "still receiving".
    // StreamRow.status is the normalised flag (set by explorer-queries
    // from vestingStreamsCache.isFullyVested).
    if (r.status !== "active") continue;
    const key = `${r.chainId}:${r.tokenAddress.toLowerCase()}`;
    let amt = 0n;
    try { amt = BigInt(r.amount ?? "0"); } catch { /* keep 0n */ }
    const existing = agg.get(key);
    if (existing) {
      existing.amount += amt;
    } else {
      agg.set(key, {
        chainId:       r.chainId,
        tokenAddress:  r.tokenAddress,
        tokenSymbol:   r.tokenSymbol,
        tokenDecimals: r.tokenDecimals ?? 18,
        amount:        amt,
      });
    }
  }
  const list = [...agg.values()];
  if (list.length === 0) return [];

  // Price all of them in one DexScreener batch. Cap at 30 (DexScreener
  // batch size) — if a wallet vests > 30 distinct tokens, the tail won't
  // show USD but is still listed by raw amount.
  const priceMap = await getQuickUsdPrices(
    list.slice(0, 30).map((t) => ({ chainId: t.chainId, address: t.tokenAddress })),
  );

  const enriched: WalletPortfolioRow[] = list.map((t) => {
    const price = priceMap.get(`${t.chainId}:${t.tokenAddress.toLowerCase()}`);
    const usd   = toUsdValue(t.amount.toString(), t.tokenDecimals, price);
    return {
      chainId:       t.chainId,
      tokenAddress:  t.tokenAddress,
      tokenSymbol:   t.tokenSymbol,
      tokenDecimals: t.tokenDecimals,
      amountRaw:     t.amount.toString(),
      usdValue:      usd,
    };
  });

  // Sort: priced rows by USD desc; unpriced rows after, by raw amount
  // (cross-token comparison is approximate but at least deterministic).
  return enriched.sort((a, b) => {
    if (a.usdValue != null && b.usdValue != null) return b.usdValue - a.usdValue;
    if (a.usdValue != null) return -1;
    if (b.usdValue != null) return 1;
    const ar = BigInt(a.amountRaw), br = BigInt(b.amountRaw);
    return br > ar ? 1 : br < ar ? -1 : 0;
  });
}

function buildUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
}

function parseCsvNumbers(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

function parseCsvStrings(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function toggleCsvId(raw: string | undefined, id: number): string | undefined {
  const set = new Set(parseCsvNumbers(raw));
  if (set.has(id)) set.delete(id); else set.add(id);
  if (set.size === 0) return undefined;
  return Array.from(set).join(",");
}

function toggleCsvSlug(raw: string | undefined, slug: string): string | undefined {
  const set = new Set(parseCsvStrings(raw));
  if (set.has(slug)) set.delete(slug); else set.add(slug);
  if (set.size === 0) return undefined;
  return Array.from(set).join(",");
}

function expandProtocolsToAdapters(slugs: string[]): string[] {
  // UNCX is a single brand on the public side but two adapters under the hood.
  const out: string[] = [];
  for (const s of slugs) {
    if (s === "uncx") {
      out.push("uncx", "uncx-vm");
    } else {
      out.push(s);
    }
  }
  return out;
}

// ─── Formatting helpers (local — these mirror utilities from other pages
//     because pulling them in cross-cuts the dependency graph for one page) ──

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

function fmtDate(unix: number): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function relativeUntil(unix: number | null): string {
  if (!unix) return "—";
  const diff = Math.max(0, unix - Math.floor(Date.now() / 1000));
  if (diff < 60)      return `${diff}s`;
  if (diff < 3600)    return `${Math.floor(diff / 60)} min`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}
