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
//   - calendar mode: getExplorerPage() — one paginated indexed read off the rollup
//   - stream mode:   getStreamsForExplorer() (lightweight wrapper, this file)
//   - wallet mode:   /api/vesting (existing endpoint, called server-side)
//
// Tier gating: the page renders for everyone authed (free + pro + fund) but
// caps results for free users (50 per query, no multi-filter compose).
// Upgrade prompts appear inline when caps bite.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { getCurrentUserTier, type Tier } from "@/lib/auth/tier";
import type { WindowSlug } from "@/lib/vesting/unlock-windows";
import { type ExplorerSortKey } from "@/lib/vesting/token-rollups";
import { formatUsdCompact, getQuickUsdPrices, toUsdValue } from "@/lib/vesting/quick-prices";
import {
  getStreamsPage,
  getStreamsByRecipient,
  getStreamingStreams,
  type StreamRow,
  type StreamingRow,
  type StreamSortKey,
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
// Calendar/Upcoming mode is now a fully CLIENT-SIDE island: it loads the whole
// upcoming-unlock dataset once (CDN-cached) and filters/sorts/paginates in the
// browser — instant interactions, zero per-click round-trips. The old
// server-paginated ExplorerTable / ExplorerSliders are still used *inside* that
// island (in callback mode); the page no longer renders them directly for
// calendar mode. Stream/Wallet modes remain server-paginated.
import { Pagination } from "./Pagination";
import { ExplorerHelp } from "./ExplorerHelp";
import { ExplorerCalendarClient } from "./ExplorerCalendarClient";

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

// Amount + wallet/schedule/vested drill-down moved to range SLIDERS
// (ExplorerSliders) — min/max bounds on indexed rollup columns.

// Wallet/schedule/vested drill-down moved to range SLIDERS (ExplorerSliders),
// which filter the rollup-backed Upcoming list on indexed columns.

const DATE_FILTERS: Array<{ id: WindowSlug | "all"; label: string }> = [
  { id: "all",       label: "Any time" },
  { id: "today",     label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "30-days",   label: "Next 30 days" },
  { id: "90-days",   label: "Next 90 days" },
];

// Quick-lens presets live in <ExplorerCalendarClient> now (calendar mode is
// client-rendered). The old server-side LENSES array + <LensBar> were removed
// with the move.

// ─── Types ──────────────────────────────────────────────────────────────────

interface ExplorerSearchParams {
  q?:        string;
  mode?:     "calendar" | "stream" | "wallet" | "streaming";
  chain?:    string;   // comma-separated ids
  protocol?: string;   // comma-separated slugs
  date?:     string;   // window slug or "all"
  // Range drill-down sliders (min/max each). USD bounds replace the old amount pills.
  minWallets?: string; maxWallets?: string;
  minRounds?:  string; maxRounds?:  string;
  minVested?:  string; maxVested?:  string;   // 0–100
  usdMin?:     string; usdMax?:     string;   // locked value USD
  topMin?:     string; topMax?:     string;   // top-holder concentration 0–100
  cliff?:      string;                         // "1" = cliff unlocks only
  size?:       string;                         // page size: 25 | 50 | 100
  sort?:     string;   // calendar sort key (date | usd | amount | wallets | …)
  dir?:      string;   // "asc" | "desc"
  page?:     string;   // 1-based page number (calendar pagination)
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
  // Default to "Any time" so the explorer opens on the FULL browsable universe
  // (~5k tokens) rather than just the next 30 days (~1.3k) — the date pills
  // narrow it. (Was "30-days", which made the count look far short of the index.)
  const dateSlug = (sp.date ?? "all") as WindowSlug | "all";

  const chainIds = parseCsvNumbers(sp.chain);
  const protocols = parseCsvStrings(sp.protocol);
  // Range drill-down filters (dual sliders): each has an optional min AND max,
  // all backed by indexed rollup columns. USD bounds replace the old amount
  // pills. % vested is carried as 0–100 in the URL → 0–1 for SQL.
  const minWallets   = parsePosInt(sp.minWallets);
  const maxWallets   = parsePosInt(sp.maxWallets);
  const minRounds    = parsePosInt(sp.minRounds);
  const maxRounds    = parsePosInt(sp.maxRounds);
  const minVestedPct = parseVestedPct(sp.minVested);
  const maxVestedPct = parseVestedPct(sp.maxVested);
  const amountUsdMin = parsePosInt(sp.usdMin);
  const amountUsdMax = parsePosInt(sp.usdMax);
  const minTopHolder = parseVestedPct(sp.topMin);   // 0–100 → 0–1
  const maxTopHolder = parseVestedPct(sp.topMax);
  const cliffOnly    = sp.cliff === "1";

  const queryKind = query ? detectQueryKind(query) : { kind: "empty" as const };

  const adapterIds = protocols.length > 0
    ? expandProtocolsToAdapters(protocols)
    : undefined;

  // ── Mode-specific fetch ────────────────────────────────────────────────
  // Stream/Wallet modes fetch server-side here. CALENDAR mode does NOT — it's
  // rendered by <ExplorerCalendarClient>, which loads the whole upcoming-unlock
  // dataset once (CDN-cached) and filters/sorts/paginates in the browser.

  // Pagination + sort. For calendar these seed the client island's initial
  // state (from the URL, for shareable links); for stream/wallet they drive the
  // server query. Per-page size — user-selectable (25/50/100) via ?size=.
  const PAGE_SIZES = [25, 50, 100];
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : 25;
  const pageNum  = Math.max(1, Math.floor(Number(sp.page ?? "1")) || 1);
  const VALID_SORTS = new Set<ExplorerSortKey>(["date", "usd", "amount", "wallets", "concentration", "rounds", "cliff", "risk", "progress", "token"]);
  const sortKey: ExplorerSortKey = VALID_SORTS.has(sp.sort as ExplorerSortKey) ? (sp.sort as ExplorerSortKey) : "date";
  const sortDir: "asc" | "desc"  = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : (sortKey === "date" ? "asc" : "desc");

  // Stream/Wallet modes paginate per-stream (not per-token). They share the
  // ?page= param but have their own sort vocabulary (date/amount/next); default
  // soonest-ending first. Invalid/calendar-only sort keys fall back to "date".
  const STREAM_SORTS = new Set<StreamSortKey>(["date", "amount", "next"]);
  const streamSort: StreamSortKey = STREAM_SORTS.has(sp.sort as StreamSortKey) ? (sp.sort as StreamSortKey) : "date";
  const streamDir: "asc" | "desc" = sp.dir === "desc" ? "desc" : sp.dir === "asc" ? "asc" : (streamSort === "date" ? "asc" : "desc");

  let streamRows:    StreamRow[]   = [];
  let streamTotal = 0;
  let walletRows:    StreamRow[]   = [];
  let walletTotal = 0;
  let walletAddress: string | null = null;
  let walletEnsHint: string | null = null;
  let streamingRows:  StreamingRow[] = [];
  let streamingTotal = 0;

  if (mode === "streaming") {
    // Continuous per-second flows (LlamaPay) — no unlock events, so they live
    // outside the rollup/Schedules. Surfaced here as ongoing streams, newest
    // first. The protocol sidebar filter (if any) is intersected with the
    // continuous set inside the query.
    const { rows, total } = await getStreamingStreams({
      chainIds:    chainIds.length > 0 ? chainIds : undefined,
      protocolIds: protocols.length > 0 ? protocols : undefined,
    }, { page: pageNum, pageSize });
    streamingRows  = rows;
    streamingTotal = total;
  } else if (mode === "stream") {
    // Paginated server-side (25/page) so users browse EVERY matching schedule,
    // not the old ~1000-row cap. Symbol filter is applied in SQL so the count
    // is accurate.
    const { rows, total } = await getStreamsPage({
      chainIds:    chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      tokenSymbol: queryKind.kind === "symbol" ? queryKind.symbol : undefined,
      status:      "active",
    }, { page: pageNum, pageSize, sort: streamSort, dir: streamDir });
    streamRows  = rows;
    streamTotal = total;
  } else if (mode === "wallet") {
    // Resolve ENS to address if needed, then query streams keyed on recipient.
    if (queryKind.kind === "address") {
      walletAddress = queryKind.address;
    } else if (queryKind.kind === "ens") {
      walletEnsHint = queryKind.name;
      walletAddress = await resolveEnsName(queryKind.name);
    }
    if (walletAddress) {
      const { rows, total } = await getStreamsPage({
        recipient:  walletAddress,
        chainIds:   chainIds.length > 0 ? chainIds : undefined,
        adapterIds,
        status:     "any",
      }, { page: pageNum, pageSize, sort: streamSort, dir: streamDir });
      walletRows  = rows;
      walletTotal = total;
    }
  }

  // ── Wallet-mode portfolio summary ──────────────────────────────────────
  // "Smart money" signal: when a user lands on a wallet, tell them what else
  // this wallet is vesting. The list above is paginated (25 rows), but the
  // portfolio needs the wallet's WHOLE book to count distinct tokens — so we
  // pull a bounded full set (one wallet, capped at 1000 streams) just for the
  // aggregate. Distinct tokens per wallet is tiny even when stream count isn't.
  let walletPortfolio: WalletPortfolioRow[] = [];
  let walletAllRows: StreamRow[] = [];
  if (mode === "wallet" && walletAddress) {
    walletAllRows = await getStreamsByRecipient(walletAddress, {
      chainIds: chainIds.length > 0 ? chainIds : undefined,
      adapterIds,
      status:   "any",
      limit:    1000,
    });
    if (walletAllRows.length > 0) walletPortfolio = await buildWalletPortfolio(walletAllRows);
  }

  // Per-mode totals for the server-paginated Stream/Wallet pagers. Calendar's
  // totals are computed client-side inside <ExplorerCalendarClient>.
  const totalMatches = mode === "stream" ? streamTotal : mode === "wallet" ? walletTotal : mode === "streaming" ? streamingTotal : 0;
  const totalPages = Math.max(1, Math.ceil(totalMatches / pageSize));

  // Active-filter count for the free-tier multi-filter cap (Stream mode banner;
  // Calendar applies the same cap client-side).
  const activeFilters = [
    chainIds.length > 0 ? "chain" : null,
    protocols.length > 0 ? "protocol" : null,
    (amountUsdMin || amountUsdMax) ? "usd" : null,
    (minWallets || maxWallets) ? "wallets" : null,
    (minRounds || maxRounds) ? "rounds" : null,
    (minVestedPct != null || maxVestedPct != null) ? "vested" : null,
    dateSlug !== "all" ? "date" : null,
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
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
              Search the vesting explorer
            </h1>
            <ExplorerHelp />
          </div>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Query our index by wallet, ENS, token, or protocol. Filterable, shareable, and indexed across every supported chain.
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
            {(["calendar", "stream", "streaming"] as const).map((m) => {
              const active = mode === m;
              // Reset pagination + sort when switching lenses — page 7 of
              // Upcoming has no meaning in Schedules.
              const href = buildUrl({ ...sp, mode: m, page: undefined, sort: undefined, dir: undefined });
              const label = m === "calendar" ? "Upcoming" : m === "stream" ? "Schedules" : "Streaming";
              const tip = m === "calendar"
                ? "One row per token — which projects have unlocks coming up. Filterable + sortable."
                : m === "stream"
                ? "One row per individual vesting schedule (a single wallet's position)."
                : "Continuous per-second streams (e.g. LlamaPay payroll) — no fixed unlock, flows live.";
              return (
                <Link
                  key={m}
                  href={href}
                  title={tip}
                  className="px-4 py-2 text-sm font-semibold"
                  style={{
                    color: active ? "#0F8A8A" : "var(--preview-text-2)",
                    borderBottom: active ? "2px solid #0F8A8A" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {/* URL params (?mode=calendar|stream|streaming) kept stable so
                      existing links / SEO / saved searches don't break. */}
                  {label}
                </Link>
              );
            })}
          </div>
          <div className="pb-2 flex items-center gap-3">
            {/* Per-page size selector — server-nav for Stream/Wallet. Calendar
                mode renders its own (instant) per-page control client-side. */}
            {mode !== "calendar" && (
              <div className="hidden sm:flex items-center gap-1 text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                <span>Per page</span>
                {PAGE_SIZES.map((s) => (
                  <Link
                    key={s}
                    href={buildUrl({ ...sp, size: s === 25 ? undefined : String(s), page: undefined })}
                    className="px-1.5 py-0.5 rounded font-semibold transition-colors"
                    style={pageSize === s
                      ? { background: "#0F8A8A", color: "white" }
                      : { color: "var(--preview-text-2)" }}
                  >
                    {s}
                  </Link>
                ))}
              </div>
            )}
            <SaveSearchButton isPaid={!isFree} />
          </div>
        </div>

        {/* What each lens is — the two read the same index differently. */}
        <p className="text-[11px] mt-2" style={{ color: "var(--preview-text-3)" }}>
          {mode === "stream"
            ? "Schedules — one row per individual vesting position (a single wallet's stream). Use this to scan raw schedules."
            : mode === "wallet"
            ? "Wallet — every vesting position held by one recipient."
            : mode === "streaming"
            ? "Streaming — continuous per-second flows (LlamaPay payroll). These never “unlock”; they drip live, so we show streamed-so-far and the per-day rate."
            : "Upcoming — one row per token (all its wallets/rounds rolled up), sorted by next unlock. Filter + sort to find projects; switch to Schedules for the individual streams."}
        </p>

        {/* CALENDAR / Upcoming — fully client-side island: loads the dataset
            once (CDN-cached) and filters/sorts/paginates in-browser. Owns its
            own lenses, active-filter chips, per-page control, results table,
            and filter sidebar. The URL stays in sync (replaceState) so links
            remain shareable + re-hydrate this same view on a fresh load. */}
        {mode === "calendar" ? (
          <ExplorerCalendarClient
            isFree={isFree}
            initial={{
              q: query,
              date: dateSlug,
              chainIds,
              protocols,
              minWallets,
              maxWallets,
              minRounds,
              maxRounds,
              minVestedPct,
              maxVestedPct,
              usdMin: amountUsdMin,
              usdMax: amountUsdMax,
              minTopHolder,
              maxTopHolder,
              cliffOnly,
              sort: sortKey,
              dir: sortDir,
              page: pageNum,
              pageSize,
            }}
          />
        ) : (
          <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
            {/* Results */}
            <section>
              <ActiveFilters sp={sp} />
              {mode === "stream" && (
                <StreamResults
                  rows={streamRows}
                  totalMatches={totalMatches}
                  overFilterCap={overFilterCap}
                  page={pageNum}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  params={sp as Record<string, string | undefined>}
                />
              )}
              {mode === "wallet" && (
                <WalletResults
                  rows={walletRows}
                  statsRows={walletAllRows}
                  totalMatches={totalMatches}
                  walletAddress={walletAddress}
                  ensHint={walletEnsHint}
                  queryGiven={query.length > 0}
                  portfolio={walletPortfolio}
                  page={pageNum}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  params={sp as Record<string, string | undefined>}
                />
              )}
              {mode === "streaming" && (
                <StreamingResults
                  rows={streamingRows}
                  totalMatches={totalMatches}
                  page={pageNum}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  params={sp as Record<string, string | undefined>}
                />
              )}
            </section>

            {/* Filter sidebar (Stream/Wallet). Chain/protocol filters only —
                the slider drill-downs are Upcoming-only (they live in the
                calendar client island). */}
            <aside className="space-y-4 hidden md:block self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
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
              {(chainIds.length > 0 || protocols.length > 0 || dateSlug !== "all") && (
                <Link
                  href={buildUrl({ q: query, mode })}
                  className="block text-center text-xs font-semibold py-2 rounded-lg transition-colors"
                  style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
                >
                  Clear filters
                </Link>
              )}
            </aside>
          </div>
        )}
      </main>
  );
}

// ─── Stream-mode results (per-stream rows) ─────────────────────────────────

function StreamResults({
  rows, totalMatches, overFilterCap, page, totalPages, pageSize, params,
}: {
  rows:          StreamRow[];
  totalMatches:  number;
  overFilterCap: boolean;
  page:          number;
  totalPages:    number;
  pageSize:      number;
  params:        Record<string, string | undefined>;
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
          {totalMatches.toLocaleString()} schedule{totalMatches === 1 ? "" : "s"}
        </p>
        {totalPages > 1 && (
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Page {page} of {totalPages.toLocaleString()}</p>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {rows.map((s, i) => (
          <StreamRowItem key={s.streamId} row={s} showTopBorder={i > 0} />
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} total={totalMatches} pageSize={pageSize} rowsOnPage={rows.length} params={params} />
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

// ─── Streaming-mode results (continuous per-second flows) ───────────────────
// LlamaPay-style streams have no unlock event — they flow live. We show
// streamed-so-far + the per-day rate instead of a "next unlock" countdown.

/** tokens/day from a LlamaPay 20-decimal raw amountPerSec (÷1e20 × 86400). */
function ratePerDay(amountPerSecRaw: string | null): number | null {
  if (!amountPerSecRaw) return null;
  try { return (Number(BigInt(amountPerSecRaw)) / 1e20) * 86400; } catch { return null; }
}
function fmtRate(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 1)   return n.toFixed(2);
  if (n > 0)    return n.toFixed(4);
  return "0";
}

function StreamingResults({
  rows, totalMatches, page, totalPages, pageSize, params,
}: {
  rows:         StreamingRow[];
  totalMatches: number;
  page:         number;
  totalPages:   number;
  pageSize:     number;
  params:       Record<string, string | undefined>;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl px-5 py-10 text-center"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>No continuous streams match your filters.</p>
        <p className="text-xs mt-1" style={{ color: "var(--preview-text-3)" }}>
          Streaming covers per-second flows like LlamaPay payroll. Try clearing the chain filter.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          {totalMatches.toLocaleString()} live stream{totalMatches === 1 ? "" : "s"}
        </p>
        {totalPages > 1 && (
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Page {page} of {totalPages.toLocaleString()}</p>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {rows.map((s, i) => (
          <StreamingRowItem key={s.streamId} row={s} showTopBorder={i > 0} />
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} total={totalMatches} pageSize={pageSize} rowsOnPage={rows.length} params={params} />
    </>
  );
}

function StreamingRowItem({ row, showTopBorder }: { row: StreamingRow; showTopBorder: boolean }) {
  const meta   = getProtocol(row.protocol);
  const accent = meta?.color ?? "#64748b";
  const chain  = CHAIN_NAMES[row.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${row.chainId}`;
  const sym    = row.tokenSymbol ?? shortAddr(row.tokenAddress);
  const rate   = ratePerDay(row.amountPerSecRaw);
  return (
    <div className="flex items-center"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}>
      <Link
        href={`/dashboard/explorer/token/${row.chainId}/${row.tokenAddress}`}
        className="flex-1 grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 transition-colors hover:bg-[var(--preview-muted)]"
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-[11px] flex-shrink-0"
          style={{ background: accent }}>
          {tokenInitial(row.tokenSymbol, row.tokenAddress)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: "var(--preview-text)" }}>
            {fmtAmount(row.streamedAmount, row.tokenDecimals)} {sym} <span className="font-normal" style={{ color: "var(--preview-text-3)" }}>streamed</span>
          </p>
          <p className="text-xs truncate" style={{ color: "var(--preview-text-3)" }}>
            <span style={{ color: accent }}>{meta?.name ?? row.protocol}</span>
            <span> · </span>
            {chain}
            <span> · </span>
            <span className="font-mono">{shortAddr(row.recipient)}</span>
          </p>
        </div>
        {/* Flow rate — the whole point of a stream */}
        <div className="text-right">
          <p className="text-xs font-semibold tabular-nums" style={{ color: "#0F8A8A" }}>
            {rate != null ? `≈ ${fmtRate(rate)} ${sym}/day` : "live"}
          </p>
        </div>
        {/* Started (desktop) */}
        <div className="text-right hidden md:block">
          <p className="text-xs font-semibold" style={{ color: "var(--preview-text-2)" }}>
            {row.startTime ? `since ${fmtDate(row.startTime)}` : "—"}
          </p>
        </div>
      </Link>
      <div className="pr-3 pl-1">
        <WatchButton tokenAddress={row.tokenAddress} chainId={row.chainId} tokenSymbol={row.tokenSymbol} />
      </div>
    </div>
  );
}

// ─── Wallet analytics panel ──────────────────────────────────────────────
// Stats for the wallet-mode view: locked value, token/protocol/chain spread,
// and a holdings-by-USD breakdown. This is the "what kind of wallet is this"
// signal — derived entirely from the streams + priced portfolio we already
// loaded. Scope is intentionally the wallet's VESTING book (not its whole
// token balance, which we don't index).

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--preview-text-3)" }}>{label}</p>
      <p className="text-base font-bold tabular-nums" style={{ color: "var(--preview-text)" }}>{value}</p>
    </div>
  );
}

function WalletStats({ rows, portfolio }: { rows: StreamRow[]; portfolio: WalletPortfolioRow[] }) {
  // uncx-vm is a hidden sub-protocol of uncx — collapse so the breakdown
  // matches what users see elsewhere.
  const norm = (p: string) => (p === "uncx-vm" ? "uncx" : p);

  const totalUsd   = portfolio.reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const protoSet   = new Set(rows.map((r) => norm(r.protocol)));
  const chainSet   = new Set(rows.map((r) => r.chainId));

  const byProto = new Map<string, number>();
  for (const r of rows) byProto.set(norm(r.protocol), (byProto.get(norm(r.protocol)) ?? 0) + 1);
  const protoEntries = [...byProto.entries()].sort((a, b) => b[1] - a[1]);

  const topHoldings = portfolio
    .filter((t) => (t.usdValue ?? 0) > 0)
    .sort((a, b) => (b.usdValue! - a.usdValue!))
    .slice(0, 5);

  return (
    <div className="rounded-2xl border p-4 mb-3" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatTile label="Locked value" value={totalUsd > 0 ? formatUsdCompact(totalUsd) : "—"} />
        <StatTile label="Distinct tokens" value={String(portfolio.length)} />
        <StatTile label="Protocols" value={String(protoSet.size)} />
        <StatTile label="Chains" value={String(chainSet.size)} />
      </div>

      {topHoldings.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--preview-text-3)" }}>Holdings by value</p>
          <div className="flex flex-col gap-1.5">
            {topHoldings.map((t) => {
              const pct = totalUsd > 0 ? (t.usdValue! / totalUsd) * 100 : 0;
              return (
                <div key={`${t.chainId}-${t.tokenAddress.toLowerCase()}`} className="flex items-center gap-2">
                  <span className="text-xs font-semibold w-16 truncate flex-shrink-0" style={{ color: "var(--preview-text-2)" }}>
                    {t.tokenSymbol ?? shortAddr(t.tokenAddress)}
                  </span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--preview-muted)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: "#1CB8B8" }} />
                  </div>
                  <span className="text-[11px] tabular-nums w-16 text-right flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>
                    {formatUsdCompact(t.usdValue!)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--preview-text-3)" }}>By protocol</p>
        <div className="flex flex-wrap gap-1.5">
          {protoEntries.map(([p, n]) => {
            const meta = getProtocol(p);
            return (
              <span key={p} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border)" }}>
                <span style={{ color: meta?.color ?? "var(--preview-text-2)" }}>{meta?.name ?? p}</span>
                <span style={{ color: "var(--preview-text-3)" }}>{n}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Wallet-mode results (positions for a single recipient) ───────────────

function WalletResults({
  rows, statsRows, totalMatches, walletAddress, ensHint, queryGiven, portfolio,
  page, totalPages, pageSize, params,
}: {
  rows:          StreamRow[];
  /** The wallet's WHOLE position set (bounded fetch) — drives the stats
   *  panel so protocol/chain spread reflects everything, not just this page. */
  statsRows:     StreamRow[];
  totalMatches:  number;
  walletAddress: string | null;
  ensHint:       string | null;
  queryGiven:    boolean;
  portfolio:     WalletPortfolioRow[];
  page:          number;
  totalPages:    number;
  pageSize:      number;
  params:        Record<string, string | undefined>;
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
          {totalMatches.toLocaleString()} position{totalMatches === 1 ? "" : "s"} for{" "}
          <span className="font-mono normal-case" style={{ color: "var(--preview-text-2)" }}>
            {ensHint ?? shortAddr(walletAddress!)}
          </span>
        </p>
        {totalPages > 1 && (
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>Page {page} of {totalPages.toLocaleString()}</p>
        )}
      </div>
      {/* Wallet analytics — locked value, distinct tokens, protocol/chain
          spread, and holdings-by-USD. Built from the wallet's WHOLE book
          (statsRows), not just the current page, so the spread is accurate. */}
      {statsRows.length > 1 && <WalletStats rows={statsRows} portfolio={portfolio} />}

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
      <Pagination page={page} totalPages={totalPages} total={totalMatches} pageSize={pageSize} rowsOnPage={rows.length} params={params} />
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

// Active-filter chip bar — shows every applied filter as a removable chip
// (✕ link clears just that one) plus a "Clear all". Gives a one-glance view
// of what's narrowing the results + one-click reset, which the filter pills
// in the sidebar didn't surface.
function ActiveFilters({ sp }: { sp: ExplorerSearchParams }) {
  // Range chip: "30–50 wallets", "≥30 …", "≤50 …". Clears BOTH bounds.
  const rangeChip = (
    minRaw: string | undefined, maxRaw: string | undefined,
    keyMin: string, keyMax: string, noun: string,
    fmt: (n: number) => string = (n) => `${n}`,
  ): { keys: string[]; label: string } | null => {
    const lo = minRaw ? Number(minRaw) : null;
    const hi = maxRaw ? Number(maxRaw) : null;
    if (lo == null && hi == null) return null;
    const label = lo != null && hi != null ? `${fmt(lo)}–${fmt(hi)} ${noun}`
      : lo != null ? `≥${fmt(lo)} ${noun}` : `≤${fmt(hi!)} ${noun}`;
    return { keys: [keyMin, keyMax], label };
  };
  const fmtUsd = (n: number) => n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`;

  const chips: Array<{ keys: string[]; label: string }> = [];
  if (sp.q)        chips.push({ keys: ["q"],        label: `“${sp.q}”` });
  if (sp.chain)    { const n = sp.chain.split(",").length;    chips.push({ keys: ["chain"],    label: `${n} chain${n > 1 ? "s" : ""}` }); }
  if (sp.protocol) { const n = sp.protocol.split(",").length; chips.push({ keys: ["protocol"], label: `${n} protocol${n > 1 ? "s" : ""}` }); }
  if (sp.date)     chips.push({ keys: ["date"],    label: DATE_FILTERS.find((d) => d.id === sp.date)?.label ?? "Date" });
  const ranges = [
    rangeChip(sp.usdMin, sp.usdMax, "usdMin", "usdMax", "locked", fmtUsd),
    rangeChip(sp.minWallets, sp.maxWallets, "minWallets", "maxWallets", "wallets"),
    rangeChip(sp.minRounds, sp.maxRounds, "minRounds", "maxRounds", "schedules"),
    rangeChip(sp.minVested, sp.maxVested, "minVested", "maxVested", "vested", (n) => `${n}%`),
    rangeChip(sp.topMin, sp.topMax, "topMin", "topMax", "top holder", (n) => `${n}%`),
  ].filter(Boolean) as Array<{ keys: string[]; label: string }>;
  chips.push(...ranges);
  if (sp.cliff === "1") chips.push({ keys: ["cliff"], label: "Cliff unlocks" });
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      <span className="text-[10px] font-bold uppercase tracking-wider mr-0.5" style={{ color: "var(--preview-text-3)" }}>Filters</span>
      {chips.map((c) => (
        <Link
          key={c.keys.join("-")}
          href={buildUrl({ ...sp, ...Object.fromEntries(c.keys.map((k) => [k, undefined])) })}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors hover:brightness-105"
          style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}
        >
          {c.label}
          <span aria-hidden style={{ opacity: 0.65 }}>✕</span>
        </Link>
      ))}
      <Link
        href={buildUrl({ mode: sp.mode })}
        className="text-[11px] font-semibold px-2 py-1 rounded-full transition-colors hover:underline"
        style={{ color: "var(--preview-text-3)" }}
      >
        Clear all
      </Link>
    </div>
  );
}

// (toExplorerRow moved into ExplorerCalendarClient — the rollup→row mapping now
// happens client-side off the compact dataset.)

function parseCsvNumbers(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

function parseCsvStrings(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Slider params → query values. Undefined when absent/zero so an inactive
// slider adds no SQL predicate.
function parsePosInt(raw: string | undefined): number | undefined {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function parseVestedPct(raw: string | undefined): number | undefined {
  const n = Number(raw);                       // URL carries 0–100
  return Number.isFinite(n) && n > 0 ? Math.min(1, n / 100) : undefined;
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
