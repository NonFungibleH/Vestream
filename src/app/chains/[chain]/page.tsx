// /chains/<slug> — per-chain token-unlock & vesting page.
//
// Mirrors the protocol pages, but scoped to a blockchain: live vesting TVL on
// the chain, the protocols integrated on it, and the upcoming unlocks landing
// on it. Answer-first + Dataset-ish framing so it's citable and ranks for
// "<chain> token unlocks" / "<chain> vesting".
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Provenance } from "@/components/Provenance";
import {
  chainBrand, chainIcon, chainSlug, chainIdFromSlug, publicChainIds,
  getProtocol, protocolIcon,
} from "@/lib/protocol-constants";
import { getChainStats } from "@/lib/vesting/chain-stats";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 600;

export function generateStaticParams() {
  return publicChainIds()
    .map((id) => chainSlug(id))
    .filter((s): s is string => !!s)
    .map((chain) => ({ chain }));
}

export async function generateMetadata({ params }: { params: Promise<{ chain: string }> }): Promise<Metadata> {
  const { chain } = await params;
  const chainId = chainIdFromSlug(chain);
  if (chainId === undefined) return { title: "Chain not found · Vestream" };
  const name = chainBrand(chainId).name;
  const url  = `https://www.vestream.io/chains/${chain}`;
  return {
    title: `${name} Token Unlocks & Vesting Tracker`,
    description: `Live token vesting on ${name}: total value locked in vesting, the protocols integrated on ${name}, and every upcoming token unlock, priced in USD. Free, updated continuously.`,
    alternates: { canonical: url },
    openGraph: {
      title: `${name} Token Unlocks & Vesting`,
      description: `Vesting TVL, integrated protocols, and upcoming unlocks on ${name}.`,
      url, siteName: "Vestream", type: "website",
    },
  };
}

function n(x: number) { return x.toLocaleString("en-US"); }

/** Compact token amount from a raw stringified bigint + decimals. */
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

export default async function ChainPage({ params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const chainId = chainIdFromSlug(chain);
  if (chainId === undefined) notFound();

  const brand = chainBrand(chainId);
  const icon  = chainIcon(chainId);
  const s     = await getChainStats(chainId);

  const protocols = s.protocolSlugs.map((slug) => getProtocol(slug)).filter((p): p is NonNullable<typeof p> => !!p);

  const protoClause = `${n(protocols.length)} ${protocols.length === 1 ? "protocol" : "protocols"}`;
  const upClause = s.upcomingCount > 0
    ? `, with ${n(s.upcomingCount)} upcoming ${s.upcomingCount === 1 ? "unlock" : "unlocks"} in the next 90 days`
    : "";
  const answer = s.isEmpty
    ? `Vestream tracks token vesting and unlocks on ${brand.name}.`
    : s.tvlUsd > 0
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

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/chains" style={{ color: "#8B8E92" }}>Chains</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{brand.name}</li>
          </ol>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: brand.bg, border: `1px solid ${brand.border}` }}>
            {icon
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" width={44} height={44} className="w-full h-full object-contain p-1.5" />
              : <span className="font-extrabold text-lg" style={{ color: brand.color }}>{brand.name[0]}</span>}
          </span>
          <h1 className="text-3xl md:text-4xl font-bold" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
            {brand.name} token unlocks
          </h1>
        </div>

        {/* Answer-first */}
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-3 font-medium" style={{ color: "#1A1D20" }}>{answer}</p>
        <Provenance updatedISO={s.computedAt} className="mb-2" />
      </section>

      {!s.isEmpty && (
        <>
          <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Vesting TVL" value={fmtUsd(s.tvlUsd)} sub="conservative headline" />
              <Stat label="Upcoming (90d)" value={n(s.upcomingCount)} sub={s.totalUpcomingUsd > 0 ? `${fmtUsd(s.totalUpcomingUsd)} unlocking` : undefined} />
              <Stat label="Protocols" value={n(protocols.length)} sub="integrated here" />
              <Stat label="Streams" value={n(s.streamCount)} sub="indexed" />
            </div>
          </section>

          {protocols.length > 0 && (
            <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
              <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Protocols on {brand.name}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {protocols.map((p) => {
                  const pIcon = protocolIcon(p.slug);
                  return (
                    <Link key={p.slug} href={`/protocols/${p.slug}`} className="flex items-center gap-3 p-4 rounded-2xl transition-colors" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                        {pIcon
                          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={pIcon} alt="" width={40} height={40} className="w-full h-full object-contain p-1.5" />
                          : <span className="font-extrabold text-lg" style={{ color: p.color }}>{p.name[0]}</span>}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: "#1A1D20" }}>{p.name}</p>
                        <p className="text-xs truncate" style={{ color: "#64748b" }}>{p.tagline}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {s.upcoming.length > 0 && (
            <section className="px-4 md:px-8 pb-10 max-w-4xl mx-auto w-full">
              <h2 className="text-lg font-bold mb-3" style={{ color: "#1A1D20" }}>Upcoming unlocks on {brand.name}</h2>
              <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
                {s.upcoming.map((u, i) => {
                  const p = getProtocol(u.protocol);
                  const amt = fmtAmount(u.amount, u.decimals);
                  return (
                    <div key={`${u.protocol}-${u.address}-${u.eventTime}-${i}`} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(21,23,26,0.06)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate" style={{ color: "#1A1D20" }}>
                          {u.symbol || `${u.address.slice(0, 6)}…${u.address.slice(-4)}`}
                          {p && <span className="ml-2 text-xs font-medium" style={{ color: p.color }}>{p.name}</span>}
                        </p>
                        <p className="text-[11px]" style={{ color: "#8B8E92" }}>{fmtDate(u.eventTime)}{amt ? ` · ${amt} ${u.symbol ?? ""}`.trimEnd() : ""}</p>
                      </div>
                      <div className="text-right flex-shrink-0 text-sm font-bold tabular-nums" style={{ color: "#0F8A8A" }}>
                        {u.usdValue != null ? fmtUsd(u.usdValue) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3">
                <Link href="/unlocks" className="text-sm font-semibold hover:underline" style={{ color: "#0F8A8A" }}>View the full unlock calendar →</Link>
              </div>
            </section>
          )}
        </>
      )}

      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
          <h2 className="text-sm font-bold mb-2" style={{ color: "#1A1D20" }}>Track your {brand.name} vestings</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#475569" }}>
            Paste any wallet to see everything vesting to it on {brand.name} and every other chain, free, with no signup. Add it in the app to get an alert before each unlock.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/find-vestings" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}>Find my vestings</Link>
            <Link href="/protocols" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm" style={{ background: "rgba(15,138,138,0.1)", color: "#0F8A8A" }}>All protocols</Link>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}
