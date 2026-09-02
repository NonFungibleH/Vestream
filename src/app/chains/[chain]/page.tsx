// /chains/<slug> - per-chain token-unlock & vesting page.
//
// Chain equivalent of the protocol pages: live vesting TVL on the chain, the
// TVL split across protocols, the protocols integrated on it, and the biggest
// upcoming unlocks landing on it. Answer-first + CollectionPage JSON-LD so it's
// citable and ranks for "<chain> token unlocks" / "<chain> vesting".
//
// The protocols-on-chain list is STATIC (from listProtocols, no DB) so it
// always renders, even during ISR cold-start before the snapshot/unlock data
// has filled in. Only the TVL / unlock figures come from the DB.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import {
  chainBrand, chainIcon, chainSlug, chainIdFromSlug, publicChainIds,
  getProtocol, protocolIcon, listProtocols,
  upcomingChain, upcomingChainSlugs,
} from "@/lib/protocol-constants";
import { getChainStats, type ChainUnlock } from "@/lib/vesting/chain-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

export function generateStaticParams() {
  const live = publicChainIds()
    .map((id) => chainSlug(id))
    .filter((s): s is string => !!s);
  // Upcoming (not-yet-indexed) chains get a static page too — see
  // UPCOMING_CHAINS in protocol-constants.
  return [...live, ...upcomingChainSlugs()].map((chain) => ({ chain }));
}

export async function generateMetadata({ params }: { params: Promise<{ chain: string }> }): Promise<Metadata> {
  const { chain } = await params;
  const chainId = chainIdFromSlug(chain);
  const url  = `https://www.vestream.io/chains/${chain}`;
  if (chainId === undefined) {
    const up = upcomingChain(chain);
    if (!up) return { title: "Chain not found · Vestream" };
    return {
      title: `${up.name} Token Unlocks & Vesting`,
      description: `Token vesting on ${up.name}: which vesting protocols are deployed there, why unlock schedules matter on ${up.name}, and when Vestream will index it. ${up.tagline}`,
      alternates: { canonical: url },
      openGraph: { title: `${up.name} Token Unlocks & Vesting`, description: up.tagline, url, siteName: "Vestream", type: "website" },
    };
  }
  const name = chainBrand(chainId).name;
  return {
    title: `${name} Token Unlocks & Vesting Tracker`,
    description: `Live token vesting on ${name}: total value locked, the protocols integrated on ${name}, and the biggest upcoming token unlocks, priced in USD. Free, updated continuously.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} Token Unlocks & Vesting`,
      description: `Vesting TVL, integrated protocols, and upcoming unlocks on ${name}.`,
      url, siteName: "Vestream", type: "website",
    },
  };
}

function n(x: number) { return x.toLocaleString("en-US"); }

function fmtAmount(raw: string | null, decimals: number): string | null {
  if (!raw) return null;
  try {
    const scale = 10n ** BigInt(Math.min(decimals, 30));
    const whole = Number(BigInt(raw) / scale) + Number(BigInt(raw) % scale) / Number(scale);
    if (whole >= 1e9) return `${(whole / 1e9).toFixed(2)}B`;
    if (whole >= 1e6) return `${(whole / 1e6).toFixed(2)}M`;
    if (whole >= 1e3) return `${(whole / 1e3).toFixed(1)}K`;
    return whole.toFixed(2);
  } catch { return null; }
}

function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "#0F8A8A" }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: "#B8BABD" }}>{sub}</p>}
    </div>
  );
}

/**
 * One unlock column. Rendered as a pair inside `UnlockColumns` — these used to
 * be two full-width stacked sections, which pushed "biggest upcoming" a whole
 * screen below "next" even though the two are meant to be read against each
 * other (soonest vs largest is the comparison that matters).
 *
 * `rank` numbers the biggest-unlocks column, so the two columns stay visually
 * distinct at a glance instead of reading as one long repeated list.
 */
