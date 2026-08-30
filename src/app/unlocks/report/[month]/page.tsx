// /unlocks/report/[YYYY-MM] — dated Monthly Token Unlock Report.
//
// A citable, shareable data artifact (backlinks + AI-answer citations) built
// from schedule-derived unlock data — one dated page per month. Fully public
// (no paywall) so search + AI crawlers can read all of it. Answer-first lead +
// structured data make it extractable by AI Overviews / ChatGPT / Claude.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ScanWalletCTA } from "@/components/ScanWalletCTA";
import { withTimeout } from "@/lib/with-timeout";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";
import {
  getMonthlyUnlockReport,
  emptyMonthlyReport,
  monthLabel,
  type MonthlyReportEvent,
} from "@/lib/vesting/monthly-report";

export const revalidate = 3600;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// Pre-render prev month, current, and next 2 — the months most likely to be
// crawled/linked. Others render on-demand via ISR. new Date() is fine at build.
export function generateStaticParams() {
  const now = new Date();
  const out: { month: string }[] = [];
  for (let offset = -1; offset <= 2; offset++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    out.push({ month: `${d.getUTCFullYear()}-${mm}` });
  }
  return out;
}

interface PageParams { params: Promise<{ month: string }> }

function parseMonth(raw: string): { year: number; month: number } | null {
  const m = MONTH_RE.exec(raw);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Sanity window — refuse absurd years so junk params 404 instead of querying.
  if (year < 2023 || year > 2032) return null;
  return { year, month };
}

function tokenLabel(symbol: string | null, address: string): string {
  if (symbol && symbol.trim() && symbol.toLowerCase() !== "unknown") return symbol;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function fmtAmount(amount: string | null, decimals: number): string {
  if (!amount) return "–";
  try {
    const n = Number(BigInt(amount)) / Math.pow(10, decimals);
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    if (n >= 1)   return n.toFixed(2);
    return n.toFixed(4);
  } catch { return "–"; }
}

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
const FULL: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", timeZone: "UTC" };
const dayFmt  = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", DAY);
const fullFmt = (ts: number) => new Date(ts * 1000).toLocaleDateString("en-US", FULL);

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { month } = await params;
  const parsed = parseMonth(month);
  if (!parsed) return { title: "Token Unlock Report – Vestream" };
  const label = monthLabel(parsed.year, parsed.month);
  const title = `${label} Token Unlock Report | Vestream`;
  const desc  = `The biggest token unlocks in ${label}, ranked by USD value across every protocol and chain Vestream tracks — dates, amounts, and dollar impact.`;
  const url   = `https://www.vestream.io/unlocks/report/${month}`;
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: `${label} Token Unlock Report`, description: desc, url, siteName: "Vestream", type: "article" },
    twitter:   { card: "summary_large_image", title: `${label} Token Unlock Report`, description: desc },
  };
}

