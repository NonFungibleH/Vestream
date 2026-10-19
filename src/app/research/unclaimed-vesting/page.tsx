// src/app/research/unclaimed-vesting/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unclaimed token vesting: the Oct 2026 cross-protocol study.
//
// Static research page. Every figure comes from lib/unclaimed-research.ts, which
// is also what the CSV download and the protocol pages read, so the three can't
// disagree. The full working (method per protocol, verification, numbers
// deliberately not published) is in docs/content/research-unclaimed-*.md.
//
// This is the page external articles cite, so it carries the method and the
// limitations in full and no product pitch beyond the footer CTA.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  UNCLAIMED_SUMMARY,
  UNCLAIMED_FULL_CENSUS_TOTAL,
  UNCLAIMED_SAMPLED_EST_TOTAL,
  SUPERFLUID_COMPLETION,
} from "@/lib/unclaimed-research";

const URL_ = "https://www.vestream.io/research/unclaimed-vesting";
const TITLE = "Unclaimed Token Vesting: What Happens After Tokens Unlock (Oct 2026)";
const DESC =
  "An on-chain study of about 1.28 million finished vesting schedules across 8 protocols, on EVM chains and Solana: how often unlocked tokens are never claimed, how much they are worth, and how the numbers were measured.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: URL_ },
  openGraph: { title: TITLE, description: DESC, url: URL_, type: "article" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

const fmt = (n: number) => n.toLocaleString("en-GB");
const usd = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`;

export default function UnclaimedVestingResearch() {
  const rows = UNCLAIMED_SUMMARY;
  const valued = rows.filter((r) => r.valueUsd);
  const valueLow  = valued.reduce((s, r) => s + r.valueUsd!.low, 0);
  const valueHigh = valued.reduce((s, r) => s + r.valueUsd!.high, 0);
  const estTotal  = UNCLAIMED_FULL_CENSUS_TOTAL + UNCLAIMED_SAMPLED_EST_TOTAL;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Unclaimed Token Vesting, October 2026",
    description: DESC,
    url: URL_,
    license: "https://creativecommons.org/licenses/by/4.0/",
    isAccessibleForFree: true,
    creator: [
      { "@type": "Person", name: "Howard Pearce" },
      { "@type": "Organization", name: "Vestream", url: "https://www.vestream.io" },
    ],
    datePublished: "2026-10-16",
    dateModified: "2026-10-18",
    temporalCoverage: "2026-10-06/2026-10-09",
    measurementTechnique: "Direct on-chain reads of vesting contracts and programs; full census for six protocols, seeded random samples of 6,000 for two Solana protocols.",
    variableMeasured: ["Finished vesting schedules", "Unclaimed share of finished schedules", "Never-claimed share of unclaimed schedules", "Unclaimed value in tokens with at least $10k liquidity"],
    keywords: ["unclaimed token vesting", "token unlocks", "vesting research", "on-chain data", "Sablier", "Hedgey", "UNCX", "Team Finance", "Unvest", "Smithii", "Streamflow", "Jupiter Lock"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${URL_}/data.csv` }],
  };

  const h2 = "text-2xl md:text-3xl font-bold mb-4";
  const p  = "text-base leading-relaxed mb-4";

  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#F5F5F3", color: "#1A1D20" }}>
      <SiteNav theme="light" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article className="px-4 md:px-8 pt-20 md:pt-24 pb-16 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: "#B8BABD" }}>
            <li><Link href="/" style={{ color: "#8B8E92" }}>Home</Link></li>
            <li aria-hidden>/</li>
            <li><Link href="/research/vesting-statistics" style={{ color: "#8B8E92" }}>Research</Link></li>
            <li aria-hidden>/</li>
            <li style={{ color: "#1A1D20" }}>Unclaimed vesting</li>
          </ol>
        </nav>

        <p className="text-[10.5px] font-semibold uppercase mb-3" style={{ letterSpacing: "0.18em", color: "#0F8A8A" }}>
          Research · Measured 6–9 October 2026
        </p>
        <h1 className="font-bold mb-4" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }}>
          Unclaimed token vesting: what happens after tokens unlock
        </h1>
        <p className="text-lg leading-relaxed mb-8" style={{ color: "#475569" }}>
          Most analysis of token vesting stops at the unlock date. This study looks at what happens next.
          We read about {fmt(Math.round(estTotal / 10_000) * 10_000)} finished vesting schedules across{" "}
          {rows.length} protocols, on EVM chains and Solana, directly from their contracts, and measured how
          many of them still hold tokens their recipient never collected.
        </p>

        {/* Key figures */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12">
          {[
            { v: fmt(UNCLAIMED_FULL_CENSUS_TOTAL), l: "finished schedules read individually, on six protocols" },
            { v: `~${fmt(UNCLAIMED_SAMPLED_EST_TOTAL)}`, l: "more estimated from random samples on two Solana protocols" },
            { v: `Up to ${usd(valueHigh)}`, l: `unclaimed in tokens that still trade, across the six valued protocols (${usd(valueLow)} on the strictest valuation)` },
          ].map((k) => (
            <div key={k.l} className="rounded-2xl p-5" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}>
              <div className="text-2xl font-bold" style={{ color: "#0F8A8A", letterSpacing: "-0.02em" }}>{k.v}</div>
              <div className="text-sm mt-1" style={{ color: "#5C6066" }}>{k.l}</div>
            </div>
          ))}
        </div>

        <h2 className={h2}>Key findings</h2>
        <ol className="list-decimal pl-5 mb-10 space-y-3 text-base leading-relaxed">
          <li><strong>Unclaimed tokens are common.</strong> The share of finished schedules still holding tokens ranges from 2.9% on Jupiter Lock to 87% on Unvest. On Sablier, the largest protocol measured, it is about 1 in 3 once a single airdrop is excluded. Rates are highest where airdrops dominate, and many airdrop recipients may never know the tokens are there.</li>
          <li><strong>People claim everything or nothing.</strong> Nearly 9 in 10 unclaimed schedules (between 78% and 97%, depending on the protocol) were never claimed once. Partial claimers are rare, and on Streamflow 148 of 150 of them made their last claim before the schedule ended.</li>
          <li><strong>Most of it is worth nothing, but not all of it.</strong> 87% of unclaimed Sablier streams are in tokens that no longer have a market. At the other end, a Hedgey plan worth about $152,000, in a token with a market deep enough to sell it, finished 15 months before measurement and was never touched, and an ARB grant worth about $27,000 had sat untouched for more than two years.</li>
          <li><strong>Headline figures are easily distorted.</strong> One airdrop was 61% of all unclaimed Sablier streams, and single team or treasury lockups were worth millions. Every figure below states what was excluded and why.</li>
          <li><strong>Push completes; pull often doesn&rsquo;t.</strong> On Superfluid, which supports both, {Math.round(100 * SUPERFLUID_COMPLETION.automatic.started / SUPERFLUID_COMPLETION.automatic.finished)}% of automatic schedules started as designed, while a third of claim-based ones ({fmt(SUPERFLUID_COMPLETION.claimBased.unclaimed)} of {fmt(SUPERFLUID_COMPLETION.claimBased.finished)}) were never claimed, though the two groups come from different payers. See <a href="#superfluid" className="underline" style={{ color: "#0F8A8A" }}>below</a>.</li>
          <li><strong>Third-party data often disagrees with the chain.</strong> One protocol&rsquo;s index kept 2,628 locks as unclaimed after they had been moved and emptied on-chain; another disagreed with the chain on 17.5% of contracts. Every figure here was checked against the contracts.</li>
        </ol>

        <h2 className={h2}>Results by protocol</h2>
        <div className="overflow-x-auto mb-3 rounded-2xl" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}>
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums", minWidth: 760 }}>
            <thead>
              <tr style={{ color: "#5C6066", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                {["Protocol", "Method", "Finished measured", "Unclaimed", "Never claimed (of unclaimed)", "Unclaimed value*"].map((h) => (
                  <th key={h} className="text-left font-semibold px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <td className="px-4 py-3 align-top">
                    <Link href={`/protocols/${r.slug}`} className="font-semibold hover:underline" style={{ color: "#1A1D20" }}>{r.protocol}</Link>
                    <div className="text-xs mt-0.5" style={{ color: "#8B8E92" }}>{r.chains}</div>
                  </td>
                  <td className="px-4 py-3 align-top">{r.method}</td>
                  <td className="px-4 py-3 align-top">
                    {fmt(r.finished)}{r.finishedEst ? <span style={{ color: "#8B8E92" }}> (~{fmt(r.finishedEst)} est.)</span> : null}
                    <div className="text-xs mt-0.5" style={{ color: "#8B8E92" }}>{r.scope}</div>
                  </td>
                  <td className="px-4 py-3 align-top font-semibold">
                    {r.unclaimedPct}%{r.ci ? <span className="font-normal" style={{ color: "#8B8E92" }}> (95% CI {r.ci[0]}–{r.ci[1]}%)</span> : null}
                    {r.unclaimedPctAdj ? <div className="text-xs font-normal mt-0.5" style={{ color: "#8B8E92" }}>{r.unclaimedPctAdj.pct}% {r.unclaimedPctAdj.note}</div> : null}
                  </td>
                  <td className="px-4 py-3 align-top">{r.neverTouchedPct}%</td>
                  <td className="px-4 py-3 align-top">
                    {r.valueUsd
                      ? <>{r.valueUsd.low === r.valueUsd.high ? `~${usd(r.valueUsd.low)}` : `${usd(r.valueUsd.low)}–${usd(r.valueUsd.high)}`}<div className="text-xs mt-0.5" style={{ color: "#8B8E92" }}>{r.valueUsd.note}</div></>
                      : <span style={{ color: "#8B8E92" }}>Not valued (sample)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mb-10" style={{ color: "#8B8E92" }}>
          *Value counts only tokens with at least $10,000 of DEX liquidity on the schedule&rsquo;s own chain, priced from DexScreener at measurement.
          Rates use different units per protocol (stated under each figure) and should not be averaged or summed.{" "}
          <a href="/research/unclaimed-vesting/data.csv" className="underline" style={{ color: "#0F8A8A" }}>Download the table as CSV</a>.
        </p>

        <h2 id="superfluid" className={h2}>Superfluid: the same payment, pushed or pulled</h2>
        <p className={p}>
          Superfluid&rsquo;s vesting scheduler can pay a schedule automatically, keeping the tokens in the payer&rsquo;s wallet
          until an automation service starts the stream, or it can ask the recipient to claim, with a deadline after which the
          schedule can never start. It isn&rsquo;t a controlled comparison: almost all claim-based schedules (99%) come from 16 payers
          on Optimism, while automatic ones come from about 130 payers across eight chains. But the gap is large, and it points
          the same way as everything else in this study.
        </p>
        <div className="overflow-x-auto mb-3 rounded-2xl" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}>
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums", minWidth: 560 }}>
            <thead>
              <tr style={{ color: "#5C6066", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                {["Schedule type", "Finished", "Completed the first step", "Never completed"].map((h) => (
                  <th key={h} className="text-left font-semibold px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <td className="px-4 py-3 font-semibold">Automatic (push)</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.automatic.finished)}</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.automatic.started)} started ({(100 * SUPERFLUID_COMPLETION.automatic.started / SUPERFLUID_COMPLETION.automatic.finished).toFixed(1)}%)</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.automatic.neverStarted)} never started</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold">Claim-based (pull)</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.claimBased.finished)}</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.claimBased.claimed)} claimed ({(100 * SUPERFLUID_COMPLETION.claimBased.claimed / SUPERFLUID_COMPLETION.claimBased.finished).toFixed(1)}%)</td>
                <td className="px-4 py-3">{fmt(SUPERFLUID_COMPLETION.claimBased.unclaimed)} never claimed, {fmt(SUPERFLUID_COMPLETION.claimBased.pastDeadline)} already past their deadline</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs mb-10" style={{ color: "#8B8E92" }}>
          Measured {SUPERFLUID_COMPLETION.measured} from Superfluid&rsquo;s own vesting-scheduler indexes on {SUPERFLUID_COMPLETION.chains}.
          Finished means the schedule&rsquo;s end date was more than 30 days before measurement. On a schedule past its claim
          deadline the tokens never left the payer&rsquo;s wallet, so nothing is left for the recipient to collect.
        </p>

        <h2 className={h2}>How it was measured</h2>
        <ul className="list-disc pl-5 mb-6 space-y-2 text-base leading-relaxed">
          <li><strong>Coverage varies by protocol.</strong> Sablier was measured through Sablier&rsquo;s own indexer, which covers every chain it is deployed on (25 EVM chains, more than Vestream itself tracks); the chains outside Vestream&rsquo;s coverage hold under 2% of Sablier&rsquo;s finished streams. The other protocols run on between one and six chains each, including Solana. Each protocol&rsquo;s chains are listed in the table.</li>
          <li><strong>Finished</strong> means the schedule&rsquo;s end date was more than 30 days before measurement (before 6 September 2026).</li>
          <li><strong>Unclaimed</strong> means more than 1% of the schedule&rsquo;s total is still held for the recipient. <strong>Never claimed</strong> means nothing was ever withdrawn.</li>
          <li><strong>Sources.</strong> Each protocol was read from its own contracts or program accounts: Sablier from its live indexer with on-chain spot checks; Hedgey from its event history on all four plan contracts; UNCX, Team Finance and Smithii directly from contract and vault balances; Unvest from its subgraph, reconciled to on-chain balances; Streamflow and Jupiter Lock from seeded random samples of 6,000 accounts each.</li>
          <li><strong>Exclusions.</strong> Testnets, test-named tokens, cancelled or revoked schedules, and schedules where the recipient is the project itself (a team locking or streaming to its own wallet) are excluded, so the figures describe tokens owed to someone else.</li>
          <li><strong>Verification.</strong> For each protocol, the largest positions were re-read on-chain to confirm the contract still holds the tokens and the recipient can claim them today. All passed.</li>
          <li><strong>Value.</strong> Mark-to-market at DexScreener prices, then capped at each token&rsquo;s pool depth, because several positions are larger than the market for their token. Unpriced tokens count as zero.</li>
        </ul>

        <h2 className={h2}>Limitations</h2>
        <ul className="list-disc pl-5 mb-10 space-y-2 text-base leading-relaxed">
          <li>Not every vesting protocol can be measured this way. Magna only reveals an allocation once it is claimed, and streaming payroll protocols (LlamaPay, Sablier Flow) have no &ldquo;finished and waiting&rdquo; state, so they are not included. Superfluid is reported separately above, because only its claim-based schedules can be left waiting.</li>
          <li>PinkSale is being measured and will be added when complete.</li>
          <li>Two protocols are sampled rather than censused; their rates carry the confidence intervals shown.</li>
          <li>&ldquo;Unclaimed&rdquo; does not always mean forgotten. Some recipients may be choosing not to claim, for example when a position is worth less than the fee to claim it. Others may never have known an airdrop existed, or may have lost access to the wallet.</li>
          <li>This is a snapshot. Claims made after measurement are not reflected.</li>
        </ul>

        <h2 className={h2}>Citing this research</h2>
        <p className={p} style={{ color: "#475569" }}>
          The data on this page is published under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="underline" style={{ color: "#0F8A8A" }} rel="license noopener" target="_blank">CC BY 4.0</a>:
          you can reuse it with attribution. Suggested citation:
        </p>
        <p className="text-sm rounded-xl p-4 mb-10" style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", color: "#1A1D20" }}>
          Pearce, H. (2026). <em>Unclaimed token vesting: what happens after tokens unlock</em>. Vestream. {URL_}
        </p>

        <p className="text-sm" style={{ color: "#8B8E92" }}>
          This research was carried out by Vestream, which tracks token vesting.{" "}
          <Link href="/find-vestings" className="underline" style={{ color: "#0F8A8A" }}>Check a wallet for unclaimed vestings</Link>.
        </p>
      </article>

      <SiteFooter theme="light" />
    </div>
  );
}
