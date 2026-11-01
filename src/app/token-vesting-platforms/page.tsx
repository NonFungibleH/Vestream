// /token-vesting-platforms — every vesting platform Vestream indexes, compared
// on the same live on-chain numbers (SEO roadmap, Phase 2, 2026-10-31).
//
// Targets "token vesting platform / tool / provider / service" and the AI
// "evaluate X on Y" queries. The platforms' own comparison pages are written
// by one side; this one is neutral by construction: the same three measured
// columns for everyone, sorted by value locked, with each platform described
// in plain words rather than its marketing tagline. Status notes appear only
// where the platform has said so itself, linked to its own statement.
//
// Every figure is Vestream's coverage (the chains and contracts we index), not
// a platform's full deployment; the copy says so wherever a number appears.
//
// Data: the shared /protocols loader (lib/vesting/protocols-page-data.ts),
// with the same last-good fallback, so build prerenders bake real numbers.

import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ScanWalletCTA } from "@/components/ScanWalletCTA";
import { chainBrand, listProtocols, type ProtocolMeta } from "@/lib/protocol-constants";
import { protocolGuides } from "@/lib/protocol-guides";
import { loadProtocolsData, type ProtocolsPageData } from "@/lib/vesting/protocols-page-data";
import { getLastGoodProtocolsData, setLastGoodProtocolsData } from "@/lib/vesting/page-data-fallback";
import { formatUsdCompact as fmtUsd } from "@/lib/vesting/quick-prices";

export const revalidate = 3600;
export const maxDuration = 60;

const URL_ = "https://www.vestream.io/token-vesting-platforms";
const TITLE = "Token Vesting Platforms Compared (2026)";
const DESC =
  "Token vesting platforms compared on live on-chain data from the chains Vestream tracks: value locked and active schedules for Sablier, Hedgey and more.";

