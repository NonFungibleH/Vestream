"use client";

// src/app/dashboard/explorer/ExplorerCalendarClient.tsx
// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE Vesting Explorer (Upcoming / calendar mode). Loads the WHOLE
// upcoming-unlock universe ONCE (compact, CDN-cached ~0.4MB gzip over ~6.7k
// tokens) and then does ALL filtering / sorting / pagination in the browser —
// zero round-trips per interaction, so every filter tweak, sort, and page turn
// is instant. This replaced the force-dynamic server-paginated page, which
// re-queried Postgres on every change (the explorer reads searchParams, so it
// can never be CDN-cached; even a 40ms query is a full network round-trip plus
// an RSC re-render per click).
//
// The URL stays the source of truth for SHAREABILITY: state initialises from
// the URL params the server parsed, and every change writes back via
// history.replaceState (no navigation). A shared link re-hydrates the exact
// same view server-side on first load, then this component takes over.
//
// Trade-off (accepted by the user — "speed is most important"): a larger
// one-time initial payload + data that can be a few minutes stale (bounded by
// the rollup cron + the 5-min CDN cache). Rows render only the current page
// (25/50/100), so no virtualization is needed.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { listProtocols } from "@/lib/protocol-constants";
import { detectQueryKind } from "./detect-query";
import { ExplorerTable, type ExplorerRow } from "./ExplorerTable";
import { ExplorerSliders } from "./ExplorerSliders";
import type { ExplorerDatasetRow, ExplorerSortKey } from "@/lib/vesting/token-rollups";
import type { WindowSlug } from "@/lib/vesting/unlock-windows";

// ── Constants (mirror page.tsx; duplicated so this client island is self-
//    contained and the server page stays free of client-only state) ───────────
const FREE_TIER_FILTER_CAP = 1;
const PAGE_SIZES = [25, 50, 100];
const SEC_DAY = 86400;

const CHAIN_FILTERS: ReadonlyArray<{ id: number; label: string }> = [
  { id: 1,    label: "Ethereum"  },
  { id: 8453, label: "Base"      },
  { id: 56,   label: "BNB Chain" },
  { id: 137,  label: "Polygon"   },
  { id: 101,  label: "Solana"    },
];

const DATE_FILTERS: Array<{ id: WindowSlug | "all"; label: string }> = [
  { id: "all",       label: "Any time" },
  { id: "today",     label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "30-days",   label: "Next 30 days" },
  { id: "90-days",   label: "Next 90 days" },
];

// One-click curated views — each REPLACES the current filters with a useful
// preset (matches LENSES in page.tsx; values are 0–100 for the % fields here
// since this component carries percentages, not 0–1 fractions).
const LENSES: Array<{ id: string; label: string; hint: string; apply: Partial<State> }> = [
  { id: "imminent-cliffs",  label: "Imminent cliffs",  hint: "Cliff lumps unlocking in the next 30 days",
    apply: { cliffOnly: true, date: "30-days", sort: "usd", dir: "desc" } },
  { id: "whale-controlled", label: "Whale-controlled", hint: "One wallet holds ≥50% of the lock — across ≥5 recipients (excludes single-recipient tokens)",
    apply: { topMin: 50, minWallets: 5, sort: "concentration", dir: "desc" } },
  { id: "fair-launches",    label: "Fair launches",    hint: "Spread across ≥25 wallets, no dominant holder (≤25%)",
    apply: { minWallets: 25, topMax: 25, sort: "wallets", dir: "desc" } },
  { id: "almost-done",      label: "Almost done",      hint: "≥90% of the vesting span already elapsed",
    apply: { minVested: 90, sort: "progress", dir: "desc" } },
  { id: "biggest-overhang", label: "Biggest overhang", hint: "Largest locked value vs market cap",
    apply: { sort: "risk", dir: "desc" } },
];