function UnlockList({ title, items, rank = false }: { title: string; items: ChainUnlock[]; rank?: boolean }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base md:text-lg font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>{title}</h2>
      <div className="rounded-2xl overflow-hidden h-full" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
        {items.map((u, i) => {
          const p = getProtocol(u.protocol);
          const amt = fmtAmount(u.amount, u.decimals);
          return (
            <Link
              key={`${u.protocol}-${u.address}-${u.eventTime}-${i}`}
              href={`/token/${u.chainId}/${u.address}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.02]"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}
            >
              {rank && (
                <span
                  className="w-5 text-[11px] font-bold tabular-nums flex-shrink-0 text-center"
                  style={{ color: i < 3 ? "#0F8A8A" : "#B4B7BA" }}
                >{i + 1}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "#1A1D20" }}>
                  {u.symbol || `${u.address.slice(0, 6)}…${u.address.slice(-4)}`}
                  {p && <span className="ml-2 text-xs font-medium" style={{ color: p.color }}>{p.name}</span>}
                </p>
                <p className="text-[11px]" style={{ color: "#8B8E92" }}>{fmtDate(u.eventTime)}{amt ? ` · ${amt} ${u.symbol ?? ""}`.trimEnd() : ""}</p>
              </div>
              <div className="text-right flex-shrink-0 text-sm font-bold tabular-nums" style={{ color: "#0F8A8A" }}>
                {u.usdValue != null ? fmtUsd(u.usdValue) : "–"}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Soonest and largest side by side — one comparison, not two scrolls. */
function UnlockColumns({ next, biggest, chainName }: { next: ChainUnlock[]; biggest: ChainUnlock[]; chainName: string }) {
  if (next.length === 0 && biggest.length === 0) return null;
  return (
    <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6 items-start">
        {next.length    > 0 && <UnlockList title={`Next unlocks on ${chainName}`}    items={next.slice(0, 10)} />}
        {biggest.length > 0 && <UnlockList title={`Biggest upcoming on ${chainName}`} items={biggest.slice(0, 10)} rank />}
      </div>
    </section>
  );
}

/**
 * Page for a chain we talk about but do not index yet (UPCOMING_CHAINS).
 * Deliberately honest: no TVL, no counts, no mock unlocks — just what vesting
 * looks like on that chain, which protocols are there, and a route into the
 * product. Same URL the live page will take over, so ranking carries across.
 */
function UpcomingChainPage({ up, slug }: { up: import("@/lib/protocol-constants").UpcomingChain; slug: string }) {
  const liveChains = publicChainIds().map((id) => ({ id, slug: chainSlug(id), brand: chainBrand(id) })).filter((c) => !!c.slug).slice(0, 6);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${up.name} Token Unlocks & Vesting`,
    description: `Token vesting on ${up.name}: deployed vesting protocols and Vestream's integration status.`,
    url: `https://www.vestream.io/chains/${slug}`,
    isPartOf: { "@type": "WebSite", name: "Vestream", url: "https://www.vestream.io" },
  };
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden pt-24 pb-10 md:pt-32 md:pb-14 px-4 md:px-8">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 85% 55% at 50% -5%, rgba(28,184,184,0.14) 0%, transparent 70%)" }} />
        <div className="relative max-w-4xl mx-auto">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
              <li><Link href="/" className="hover:underline">Home</Link></li>
              <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
              <li><Link href="/chains" className="hover:underline">Chains</Link></li>
              <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
              <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{up.name}</li>
            </ol>
          </nav>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#d97706" }}>
            Integration on the roadmap
          </div>
          <h1 className="font-bold tracking-tight mb-4" style={{ fontSize: "clamp(2rem, 4.5vw, 3.25rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }}>
            {up.name} token unlocks<br /><span style={{ color: "#1CB8B8" }}>and vesting</span>
          </h1>
          <p className="text-base md:text-lg leading-relaxed max-w-2xl" style={{ color: "#5B6064" }}>{up.tagline}</p>
        </div>
      </section>

      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-6 md:p-7" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)" }}>
          <h2 className="text-lg md:text-xl font-bold mb-3" style={{ letterSpacing: "-0.02em" }}>Vesting on {up.name}</h2>
          <p className="text-sm md:text-[15px] leading-relaxed" style={{ color: "#475569" }}>{up.body}</p>
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid rgba(21,23,26,0.07)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8B8E92" }}>Vesting protocols deployed on {up.name}</p>
            {up.protocols.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {up.protocols.map((name) => (
                  <span key={name} className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: "rgba(21,23,26,0.035)", border: "1px solid rgba(21,23,26,0.08)" }}>{name}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: "#8B8E92" }}>No vesting or locker protocol has announced a {up.name} deployment yet. This page will list them as they go live.</p>
            )}
          </div>
          <p className="mt-5 text-sm leading-relaxed" style={{ color: "#8B8E92" }}>
            Vestream does not index {up.name} yet. Nothing on this page is a live figure. When the integration ships, this URL becomes the live {up.name} unlock calendar with TVL, protocols and upcoming unlocks.
          </p>
        </div>
      </section>

      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <h2 className="text-lg md:text-xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Chains Vestream indexes today</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {liveChains.map((c) => (
            <Link key={c.id} href={`/chains/${c.slug}`} className="rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)", color: "#1A1D20" }}>
              {c.brand.name} →
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/find-vestings" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", color: "white", boxShadow: "0 4px 20px rgba(28,184,184,0.28)" }}>
            Check a wallet on a live chain →
          </Link>
          <Link href="/contact" className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "white", border: "1px solid rgba(21,23,26,0.1)", color: "#0F8A8A" }}>
            Ask us to prioritise {up.name}
          </Link>
        </div>
      </section>
      <SiteFooter theme="light" />
    </div>
  );
}

