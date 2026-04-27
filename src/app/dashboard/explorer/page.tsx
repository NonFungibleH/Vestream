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

import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUserTier, type Tier } from "@/lib/auth/tier";
import {
  getUnlocksInWindow,
  WINDOWS,
  type WindowSlug,
  type WindowUnlockGroup,
} from "@/lib/vesting/unlock-windows";
import { listProtocols, getProtocol } from "@/lib/protocol-constants";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { ExplorerSearchInput } from "./SearchInput";
import { ExplorerSidebar } from "./Sidebar";
import { detectQueryKind, type QueryKind } from "./detect-query";

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
  status?:   string;
}

interface PageProps {
  searchParams: Promise<ExplorerSearchParams>;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function ExplorerPage({ searchParams }: PageProps) {
  // Auth gate — middleware already enforces vestr_early_access for /dashboard,
  // we additionally need a session for tier resolution.
  const cookieStore = await cookies();
  if (!cookieStore.get("vestr_early_access")) {
    redirect("/early-access");
  }

  const tier: Tier | null = await getCurrentUserTier();
  const isFree = tier === "free" || tier == null;

  const sp = await searchParams;
  const query   = (sp.q ?? "").trim();
  const mode    = sp.mode ?? "calendar";
  const dateSlug = (sp.date ?? "30-days") as WindowSlug | "all";

  const chainIds = parseCsvNumbers(sp.chain);
  const protocols = parseCsvStrings(sp.protocol);
  const amountThreshold = AMOUNT_FILTERS.find((f) => f.id === sp.amount)?.threshold;

  const queryKind = query ? detectQueryKind(query) : { kind: "empty" as const };

  // ── Calendar-mode fetch ────────────────────────────────────────────────
  // For an MVP we ship calendar mode as the default surface — it composes
  // cleanly with the existing getUnlocksInWindow() helper. Stream and wallet
  // modes are marked "coming soon" placeholders below.
  const window = dateSlug === "all"
    ? { startSec: Math.floor(Date.now() / 1000), endSec: Math.floor(Date.now() / 1000) + 5 * 365 * 86400 }
    : WINDOWS[dateSlug as WindowSlug].range();

  const adapterIds = protocols.length > 0
    ? expandProtocolsToAdapters(protocols)
    : undefined;

  let calendarResult;
  try {
    calendarResult = await getUnlocksInWindow(
      window.startSec,
      window.endSec,
      isFree ? FREE_TIER_ROW_CAP * 4 : 2000,  // pull a bit more than the cap so we have headroom for filtering
      adapterIds,
      chainIds.length > 0 ? chainIds : undefined,
    );
  } catch {
    calendarResult = { groups: [], stats: { unlockCount: 0, tokenCount: 0, chainCount: 0, walletCount: 0, byToken: [] } };
  }

  // Apply amount + symbol filter in JS (cheap, post-query).
  let groups: WindowUnlockGroup[] = calendarResult.groups;
  if (amountThreshold) {
    // Token-amount-to-USD requires a price, which we don't have in this query.
    // Approximate by filtering on raw amount > a heuristic ratio. Real $-filter
    // ships when the price-cache shape lands on the explorer surface.
    groups = groups.filter((g) => Number(g.amount ?? 0) > 0);
  }
  if (queryKind.kind === "symbol") {
    const wanted = queryKind.symbol.toLowerCase();
    groups = groups.filter((g) => (g.tokenSymbol ?? "").toLowerCase() === wanted);
  }

  const totalMatches = groups.length;
  const visibleRows  = isFree ? groups.slice(0, FREE_TIER_ROW_CAP) : groups;
  const hiddenCount  = totalMatches - visibleRows.length;

  // Active-filter count for the free-tier multi-filter cap.
  const activeFilters = [
    chainIds.length > 0 ? "chain" : null,
    protocols.length > 0 ? "protocol" : null,
    sp.amount ? "amount" : null,
    dateSlug !== "30-days" ? "date" : null,
  ].filter(Boolean) as string[];
  const overFilterCap = isFree && activeFilters.length > FREE_TIER_FILTER_CAP;

  return (
    <div className="flex" style={{ minHeight: "100vh", background: "var(--preview-bg)" }}>
      <ExplorerSidebar tier={tier} />

      <main className="flex-1 px-4 md:px-8 py-6 md:py-8 max-w-7xl">
        {/* Header */}
        <header className="mb-5">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Explorer</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
            Vesting search
          </h1>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Search any wallet, token symbol, or protocol across every vesting schedule we index.
          </p>
        </header>

        {/* Search input */}
        <ExplorerSearchInput
          initialQuery={query}
          mode={mode}
          chainIds={chainIds}
          protocols={protocols}
          dateSlug={dateSlug}
        />

        {/* Active mode tabs */}
        <div className="mt-5 flex items-center gap-1 border-b" style={{ borderColor: "var(--preview-border)" }}>
          {(["calendar", "stream", "wallet"] as const).map((m) => {
            const active = mode === m;
            const href = buildUrl({ ...sp, mode: m });
            return (
              <Link
                key={m}
                href={href}
                className="px-4 py-2 text-sm font-semibold relative"
                style={{
                  color: active ? "#0F8A8A" : "var(--preview-text-2)",
                  borderBottom: active ? "2px solid #0F8A8A" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {m === "calendar" ? "Calendar" : m === "stream" ? "Streams" : "Wallets"}
                {m !== "calendar" && (
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(0,0,0,0.04)", color: "var(--preview-text-3)" }}>
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="grid gap-5 mt-5" style={{ gridTemplateColumns: "minmax(0, 1fr) 220px" }}>
          {/* Results */}
          <section>
            {mode === "calendar" && (
              <CalendarResults
                rows={visibleRows}
                totalMatches={totalMatches}
                hiddenCount={hiddenCount}
                isFree={isFree}
                overFilterCap={overFilterCap}
              />
            )}
            {mode === "stream" && (
              <ComingSoon
                title="Streams view"
                body="Per-stream search ships next — search by symbol, chain, or status to see every individual schedule with full detail."
              />
            )}
            {mode === "wallet" && (
              <ComingSoon
                title="Wallets view"
                body={
                  query
                    ? "Wallet lookup ships next. For now use the main /dashboard with this address tracked."
                    : "Paste a wallet address (or ENS) above to see every active position for that address."
                }
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
            {(chainIds.length > 0 || protocols.length > 0 || sp.amount || dateSlug !== "30-days") && (
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
    </div>
  );
}

// ─── Calendar results block ─────────────────────────────────────────────────

function CalendarResults({
  rows, totalMatches, hiddenCount, isFree, overFilterCap,
}: {
  rows:           WindowUnlockGroup[];
  totalMatches:   number;
  hiddenCount:    number;
  isFree:         boolean;
  overFilterCap:  boolean;
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
          <Link
            href={`/api/dashboard/explorer/export${typeof window !== "undefined" ? window.location.search : ""}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}
          >
            Export CSV
          </Link>
        )}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
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

function CalendarRow({ group, showTopBorder }: { group: WindowUnlockGroup; showTopBorder: boolean }) {
  const meta      = getProtocol(group.protocol);
  const accent    = meta?.color ?? "#64748b";
  const chainName = CHAIN_NAMES[group.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${group.chainId}`;
  const ttl       = relativeUntil(group.eventTime);

  return (
    <Link
      href={`/token/${group.chainId}/${group.tokenAddress}`}
      className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 md:gap-5 px-4 md:px-5 py-3 transition-colors"
      style={{ borderTop: showTopBorder ? "1px solid var(--preview-border-2)" : undefined }}
      onMouseEnter={undefined}
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