// ── State ─────────────────────────────────────────────────────────────────────
// % fields (minVested/maxVested/topMin/topMax) are carried as 0–100 here (the
// URL convention); USD + counts are absolute. `undefined` = that bound is open.
interface State {
  q:          string;
  date:       WindowSlug | "all";
  chainIds:   number[];
  protocols:  string[];
  minWallets?: number; maxWallets?: number;
  minRounds?:  number; maxRounds?:  number;
  minVested?:  number; maxVested?:  number;   // 0–100
  usdMin?:     number; usdMax?:     number;
  topMin?:     number; topMax?:     number;   // 0–100
  cliffOnly:  boolean;
  sort:       ExplorerSortKey;
  dir:        "asc" | "desc";
  page:       number;
  pageSize:   number;
}

// Initial state handed down by the server page (already parsed; % fields as 0–1).
export interface ExplorerInitialState {
  q:            string;
  date:         WindowSlug | "all";
  chainIds:     number[];
  protocols:    string[];
  minWallets?:  number; maxWallets?: number;
  minRounds?:   number; maxRounds?:  number;
  minVestedPct?: number; maxVestedPct?: number;  // 0–1
  usdMin?:      number; usdMax?: number;
  minTopHolder?: number; maxTopHolder?: number;  // 0–1
  cliffOnly:    boolean;
  sort:         ExplorerSortKey;
  dir:          "asc" | "desc";
  page:         number;
  pageSize:     number;
}

function fromInitial(i: ExplorerInitialState): State {
  const pct = (v: number | undefined) => (v != null ? Math.round(v * 100) : undefined);
  return {
    q: i.q, date: i.date, chainIds: i.chainIds, protocols: i.protocols,
    minWallets: i.minWallets, maxWallets: i.maxWallets,
    minRounds: i.minRounds, maxRounds: i.maxRounds,
    minVested: pct(i.minVestedPct), maxVested: pct(i.maxVestedPct),
    usdMin: i.usdMin, usdMax: i.usdMax,
    topMin: pct(i.minTopHolder), topMax: pct(i.maxTopHolder),
    cliffOnly: i.cliffOnly, sort: i.sort, dir: i.dir, page: i.page, pageSize: i.pageSize,
  };
}

// ── Dataset loader (module-scoped cache so re-mounts / tab switches reuse it) ──
let datasetCache: ExplorerDatasetRow[] | null = null;
let datasetPromise: Promise<ExplorerDatasetRow[]> | null = null;

function loadDataset(): Promise<ExplorerDatasetRow[]> {
  if (datasetCache) return Promise.resolve(datasetCache);
  if (!datasetPromise) {
    // credentials:"omit" → no cookie → the CDN can actually serve the cached
    // copy (cookied requests bypass the cache). The route needs no auth.
    datasetPromise = fetch("/api/dashboard/explorer/dataset", { credentials: "omit" })
      .then((r) => r.json())
      .then((j: { rows?: ExplorerDatasetRow[] }) => { datasetCache = j.rows ?? []; return datasetCache; })
      .catch(() => { datasetPromise = null; return []; });
  }
  return datasetPromise;
}

// ── Pure filter/sort helpers ──────────────────────────────────────────────────
function windowEnd(date: WindowSlug | "all", now: number): number {
  switch (date) {
    case "today":     return now + SEC_DAY;
    case "this-week": return now + 7 * SEC_DAY;   // approx (server uses end-of-week)
    case "30-days":   return now + 30 * SEC_DAY;
    case "90-days":   return now + 90 * SEC_DAY;
    default:          return now + 100 * 365 * SEC_DAY; // "all"
  }
}

// UNCX is one brand but two adapters under the hood.
function expandProtocols(slugs: string[]): string[] {
  const out: string[] = [];
  for (const s of slugs) { if (s === "uncx") out.push("uncx", "uncx-vm"); else out.push(s); }
  return out;
}