export default async function ChainPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const chainId = chainIdFromSlug(chain);
  if (chainId === undefined) {
    const up = upcomingChain(chain);
    if (!up) notFound();
    return <UpcomingChainPage up={up} slug={chain} />;
  }

  const brand = chainBrand(chainId);
  const icon  = chainIcon(chainId);

  // Static: which protocols are integrated on this chain. Always available, so
  // the page has real content even before the DB-backed stats fill in.
  const protocols = listProtocols().filter((p) => p.chainIds.includes(chainId as never));

  const s = await getChainStats(chainId);
  const protoMax = s.byProtocol[0]?.tvlUsd ?? 0;
  // Per-protocol stats (TVL + streams on this chain), keyed by slug, so the
  // static protocol list can be enriched + sorted by TVL.
  const statBySlug = new Map(s.byProtocol.map((p) => [p.slug, p]));
  const protocolsSorted = [...protocols].sort(
    (a, b) => (statBySlug.get(b.slug)?.tvlUsd ?? 0) - (statBySlug.get(a.slug)?.tvlUsd ?? 0),
  );

  const protoClause = `${n(protocols.length)} ${protocols.length === 1 ? "protocol" : "protocols"}`;
  const upClause = s.upcomingCount > 0
    ? `, with ${n(s.upcomingCount)} upcoming ${s.upcomingCount === 1 ? "unlock" : "unlocks"} in the next 90 days`
    : "";
  const answer = s.tvlUsd > 0
    ? `Approximately ${fmtUsd(s.tvlUsd)} is locked in token vesting on ${brand.name} across ${protoClause} indexed by Vestream${upClause}.`
    : `Vestream indexes token vesting on ${brand.name} across ${protoClause}${upClause}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${brand.name} Token Unlocks & Vesting`,
    description: `Live token vesting on ${brand.name}: TVL, integrated protocols, and upcoming unlocks.`,
    url: `https://www.vestream.io/chains/${chain}`,
    isPartOf: { "@type": "WebSite", name: "Vestream", url: "https://www.vestream.io" },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home",   item: "https://www.vestream.io" },
      { "@type": "ListItem", position: 2, name: "Chains", item: "https://www.vestream.io/chains" },
      { "@type": "ListItem", position: 3, name: brand.name, item: `https://www.vestream.io/chains/${chain}` },
    ],
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-10 md:pt-24 md:pb-14 px-4 md:px-8 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 0%, ${brand.color}14 0%, transparent 70%)`,
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: `linear-gradient(90deg, transparent, ${brand.color}80, transparent)`,
        }} />

        {/* Breadcrumb — left-aligned, inside the chain's halo */}
        <nav aria-label="Breadcrumb" className="relative max-w-4xl mx-auto mb-8 text-left">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "#8B8E92" }}>
            <li><Link href="/" className="hover:underline" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li><Link href="/chains" className="hover:underline" style={{ color: "#8B8E92" }}>Chains</Link></li>
            <li aria-hidden style={{ color: "#D1D5DB" }}>›</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{brand.name}</li>
          </ol>
        </nav>

        <div className="relative max-w-4xl mx-auto">
          {/* Live pill in the chain's colour */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: brand.bg, borderColor: brand.border, color: brand.color }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: brand.color }} />
            Live · indexing {n(protocols.length)} {protocols.length === 1 ? "protocol" : "protocols"} on {brand.name}
          </div>

          {/* Chain logo tile */}
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{ background: brand.bg, border: `1px solid ${brand.border}`, boxShadow: `0 6px 20px ${brand.color}22` }}>
              {icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={icon} alt="" width={40} height={40} className="w-full h-full object-contain p-2" />
              ) : (
                <span className="font-extrabold text-2xl" style={{ color: brand.color }}>{brand.name[0]}</span>
              )}
            </div>
          </div>

          <h1 className="font-bold tracking-tight mb-4" style={{ fontSize: "clamp(2.25rem, 5vw, 3.5rem)", lineHeight: 1.08, letterSpacing: "-0.03em", color: "#1A1D20" }}>
            {brand.name} token unlocks<br />
            <span style={{ color: "#1CB8B8" }}>tracker &amp; alerts</span>
          </h1>

          <p className="text-sm md:text-base leading-relaxed max-w-2xl mx-auto mb-6" style={{ color: "#475569" }}>{answer}</p>
          <div className="flex justify-center">
            <Provenance updatedISO={s.computedAt} />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Vesting TVL" value={s.tvlUsd > 0 ? fmtUsd(s.tvlUsd) : "–"} sub="conservative headline" />
          <Stat label="Upcoming (90d)" value={n(s.upcomingCount)} sub={s.totalUpcomingUsd > 0 ? `${fmtUsd(s.totalUpcomingUsd)} unlocking` : undefined} />
          <Stat label="Protocols" value={n(protocols.length)} sub="integrated here" />
          <Stat label="Streams" value={s.streamCount > 0 ? n(s.streamCount) : "–"} sub="indexed" />
        </div>
      </section>

      {/* Protocols on chain - rich list with per-protocol TVL + streams.
          Static list (always renders); TVL/streams fill via ISR. Sorted by TVL. */}
      {protocols.length > 0 && (
        <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
          <h2 className="text-xl md:text-2xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>Protocols on {brand.name}</h2>
          <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
            {protocolsSorted.map((p, i) => {
              const pIcon = protocolIcon(p.slug);
              const st = statBySlug.get(p.slug);
              const tvl = st?.tvlUsd ?? 0;
              const streams = st?.streamCount ?? 0;
              const pct = protoMax > 0 && tvl > 0 ? Math.max(3, (tvl / protoMax) * 100) : 0;
              return (
                <Link
                  key={p.slug}
                  href={`/protocols/${p.slug}`}
                  className="flex items-center gap-3 md:gap-4 px-4 py-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                    {pIcon
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={pIcon} alt="" width={36} height={36} className="w-full h-full object-contain p-1.5" />
                      : <span className="font-extrabold text-base" style={{ color: p.color }}>{p.name[0]}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold text-sm truncate" style={{ color: "#1A1D20" }}>{p.name}</p>
                      <p className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: tvl > 0 ? "#0F8A8A" : "#CBD5E1" }}>{tvl > 0 ? fmtUsd(tvl) : "–"}</p>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full overflow-hidden" style={{ background: "rgba(15,138,138,0.08)" }}>
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                    <p className="text-[11px] mt-1 truncate" style={{ color: "#8B8E92" }}>
                      {streams > 0 ? `${n(streams)} ${streams === 1 ? "stream" : "streams"}` : p.tagline}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Next unlocks (chronological), then biggest (by USD). Rows link to token pages. */}
      <UnlockColumns next={s.nextUnlocks} biggest={s.biggestUnlocks} chainName={brand.name} />

      {/* Calendar + explore links */}
      <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
        <h2 className="text-xl md:text-2xl font-bold mb-4" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>Explore unlocks</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "Full unlock calendar", body: "Every upcoming unlock across protocols and chains.", href: "/unlocks" },
            { title: "Biggest this week", body: "This week's unlocks ranked by USD value.", href: "/unlocks/biggest-this-week" },
            { title: "Mass distributions", body: "Unlocks hitting many recipients at once.", href: "/unlocks/mass-distributions" },
            { title: "Monthly reports", body: "The biggest scheduled unlocks each month.", href: "/unlocks/report" },
          ].map((c) => (
            <Link key={c.href} href={c.href} className="block p-4 rounded-2xl" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              <p className="font-bold text-sm mb-0.5" style={{ color: "#1A1D20" }}>{c.title}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: "#64748b" }}>{c.body}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: "#1A1D20" }}>Track your {brand.name} vestings</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#475569" }}>
            Paste any wallet to see everything vesting to it on {brand.name} and every other chain, free, with no signup. Add it in the app to get an alert before each unlock.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/find-vestings" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}>Find my vestings</Link>
            <Link href="/chains" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm" style={{ background: "rgba(15,138,138,0.1)", color: "#0F8A8A" }}>All chains</Link>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