export default async function MonthlyReportPage({ params }: PageParams) {
  const { month } = await params;
  const parsed = parseMonth(month);
  if (!parsed) notFound();
  const { year, month: mo } = parsed;
  const label = monthLabel(year, mo);

  const report = await withTimeout(
    getMonthlyUnlockReport(year, mo),
    14_000,
    emptyMonthlyReport(year, mo),
    `monthly-report:${month}`,
  );

  const top3 = report.topEvents.filter((e) => e.usdValue != null).slice(0, 3);
  const answerLead = report.isEmpty
    ? `No token unlocks are currently indexed for ${label}.`
    : `In ${label}, ${report.eventCount.toLocaleString()} token unlock events` +
      (report.totalUsd > 0 ? ` worth ~${fmtUsd(report.totalUsd)} at today's prices` : "") +
      ` are scheduled across ${report.chainCount} ${report.chainCount === 1 ? "chain" : "chains"} and ${report.tokenCount.toLocaleString()} tokens.` +
      (top3.length
        ? ` The largest are ${top3.map((e) => `${tokenLabel(e.symbol, e.address)} (~${fmtUsd(e.usdValue!)} on ${fullFmt(e.eventTime)})`).join(", ")}.`
        : "");

  const url = `https://www.vestream.io/unlocks/report/${month}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${label} Token Unlock Report`,
      description: `The biggest token unlocks in ${label}, ranked by USD value across every protocol and chain Vestream tracks.`,
      datePublished: new Date(report.startSec * 1000).toISOString(),
      author: { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
      publisher: { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://www.vestream.io/" },
        { "@type": "ListItem", position: 2, name: "Unlocks", item: "https://www.vestream.io/unlocks" },
        { "@type": "ListItem", position: 3, name: "Reports", item: "https://www.vestream.io/unlocks/report" },
        { "@type": "ListItem", position: 4, name: `${label} Report`, item: url },
      ],
    },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="px-4 md:px-8 pt-20 md:pt-24 pb-8 max-w-5xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 flex-wrap text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/unlocks" style={{ color: "#8B8E92" }}>Unlocks</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/unlocks/report" style={{ color: "#8B8E92" }}>Reports</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" style={{ color: "#1A1D20", fontWeight: 600 }}>{label}</li>
          </ol>
        </nav>

        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#0F8A8A" }}>
          Token unlock report
        </p>
        <h1 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "#1A1D20", letterSpacing: "-0.03em" }}>
          {label} Token Unlock Report
        </h1>
        {/* Answer-first lead — plain text so answer engines lift it verbatim. */}
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-6 font-medium" style={{ color: "#1A1D20" }}>
          {answerLead}
        </p>

        {!report.isEmpty && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total unlock value" value={report.totalUsd > 0 ? fmtUsd(report.totalUsd) : "–"} sub="at today's prices" accent="#0F8A8A" />
            <Stat label="Unlock events" value={report.eventCount.toLocaleString()} sub={`${report.tokenCount.toLocaleString()} tokens`} accent="#E063A0" />
            <Stat label="Tokens" value={report.tokenCount.toLocaleString()} sub={`${report.chainCount} chains`} accent="#F0992E" />
            <Stat label="Protocols" value={report.byProtocol.length.toLocaleString()} sub="with unlocks" accent="#0BA0CB" />
          </div>
        )}
      </section>

      {report.isEmpty ? (
        <section className="px-4 md:px-8 pb-16 max-w-5xl mx-auto w-full">
          <div className="rounded-2xl p-8 text-center" style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)" }}>
            <p className="text-sm" style={{ color: "#8B8E92" }}>
              No unlock events are indexed for {label} yet. Check the{" "}
              <Link href="/unlocks" style={{ color: "#0F8A8A", fontWeight: 600 }}>live unlock calendar</Link> for the latest.
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* Biggest unlocks */}
          <section className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full">
            <h2 className="text-lg font-bold mb-1" style={{ color: "#1A1D20" }}>Biggest unlocks in {label}</h2>
            <p className="text-sm mb-4" style={{ color: "#8B8E92" }}>Ranked by USD value at today&apos;s price. Each links to the token&apos;s live vesting page.</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(21,23,26,0.08)", color: "#8B8E92" }}>
                      <th className="text-left font-semibold px-4 py-3">#</th>
                      <th className="text-left font-semibold px-4 py-3">Token</th>
                      <th className="text-left font-semibold px-4 py-3">Date</th>
                      <th className="text-right font-semibold px-4 py-3">Amount</th>
                      <th className="text-right font-semibold px-4 py-3">Value</th>
                      <th className="text-left font-semibold px-4 py-3">Protocol · Chain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topEvents.map((e, i) => (
                      <TokenRow key={`${e.chainId}-${e.address}-${e.eventTime}-${i}`} e={e} rank={i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* By protocol */}
          {report.byProtocol.length > 0 && (
            <section className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full">
              <h2 className="text-lg font-bold mb-4" style={{ color: "#1A1D20" }}>Unlocks by protocol</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {report.byProtocol.map((p) => (
                  <div key={p.protocol} className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "#1A1D20" }}>{p.name}</p>
                      <p className="text-xs" style={{ color: "#8B8E92" }}>{p.eventCount.toLocaleString()} events</p>
                    </div>
                    <p className="font-bold text-sm tabular-nums" style={{ color: "#0F8A8A" }}>{p.usdTotal > 0 ? fmtUsd(p.usdTotal) : "–"}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Activation + cluster links */}
      <section className="px-4 md:px-8 pb-10 max-w-5xl mx-auto w-full">
        <ScanWalletCTA
          surface="unlock_report"
          heading="Track your own token unlocks"
          sub="Paste any wallet — see every unlock across 10 protocols and 8 chains. Free, no sign-up."
        />
        <p className="text-sm mt-5 text-center" style={{ color: "#8B8E92" }}>
          See the <Link href="/unlocks" style={{ color: "#0F8A8A", fontWeight: 600 }}>live unlock calendar</Link>,{" "}
          <Link href="/unlocks/report" style={{ color: "#0F8A8A", fontWeight: 600 }}>all monthly reports</Link>, or read{" "}
          <Link href="/resources/what-is-token-vesting" style={{ color: "#0F8A8A", fontWeight: 600 }}>the complete guide to token vesting</Link>.
        </p>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "white", border: "1px solid rgba(21,23,26,0.08)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#8B8E92" }}>{label}</p>
      <p className="text-xl font-bold tabular-nums" style={{ color: accent }}>{value}</p>
      <p className="text-xs mt-0.5" style={{ color: "#B8BABD" }}>{sub}</p>
    </div>
  );
}

function TokenRow({ e, rank }: { e: MonthlyReportEvent; rank: number }) {
  const chain = CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`;
  return (
    <tr style={{ borderBottom: "1px solid rgba(21,23,26,0.05)" }}>
      <td className="px-4 py-3 tabular-nums" style={{ color: "#B8BABD" }}>{rank}</td>
      <td className="px-4 py-3">
        <Link href={`/token/${e.chainId}/${e.address}`} className="font-semibold hover:underline" style={{ color: "#1A1D20" }}>
          {tokenLabel(e.symbol, e.address)}
        </Link>
      </td>
      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#475569" }}>{dayFmt(e.eventTime)}</td>
      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap" style={{ color: "#475569" }}>{fmtAmount(e.amount, e.decimals)}</td>
      <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: e.usdValue != null ? "#0F8A8A" : "#B8BABD" }}>
        {e.usdValue != null ? fmtUsd(e.usdValue) : "no price"}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "#8B8E92" }}>{e.protocol} · {chain}</td>
    </tr>
  );
}