/** Fraction (0–1) of the token's vesting span elapsed, or null if no valid span. */
function vestedFrac(row: ExplorerDatasetRow, now: number): number | null {
  const s = row.fs, e = row.le;
  if (s == null || e == null || e <= s) return null;
  return Math.max(0, Math.min(1, (now - s) / (e - s)));
}

function matchRow(
  row: ExplorerDatasetRow, st: State, endSec: number, now: number,
  adapterIds: string[], symbol: string | null,
): boolean {
  if (row.n == null || row.n < now || row.n > endSec) return false;
  if (symbol != null && (row.s ?? "").toLowerCase() !== symbol) return false;
  if (st.chainIds.length > 0 && !st.chainIds.includes(row.c)) return false;
  if (adapterIds.length > 0 && !row.p.some((p) => adapterIds.includes(p))) return false;
  // USD — a bound requires a known price (null can't be "in range").
  if (st.usdMin != null && (row.u == null || row.u < st.usdMin)) return false;
  if (st.usdMax != null && (row.u == null || row.u > st.usdMax)) return false;
  if (st.minWallets != null && row.w < st.minWallets) return false;
  if (st.maxWallets != null && row.w > st.maxWallets) return false;
  if (st.minRounds  != null && row.r < st.minRounds)  return false;
  if (st.maxRounds  != null && row.r > st.maxRounds)  return false;
  if (st.minVested != null || st.maxVested != null) {
    const f = vestedFrac(row, now);
    if (f == null) return false;
    const pct = f * 100;
    if (st.minVested != null && pct < st.minVested) return false;
    if (st.maxVested != null && pct > st.maxVested) return false;
  }
  if (st.topMin != null && (row.t == null || row.t * 100 < st.topMin)) return false;
  if (st.topMax != null && (row.t == null || row.t * 100 > st.topMax)) return false;
  if (st.cliffOnly && row.cl !== 1) return false;
  return true;
}

function sortValue(row: ExplorerDatasetRow, key: ExplorerSortKey, now: number): number | string | null {
  switch (key) {
    case "usd":           return row.u;
    case "amount":        { try { return Number(BigInt(row.amt)); } catch { return 0; } }
    case "wallets":       return row.w;
    // Single-recipient tokens are tautologically 100% concentrated — push them
    // last so sorting surfaces genuine multi-holder concentration.
    case "concentration": return row.w <= 1 ? null : row.t;
    case "rounds":        return row.r;
    case "cliff":         return row.cl;
    case "risk":          return row.u != null && row.mc && row.mc > 0 ? row.u / row.mc : null;
    case "progress":      return vestedFrac(row, now);
    case "token":         return row.s ? row.s.toLowerCase() : null;
    case "date":
    default:              return row.n;
  }
}

function parseCurve(cv: string | null): number[] | null {
  if (!cv) return null;
  const arr = cv.split(",").map((s) => Number(s)).filter((n) => Number.isFinite(n));
  return arr.length >= 2 ? arr : null;
}

function toRow(row: ExplorerDatasetRow): ExplorerRow {
  const marketCapShare = row.u != null && row.mc && row.mc > 0 ? row.u / row.mc : null;
  return {
    groupKey:         `${row.c}:${row.a.toLowerCase()}`,
    protocol:         row.p[0] ?? "",
    protocolCount:    row.p.length,
    chainId:          row.c,
    tokenSymbol:      row.s,
    tokenAddress:     row.a,
    tokenDecimals:    row.d,
    amount:           row.amt,
    usdValue:         row.u,
    usdConfidence:    null,
    walletCount:      row.w,
    tokenWalletCount: row.w,
    tokenRoundCount:  row.r,
    vestStart:        row.fs,
    vestEnd:          row.le,
    hasCliff:         row.cl === 1,
    topHolderShare:   row.t,
    unlockCurve:      parseCurve(row.cv),
    eventTime:        row.n ?? 0,
    absorptionRatio:  null,
    marketCapShare,
  };
}