export const metadata: Metadata = {
  title: `${TITLE} | Vestream`,
  description: DESC,
  alternates: { canonical: URL_ },
  openGraph: { title: TITLE, description: DESC, url: URL_, siteName: "Vestream", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

// How each platform vests, in plain words (not its marketing tagline). Facts
// from our protocol explainers in lib/articles.ts.
const HOW_IT_VESTS: Record<string, string> = {
  "sablier":      "Linear, cliff and tranched streams; each stream is an NFT",
  "sablier-flow": "Open-ended per-second payment streams",
  "hedgey":       "Vesting plans and token grants held as NFTs",
  "team-finance": "Token and liquidity locks with vesting",
  "uncx":         "Liquidity lockers plus vesting contracts",
  "unvest":       "No-code cliffs, linear and milestone unlocks",
  "superfluid":   "A one-time cliff, then a continuous per-second flow",
  "pinksale":     "PinkLock locks and cycle-based vesting locks",
  "streamflow":   "Vesting and streams for SPL tokens",
  "llamapay":     "Per-second payment streams for payroll",
  "jupiter-lock": "Cliff, then periodic releases",
  "smithii":      "No-code token locks and vesting",
  "hoodlock":     "Token and liquidity locks with vesting",
  "magna":        "Merkle-based vesting, airdrops and claim portals",
};

// Only statements the platform made itself, linked to the source.
const STATUS: Record<string, { text: string; href: string }> = {
  "sablier": {
    text: "Sablier Labs entered maintenance mode on 13 July 2026. Existing streams keep working on-chain.",
    href: "https://blog.sablier.com/sablier-labs-is-entering-maintenance-mode",
  },
  "uncx": {
    text: "UNCX says new vesting schedule creation is currently unavailable in its app.",
    href: "https://uncx.network/llms.txt",
  },
};

interface Row {
  meta:    ProtocolMeta;
  active:  number;
  total:   number;
  tvlUsd:  number;
  viaDefiLlama: boolean;
  chains:  string[];
  guide:   { href: string; title: string } | null;
}

function fmtCount(n: number): string {
  return n > 0 ? n.toLocaleString("en-US") : "-";
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

async function loadRows(): Promise<{ rows: Row[]; asOf: string | null }> {
  const protocols = listProtocols();
  let data: ProtocolsPageData | null = null;
  try {
    data = await loadProtocolsData();
    const good = data;
    after(() => setLastGoodProtocolsData(good));
  } catch {
    data = await getLastGoodProtocolsData<ProtocolsPageData>();
  }
  const stats = new Map(data?.statsEntries ?? []);
  const rows: Row[] = protocols.map((meta) => {
    const s = stats.get(meta.slug) ?? null;
    const guides = protocolGuides(meta.slug);
    // Prefer the recipient's claim guide; fall back to the explainer.
    const claim = guides.find((g) => /claim|unlock|withdraw/i.test(g.slug)) ?? guides[0] ?? null;
    return {
      meta,
      active: s?.activeStreams ?? 0,
      total:  s?.totalStreams ?? 0,
      tvlUsd: data?.tvlMap[meta.slug]?.tvlUsd ?? 0,
      viaDefiLlama: data?.methodologyMap[meta.slug] === "defillama-vesting",
      chains: meta.chainIds.map((id) => chainBrand(id).name),
      guide:  claim ? { href: claim.href, title: claim.title } : null,
    };
  });
  rows.sort((a, b) => b.tvlUsd - a.tvlUsd || b.active - a.active);
  const dates = Object.values(data?.computedAtMap ?? {}).sort();
  return { rows, asOf: dates.at(-1) ?? null };
}

export default async function TokenVestingPlatformsPage() {
  const { rows, asOf } = await loadRows();
  const asOfLabel = asOf
    ? new Date(asOf).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;

  const byTvl    = rows.filter((r) => r.tvlUsd > 0).slice(0, 3);
  const byActive = [...rows].sort((a, b) => b.active - a.active)[0];
  const solana   = rows.filter((r) => r.chains.includes("Solana")).map((r) => r.meta.name);

  const quickAnswer =
    `Vestream indexes ${rows.length} token vesting platforms on-chain. ` +
    (byTvl.length === 3
      ? `On the chains we track, the largest by value locked are ${byTvl[0].meta.name} (${fmtUsd(byTvl[0].tvlUsd)}), ${byTvl[1].meta.name} (${fmtUsd(byTvl[1].tvlUsd)}) and ${byTvl[2].meta.name} (${fmtUsd(byTvl[2].tvlUsd)}). `
      : "") +
    (byActive && byActive.active > 0
      ? `${byActive.meta.name} has the most active schedules in our index (${fmtCount(byActive.active)}). `
      : "") +
    `Most platforms run on more chains than we track, so their full totals are higher. There is no single best platform: the right one depends on your chain and on whether you need cliffs, streams or transferable plans.`;

  const faq = [
    {
      q: "What are the top token vesting platforms?",
      a: byTvl.length === 3
        ? `By value locked on the chains Vestream tracks, the largest are ${byTvl[0].meta.name}, ${byTvl[1].meta.name} and ${byTvl[2].meta.name}. By active schedules, ${byActive.meta.name} leads. The full table above ranks all ${rows.length}.`
        : `The table above compares all ${rows.length} platforms Vestream indexes on value locked, active schedules and chains.`,
    },
    {
      q: "Which token vesting platforms work on Solana?",
      a: `On Solana, Vestream currently tracks ${listWords(solana)}. Other platforms support Solana too (Team Finance, for example, lists it on its own site), so check each platform's site for its full chain list.`,
    },
    {
      q: "What is the difference between a token locker and a vesting platform?",
      a: "A locker holds tokens until one date, then releases them all; projects use lockers mainly to prove liquidity can't be pulled. A vesting platform releases tokens over time, through a cliff, a linear stream or regular tranches. Several platforms, such as UNCX, Team Finance and PinkSale, offer both.",
    },
    {
      q: "Can I track vestings from different platforms in one place?",
      a: `Yes. Paste a wallet address into Vestream's free scanner and it reads every platform in this table on the chains we track, and lists what the wallet is owed and when each unlock lands.`,
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${URL_}#page`,
        url: URL_,
        name: TITLE,
        description: DESC,
        abstract: quickAnswer,
        isPartOf: { "@id": "https://www.vestream.io/#website" },
        ...(asOf ? { dateModified: asOf } : {}),
      },
      {
        "@type": "ItemList",
        name: "Token vesting platforms by value locked on the chains Vestream tracks",
        itemListElement: rows.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: r.meta.name,
          url: `https://www.vestream.io/protocols/${r.meta.slug}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  const th = "px-3 py-3 text-left font-semibold whitespace-nowrap";
  const td = "px-3 py-3 align-top";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteNav theme="light" />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-8 pt-28 pb-20">
        <nav className="text-xs mb-6" style={{ color: "#8B8E92" }}>
          <Link href="/protocols" className="underline">Protocols</Link> / Platforms compared
        </nav>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4" style={{ textWrap: "balance" }}>
          Token vesting platforms compared
        </h1>
        <p className="text-lg leading-relaxed mb-6 max-w-3xl" style={{ color: "#5B5E62" }}>
          Every vesting platform Vestream indexes, measured the same way from on-chain data on the chains we
          track: how much is locked and how many schedules are still running. Most platforms also run on chains
          we don&rsquo;t index yet, so their full totals are higher than shown here.
          {asOfLabel && <> Figures as of {asOfLabel}.</>}
        </p>

        <div className="my-6 rounded-2xl p-5 max-w-3xl"
          style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.05), rgba(15,138,138,0.05))", border: "1px solid rgba(28,184,184,0.15)" }}>
          <div className="font-bold text-sm mb-2" style={{ color: "#1e40af" }}>The short version</div>
          <p className="text-sm leading-relaxed" style={{ color: "#334155" }}>{quickAnswer}</p>
        </div>

        <div className="overflow-x-auto rounded-2xl mt-10" style={{ border: "1px solid #e2e8f0", background: "white" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#F5F5F3", borderBottom: "1px solid #e2e8f0" }}>
                <th className={th}>Platform</th>
                <th className={th}>How it vests</th>
                <th className={`${th} text-right`}>Value locked</th>
                <th className={`${th} text-right`}>Active schedules</th>
                <th className={th}>Chains we track</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.meta.slug} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td className={`${td} font-semibold whitespace-nowrap`}>
                    <Link href={`/protocols/${r.meta.slug}`} className="underline" style={{ color: "#0F8A8A" }}>{r.meta.name}</Link>
                  </td>
                  <td className={td} style={{ color: "#334155", minWidth: 200 }}>{HOW_IT_VESTS[r.meta.slug] ?? r.meta.tagline}</td>
                  <td className={`${td} text-right tabular-nums whitespace-nowrap`}>
                    {fmtUsd(r.tvlUsd)}
                    {r.viaDefiLlama && <div className="text-[11px]" style={{ color: "#8B8E92" }}>via DefiLlama</div>}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtCount(r.active)}</td>
                  <td className={td} style={{ color: "#5B5E62", minWidth: 180 }}>{r.chains.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-3 max-w-3xl" style={{ color: "#8B8E92" }}>
          Value locked is tokens still held in each platform&rsquo;s contracts, priced at market; tokens with no
          market price count as zero. Active schedules have not finished vesting. Figures cover only the chains
          and contracts Vestream indexes, not each platform&rsquo;s full deployment, except values marked
          &ldquo;via DefiLlama&rdquo;, which are DefiLlama&rsquo;s own figure for that platform. Sorted by value
          locked. How we measure: <Link href="/methodology" className="underline">methodology</Link>.
        </p>

        <h2 className="text-2xl font-bold mt-14 mb-4">How to choose</h2>
        <ul className="space-y-3 max-w-3xl text-base leading-relaxed" style={{ color: "#334155" }}>
          <li><strong>Start with your chain.</strong> Check each platform&rsquo;s own site for the chains it supports; the table above lists only the chains we track.</li>
          <li><strong>Match the release shape.</strong> Cliffs and tranches suit team and investor allocations; per-second streams suit payroll and grants.</li>
          <li><strong>Decide who can move a position.</strong> Some platforms make each plan an NFT the recipient can transfer; others tie it to one wallet.</li>
          <li><strong>Check the claim experience.</strong> Recipients almost always have to claim; nothing arrives on its own. A clear claim page saves your recipients support tickets.</li>
          <li><strong>Check the platform is still taking new schedules.</strong> See the notes below.</li>
        </ul>

        <h2 className="text-2xl font-bold mt-14 mb-4">Platform notes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.meta.slug} className="rounded-2xl p-4" style={{ background: "white", border: "1px solid #e2e8f0" }}>
              <div className="font-semibold mb-1">{r.meta.name}</div>
              <p className="text-sm mb-2" style={{ color: "#5B5E62" }}>
                {HOW_IT_VESTS[r.meta.slug] ?? r.meta.tagline}. {fmtCount(r.total)} schedules in our index, {fmtCount(r.active)} still active.
              </p>
              {STATUS[r.meta.slug] && (
                <p className="text-sm mb-2" style={{ color: "#92400e" }}>
                  {STATUS[r.meta.slug].text}{" "}
                  <a href={STATUS[r.meta.slug].href} className="underline" rel="noopener" target="_blank">Source</a>
                </p>
              )}
              <div className="text-sm flex flex-wrap gap-x-4 gap-y-1">
                <Link href={`/protocols/${r.meta.slug}`} className="underline" style={{ color: "#0F8A8A" }}>Live {r.meta.name} unlocks</Link>
                {r.guide && <Link href={r.guide.href} className="underline" style={{ color: "#0F8A8A" }}>{r.guide.title}</Link>}
              </div>
            </div>
          ))}
        </div>

        <h2 className="text-2xl font-bold mt-14 mb-4">Questions</h2>
        <div className="space-y-6 max-w-3xl">
          {faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold mb-1">{f.q}</h3>
              <p className="text-base leading-relaxed" style={{ color: "#334155" }}>{f.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-14">
          <ScanWalletCTA
            heading="Owed tokens on any of these platforms?"
            sub="Paste a wallet to see every vesting we track across all of them, on EVM chains and Solana."
            surface="platforms_compare"
          />
        </div>
      </main>

      <SiteFooter theme="light" />
    </div>
  );
}