// Build the shareable query string the SERVER re-parses on a fresh load.
function toQueryString(st: State): string {
  const p = new URLSearchParams();
  p.set("mode", "calendar");
  const put = (k: string, v: string | number | undefined | null) => {
    if (v != null && v !== "" && v !== 0) p.set(k, String(v));
  };
  if (st.q) p.set("q", st.q);
  if (st.date !== "all") p.set("date", st.date);
  if (st.chainIds.length) p.set("chain", st.chainIds.join(","));
  if (st.protocols.length) p.set("protocol", st.protocols.join(","));
  put("minWallets", st.minWallets); put("maxWallets", st.maxWallets);
  put("minRounds", st.minRounds);   put("maxRounds", st.maxRounds);
  put("minVested", st.minVested);   put("maxVested", st.maxVested);
  put("usdMin", st.usdMin);         put("usdMax", st.usdMax);
  put("topMin", st.topMin);         put("topMax", st.topMax);
  if (st.cliffOnly) p.set("cliff", "1");
  if (st.pageSize !== 25) p.set("size", String(st.pageSize));
  if (st.sort !== "date") p.set("sort", st.sort);
  if (st.dir) p.set("dir", st.dir);
  if (st.page > 1) p.set("page", String(st.page));
  return p.toString();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ExplorerCalendarClient({
  initial, isFree,
}: {
  initial: ExplorerInitialState;
  isFree:  boolean;
}) {
  const [state, setState] = useState<State>(() => fromInitial(initial));
  const [dataset, setDataset] = useState<ExplorerDatasetRow[] | null>(datasetCache);
  // "now" lives in state (not a bare Date.now() in render — that's impure and
  // makes the filter memo non-idempotent). Lazy-initialised once, then
  // refreshed each minute so date-window filters + relative-time labels stay
  // current in a long session. Hydration-safe: both SSR and the client's first
  // paint render the skeleton (dataset is null until the browser fetch lands),
  // so `now` never affects server-vs-client markup.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Load the dataset once (cached module-side across re-mounts).
  useEffect(() => {
    let live = true;
    loadDataset().then((d) => { if (live) setDataset(d); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);

  // Reflect state in the URL for shareability — no navigation (replaceState).
  useEffect(() => {
    const qs = toQueryString(state);
    window.history.replaceState(null, "", qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer");
  }, [state]);

  // Any filter/sort change merges + resets to page 1; pagination sets page only.
  const update = (partial: Partial<State>) =>
    setState((s) => ({ ...s, ...partial, page: partial.page ?? 1 }));
  const applyLens = (apply: Partial<State>) =>
    // A lens REPLACES filters — start from a clean slate, keep the search query.
    setState({
      q: state.q, date: "all", chainIds: [], protocols: [], cliffOnly: false,
      sort: "date", dir: "desc", page: 1, pageSize: state.pageSize, ...apply,
    });
  const reset = (keepQ: boolean) =>
    setState({
      q: keepQ ? state.q : "", date: "all", chainIds: [], protocols: [], cliffOnly: false,
      sort: "date", dir: "asc", page: 1, pageSize: state.pageSize,
    });

  // Filter → sort → paginate, entirely in-memory.
  const { pageRows, totalMatches } = useMemo(() => {
    if (!dataset) return { pageRows: [] as ExplorerRow[], totalMatches: 0 };
    const endSec = windowEnd(state.date, now);
    const adapterIds = expandProtocols(state.protocols);
    const qk = state.q ? detectQueryKind(state.q) : null;
    const symbol = qk?.kind === "symbol" ? qk.symbol.toLowerCase() : null;

    const filtered = dataset.filter((row) => matchRow(row, state, endSec, now, adapterIds, symbol));
    filtered.sort((a, b) => {
      const va = sortValue(a, state.sort, now), vb = sortValue(b, state.sort, now);
      const na = va == null, nb = vb == null;
      if (na || nb) {
        if (na && nb) return (a.n ?? Infinity) - (b.n ?? Infinity);   // both null → tie-break
        return na ? 1 : -1;                                            // nulls last
      }
      let c = typeof va === "string" ? (va < vb! ? -1 : va > vb! ? 1 : 0) : (va - (vb as number));
      if (state.dir === "desc") c = -c;
      return c !== 0 ? c : (a.n ?? Infinity) - (b.n ?? Infinity);      // secondary: next-unlock ASC
    });

    const start = (state.page - 1) * state.pageSize;
    return {
      pageRows: filtered.slice(start, start + state.pageSize).map(toRow),
      totalMatches: filtered.length,
    };
  }, [dataset, state, now]);

  const totalPages = Math.max(1, Math.ceil(totalMatches / state.pageSize));
  const page = Math.min(state.page, totalPages);

  // Free-tier multi-filter cap (mirrors page.tsx activeFilters / overFilterCap).
  const activeFilterCount = [
    state.chainIds.length > 0,
    state.protocols.length > 0,
    state.usdMin != null || state.usdMax != null,
    state.minWallets != null || state.maxWallets != null,
    state.minRounds != null || state.maxRounds != null,
    state.minVested != null || state.maxVested != null,
    state.date !== "all",
  ].filter(Boolean).length;
  const overFilterCap = isFree && activeFilterCount > FREE_TIER_FILTER_CAP;

  const hasAnyFilter =
    state.chainIds.length > 0 || state.protocols.length > 0 || state.usdMin != null || state.usdMax != null ||
    state.minWallets != null || state.maxWallets != null || state.minRounds != null || state.maxRounds != null ||
    state.minVested != null || state.maxVested != null || state.topMin != null || state.topMax != null ||
    state.cliffOnly || state.date !== "all";

  const lensActive = (apply: Partial<State>) =>
    (Object.keys(apply) as (keyof State)[]).every((k) => state[k] === apply[k]);

  return (
    <>
      {/* Quick lenses */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider mr-0.5" style={{ color: "var(--preview-text-3)" }}>Quick lenses</span>
        {LENSES.map((lens) => {
          const active = lensActive(lens.apply);
          return (
            <div key={lens.id} className="relative group">
              <button
                type="button"
                onClick={() => applyLens(lens.apply)}
                className="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all"
                style={active
                  ? { background: "#0F8A8A", color: "white", border: "1px solid #0F8A8A" }
                  : { background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
              >
                {lens.label}
              </button>
              <div className="hidden group-hover:block absolute left-0 top-full mt-1.5 z-40 w-56 rounded-lg p-2.5 shadow-lg pointer-events-none"
                style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
                <p className="text-[11px] font-bold mb-0.5" style={{ color: "var(--preview-text)" }}>{lens.label}</p>
                <p className="text-[11px] leading-snug" style={{ color: "var(--preview-text-2)" }}>{lens.hint}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
        {/* Results */}
        <section>
          <ActiveChips state={state} update={update} reset={reset} />

          {overFilterCap ? (
            <UpgradeBanner
              title="Combine multiple filters with Pro"
              body="Free accounts can filter by one dimension at a time. Pro lets you stack chain + protocol + amount + date for surgical queries."
            />
          ) : dataset == null ? (
            <DatasetSkeleton />
          ) : (
            <>
              {/* Per-page selector */}
              <div className="flex items-center justify-end gap-1 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
                <span>Per page</span>
                {PAGE_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update({ pageSize: s })}
                    className="px-1.5 py-0.5 rounded font-semibold transition-colors"
                    style={state.pageSize === s ? { background: "#0F8A8A", color: "white" } : { color: "var(--preview-text-2)" }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <ExplorerTable
                rows={pageRows}
                totalMatches={totalMatches}
                page={page}
                totalPages={totalPages}
                pageSize={state.pageSize}
                sort={state.sort}
                dir={state.dir}
                params={{}}
                onSort={(col, dir) => update({ sort: col as ExplorerSortKey, dir })}
                onPage={(p) => setState((s) => ({ ...s, page: p }))}
                onClear={() => reset(true)}
              />
            </>
          )}
        </section>

        {/* Filter sidebar */}
        <aside className="space-y-4 hidden md:block self-start sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto pr-1">
          <FilterGroup label="Chain">
            {CHAIN_FILTERS.map((c) => (
              <FilterPill key={c.id} active={state.chainIds.includes(c.id)}
                onClick={() => update({ chainIds: toggle(state.chainIds, c.id) })}>
                {c.label}
              </FilterPill>
            ))}
          </FilterGroup>
          <FilterGroup label="Protocol">
            {listProtocols().map((p) => (
              <FilterPill key={p.slug} active={state.protocols.includes(p.slug)}
                onClick={() => update({ protocols: toggle(state.protocols, p.slug) })}>
                {p.name}
              </FilterPill>
            ))}
          </FilterGroup>
          <FilterGroup label="Date range">
            {DATE_FILTERS.map((d) => (
              <FilterPill key={d.id} active={state.date === d.id}
                onClick={() => update({ date: d.id })}>
                {d.label}
              </FilterPill>
            ))}
          </FilterGroup>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold mb-2.5" style={{ color: "var(--preview-text-3)" }}>
              Drill down
            </p>
            {/* key re-seeds the (uncontrolled) slider handles whenever the
                values change from OUTSIDE a drag — a lens, "Clear", or removing
                a chip. The key only flips on a committed value, never mid-drag
                (drag updates internal state only), so it can't interrupt a
                drag. */}
            <ExplorerSliders
              key={[state.minWallets, state.maxWallets, state.minRounds, state.maxRounds,
                    state.minVested, state.maxVested, state.usdMin, state.usdMax,
                    state.topMin, state.topMax].join("|")}
              params={{}}
              minWallets={state.minWallets} maxWallets={state.maxWallets}
              minRounds={state.minRounds}   maxRounds={state.maxRounds}
              minVested={state.minVested}   maxVested={state.maxVested}
              usdMin={state.usdMin}         usdMax={state.usdMax}
              topMin={state.topMin}         topMax={state.topMax}
              onCommit={(delta) => update(deltaToState(delta))}
            />
            <div className="mt-3">
              <FilterPill active={state.cliffOnly} onClick={() => update({ cliffOnly: !state.cliffOnly })}>
                Cliff unlocks only
              </FilterPill>
            </div>
          </div>
          {hasAnyFilter && (
            <button
              type="button"
              onClick={() => reset(true)}
              className="block w-full text-center text-xs font-semibold py-2 rounded-lg transition-colors"
              style={{ background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
            >
              Clear filters
            </button>
          )}
        </aside>
      </div>
    </>
  );
}

// Slider release hands back just its two keys (string|undefined) — map to the
// numeric State fields.
function deltaToState(delta: Record<string, string | undefined>): Partial<State> {
  const out: Partial<State> = {};
  for (const [k, v] of Object.entries(delta)) {
    (out as Record<string, number | undefined>)[k] = v != null ? Number(v) : undefined;
  }
  return out;
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

// ── Active-filter chips (each ✕ clears just that filter) ──────────────────────
function ActiveChips({ state, update, reset }: {
  state: State;
  update: (p: Partial<State>) => void;
  reset: (keepQ: boolean) => void;
}) {
  const fmtUsd = (n: number) => (n >= 1e6 ? `$${n / 1e6}M` : n >= 1e3 ? `$${n / 1e3}k` : `$${n}`);
  const range = (lo: number | undefined, hi: number | undefined, noun: string, fmt: (n: number) => string = (n) => `${n}`): string | null => {
    if (lo == null && hi == null) return null;
    return lo != null && hi != null ? `${fmt(lo)}–${fmt(hi)} ${noun}` : lo != null ? `≥${fmt(lo)} ${noun}` : `≤${fmt(hi!)} ${noun}`;
  };
  const chips: Array<{ key: string; label: string; clear: Partial<State> }> = [];
  if (state.q) chips.push({ key: "q", label: `“${state.q}”`, clear: { q: "" } });
  if (state.chainIds.length) chips.push({ key: "chain", label: `${state.chainIds.length} chain${state.chainIds.length > 1 ? "s" : ""}`, clear: { chainIds: [] } });
  if (state.protocols.length) chips.push({ key: "protocol", label: `${state.protocols.length} protocol${state.protocols.length > 1 ? "s" : ""}`, clear: { protocols: [] } });
  if (state.date !== "all") chips.push({ key: "date", label: DATE_FILTERS.find((d) => d.id === state.date)?.label ?? "Date", clear: { date: "all" } });
  const usdLbl = range(state.usdMin, state.usdMax, "locked", fmtUsd);
  if (usdLbl) chips.push({ key: "usd", label: usdLbl, clear: { usdMin: undefined, usdMax: undefined } });
  const wLbl = range(state.minWallets, state.maxWallets, "wallets");
  if (wLbl) chips.push({ key: "wallets", label: wLbl, clear: { minWallets: undefined, maxWallets: undefined } });
  const rLbl = range(state.minRounds, state.maxRounds, "schedules");
  if (rLbl) chips.push({ key: "rounds", label: rLbl, clear: { minRounds: undefined, maxRounds: undefined } });
  const vLbl = range(state.minVested, state.maxVested, "vested", (n) => `${n}%`);
  if (vLbl) chips.push({ key: "vested", label: vLbl, clear: { minVested: undefined, maxVested: undefined } });
  const tLbl = range(state.topMin, state.topMax, "top holder", (n) => `${n}%`);
  if (tLbl) chips.push({ key: "top", label: tLbl, clear: { topMin: undefined, topMax: undefined } });
  if (state.cliffOnly) chips.push({ key: "cliff", label: "Cliff unlocks", clear: { cliffOnly: false } });

  if (chips.length === 0) return null;
  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      <span className="text-[10px] font-bold uppercase tracking-wider mr-0.5" style={{ color: "var(--preview-text-3)" }}>Filters</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => update(c.clear)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors hover:brightness-105"
          style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}
        >
          {c.label}
          <span aria-hidden style={{ opacity: 0.65 }}>✕</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => reset(false)}
        className="text-[11px] font-semibold px-2 py-1 rounded-full transition-colors hover:underline"
        style={{ color: "var(--preview-text-3)" }}
      >
        Clear all
      </button>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────────
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-bold mb-2" style={{ color: "var(--preview-text-3)" }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
      style={active
        ? { background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.30)" }
        : { background: "var(--preview-muted)", color: "var(--preview-text-2)", border: "1px solid var(--preview-border)" }}
    >
      {children}
    </button>
  );
}

function UpgradeBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-4 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.04), rgba(15,138,138,0.02))", border: "1px solid rgba(28,184,184,0.20)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold mb-0.5" style={{ color: "var(--preview-text)" }}>{title}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--preview-text-2)" }}>{body}</p>
      </div>
      <a href="/pricing" className="text-xs font-bold px-4 py-2 rounded-lg whitespace-nowrap"
        style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 8px rgba(28,184,184,0.3)" }}>
        Upgrade to Pro →
      </a>
    </div>
  );
}

// Brief shimmer while the one-time dataset loads (then everything is instant).
function DatasetSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5" style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
          <div className="w-8 h-8 rounded-lg animate-pulse" style={{ background: "var(--preview-muted-2)" }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 rounded animate-pulse" style={{ background: "var(--preview-muted-2)" }} />
            <div className="h-2.5 w-20 rounded animate-pulse" style={{ background: "var(--preview-muted-2)" }} />
          </div>
          <div className="h-3 w-12 rounded animate-pulse" style={{ background: "var(--preview-muted-2)" }} />
        </div>
      ))}
    </div>
  );
}
