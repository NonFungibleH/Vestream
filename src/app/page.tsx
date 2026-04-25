// src/app/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Homepage — per Vestream brand brief v1.0 §09 (Page structure & specific
// pages → Home).
//
//   Hero   — single H1 (Inter Tight 700, 64px, -0.035em, max 720px),
//            single deck paragraph (19px muted, max 640px), single
//            primary CTA + single secondary link. NO hero illustration.
//   Stats  — small live-data ticker in JetBrains Mono (real numbers).
//   How    — 3 column ascending-bars metaphor: schedule → release → claim.
//   Built  — "built for issuers / recipients / auditors" — 3 cards.
//   Logos  — protocol pills (mono, hairline rule above).
//   Final  — CTA section with paper-2 with 5% teal mix background.
//
// Data: real numbers come from getProtocolStats + readAllSnapshots so the
// hero ticker isn't decorative. Page revalidates every 60s.
//
// Strict adherence to brand brief:
//   - 80/15/5 colour rule (paper/ink anchor, teal as 5% spotlight)
//   - 3-4px corner radii everywhere except iOS app icon
//   - No gradients (anywhere)
//   - Inter Tight everywhere human-readable; JetBrains Mono for numbers,
//     addresses, eyebrow labels.
//   - No emoji in copy.
//   - Live-state principle: the brand metaphor (ascending bars, bottom one
//     teal = currently streaming) is echoed in the "How it works" section
//     and in the LiveDot pulses.
// ─────────────────────────────────────────────────────────────────────────────

import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/brand/Button";
import {
  Eyebrow,
  HairlineRule,
  Container,
  LiveDot,
} from "@/components/brand/primitives";
import { listProtocols } from "@/lib/protocol-constants";
import {
  getProtocolStats,
  relativeFreshness,
  toDateSafe,
  type ProtocolStats,
} from "@/lib/vesting/protocol-stats";
import { readAllSnapshots } from "@/lib/vesting/tvl-snapshot";

// ISR — once a minute keeps the ticker fresh without hammering the DB.
export const revalidate = 60;

// ─── Data fetch ─────────────────────────────────────────────────────────────

async function getHomepageLive() {
  // Aggregate across every protocol — any single-protocol failure must not
  // sink the homepage render. Same defensive pattern we use on /protocols.
  try {
    const protocols = listProtocols();
    const [statsResults, snapshots] = await Promise.all([
      Promise.all(
        protocols.map(async (p) => {
          try {
            return await getProtocolStats(p.adapterIds);
          } catch {
            return null;
          }
        }),
      ),
      readAllSnapshots().catch(() => []),
    ]);

    const valid = statsResults.filter((s): s is ProtocolStats => !!s);
    const totalStreams = valid.reduce((sum, s) => sum + s.totalStreams, 0);
    const tvlUsd       = snapshots.reduce((sum, r) => sum + r.tvlUsd, 0);
    const lastIndexedAt = valid.reduce<Date | null>((latest, s) => {
      const d = toDateSafe(s.lastIndexedAt);
      if (!d) return latest;
      if (!latest || d > latest) return d;
      return latest;
    }, null);

    return {
      tvlUsd,
      totalStreams,
      protocolCount: protocols.length,
      lastIndexedAt,
    };
  } catch {
    return { tvlUsd: 0, totalStreams: 0, protocolCount: 9, lastIndexedAt: null };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function commaNum(n: number): string {
  return n.toLocaleString("en-US");
}

// Protocol display rows — small color tile per protocol kept (option B per
// brand discussion). Everything else around them is brand-neutral.
const PROTOCOLS_DISPLAY = [
  { name: "Sablier",      color: "#f97316", initial: "S" },
  { name: "Hedgey",       color: "#7c3aed", initial: "H" },
  { name: "UNCX",         color: "#2563eb", initial: "U" },
  { name: "Team Finance", color: "#10b981", initial: "T" },
  { name: "Unvest",       color: "#06b6d4", initial: "U" },
  { name: "Superfluid",   color: "#1db954", initial: "S" },
  { name: "PinkSale",     color: "#ec4899", initial: "P" },
  { name: "Streamflow",   color: "#14f195", initial: "S" },
  { name: "Jupiter Lock", color: "#fbbf24", initial: "J" },
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function Home() {
  const live = await getHomepageLive();
  const freshness = relativeFreshness(live.lastIndexedAt);

  return (
    <main className="min-h-screen" style={{ background: "var(--paper)", color: "var(--ink)" }}>
      <SiteNav />

      {/* ═══ HERO ════════════════════════════════════════════════════════════ */}
      <section className="pt-24 pb-16 md:pt-32 md:pb-24">
        <Container>
          <div className="text-center max-w-[720px] mx-auto">
            <Eyebrow tone="accent" className="mb-6 inline-flex items-center">
              <LiveDot className="mr-2 align-middle" />
              VESTING · ON ANY CHAIN · IN REAL TIME
            </Eyebrow>

            <h1
              className="font-bold mb-6"
              style={{
                fontFamily:    "var(--font-sans)",
                fontSize:      "clamp(40px, 6vw, 64px)",
                letterSpacing: "-0.035em",
                lineHeight:    0.98,
                color:         "var(--ink)",
              }}
            >
              Token streams that never miss a cliff.
            </h1>

            <p
              className="mx-auto mb-10"
              style={{
                fontSize:   19,
                lineHeight: 1.6,
                color:      "var(--grey-1)",
                maxWidth:   640,
              }}
            >
              Run vesting at scale across nine protocols and five chains — fully on-chain,
              fully auditable, with a recipient experience that doesn&rsquo;t require a Discord support thread.
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button href="/find-vestings" variant="primary" size="hero">
                Find my vestings
              </Button>
              <Button href="/protocols" variant="tertiary" size="hero">
                See live data &rarr;
              </Button>
            </div>
          </div>
        </Container>
      </section>

      {/* ═══ LIVE STATS STRIP — mono numbers, hairline rules between ════════ */}
      <section className="pb-24">
        <Container>
          <HairlineRule />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8">
            <Stat label="Vesting TVL"     value={compactUsd(live.tvlUsd)}    />
            <Stat label="Schedules"       value={commaNum(live.totalStreams)} />
            <Stat label="Protocols"       value={String(live.protocolCount)}  />
            <Stat label="Last sync"       value={freshness} subtle />
          </div>
          <HairlineRule />
        </Container>
      </section>

      {/* ═══ HOW IT WORKS — schedule → release → claim ═══════════════════════ */}
      <section className="pb-24 md:pb-32">
        <Container>
          <div className="max-w-[640px] mb-16">
            <Eyebrow className="mb-3 block">SECTION 01 · HOW IT WORKS</Eyebrow>
            <h2
              className="text-3xl md:text-[40px] font-semibold leading-tight"
              style={{ letterSpacing: "-0.025em" }}
            >
              From schedule to claim, on one rail.
            </h2>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-px"
            style={{ background: "var(--rule)" }}
          >
            <HowStep
              num="01"
              title="Schedule"
              body="Issuers deploy vesting contracts on any of nine supported protocols. Vestream indexes the schedule the moment it lands on chain."
              barFraction={0.35}
            />
            <HowStep
              num="02"
              title="Release"
              body="Tranches unlock per the contract. The currently-streaming tranche is highlighted live on every recipient's dashboard."
              barFraction={0.65}
              accent
            />
            <HowStep
              num="03"
              title="Claim"
              body="Recipients claim with one tap when they see the live indicator. Push, email, or Slack alert before every cliff."
              barFraction={0.95}
            />
          </div>
        </Container>
      </section>

      {/* ═══ BUILT FOR — issuers / recipients / auditors ════════════════════ */}
      <section className="pb-24 md:pb-32" style={{ background: "var(--paper-2)" }}>
        <Container>
          <div className="pt-20 pb-4">
            <div className="max-w-[640px] mb-16">
              <Eyebrow className="mb-3 block">SECTION 02 · BUILT FOR</Eyebrow>
              <h2
                className="text-3xl md:text-[40px] font-semibold leading-tight"
                style={{ letterSpacing: "-0.025em" }}
              >
                For issuers, recipients, and auditors.
              </h2>
              <p
                className="mt-4 text-base leading-relaxed"
                style={{ color: "var(--grey-1)", maxWidth: 640 }}
              >
                One product, three first-class views. Every screen answers the
                user&rsquo;s most pressing question first, in plain numbers.
              </p>
            </div>

            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-px"
              style={{ background: "var(--rule)" }}
            >
              <AudienceCard
                eyebrow="01"
                title="Issuers / treasuries"
                question="How do I run vesting at scale?"
                body="Foundation ops, finance leads, RWA platforms running unlock schedules across hundreds of recipients. No spreadsheet, no in-house engineer, no prayer."
                features={[
                  "Bulk schedule administration",
                  "Recipient-aware notifications",
                  "Audit-ready exports",
                ]}
              />
              <AudienceCard
                eyebrow="02"
                title="Recipients"
                question="What's vested? What's claimable?"
                body="Investors, advisors, employees holding tokens with a future. Vested past, currently-streaming, and locked future — all on one screen."
                features={[
                  "Live unlock indicator",
                  "Push alerts before every cliff",
                  "One-tap claim links",
                ]}
              />
              <AudienceCard
                eyebrow="03"
                title="Auditors / counterparties"
                question="Are these schedules real and on-chain?"
                body="Legal, finance, and due-diligence teams reviewing tokenomics. Verify what's locked, by whom, until when — without trusting a screenshot."
                features={[
                  "Direct on-chain references",
                  "Time-stamped snapshots",
                  "REST + MCP API access",
                ]}
              />
            </div>
          </div>
        </Container>
      </section>

      {/* ═══ INTEGRATED WITH — protocol pills with mono labels ═══════════════ */}
      <section className="pb-24 md:pb-32">
        <Container>
          <HairlineRule />
          <div className="pt-12 pb-2 text-center">
            <Eyebrow className="mb-6 block">INDEXED ACROSS</Eyebrow>
            <div className="flex items-center justify-center gap-2 flex-wrap mb-4">
              {PROTOCOLS_DISPLAY.map((p) => (
                <ProtocolPill key={p.name} {...p} />
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap mt-6">
              <Eyebrow>ON</Eyebrow>
              {["Ethereum", "BNB Chain", "Polygon", "Base", "Solana"].map((c) => (
                <span
                  key={c}
                  className="px-3 py-1.5"
                  style={{
                    fontSize:     12,
                    color:        "var(--ink)",
                    fontFamily:   "var(--font-mono)",
                    border:       "1px solid var(--rule-2)",
                    borderRadius: 3,
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ═══ FINAL CTA — paper-2 with 5% teal mix background ═════════════════ */}
      <section className="pb-24 md:pb-32">
        <Container>
          <div
            className="px-8 py-16 md:px-16 md:py-20 text-center"
            style={{
              background:   "color-mix(in srgb, var(--paper-2) 95%, var(--teal) 5%)",
              border:       "1px solid var(--rule)",
              borderRadius: 4,
            }}
          >
            <Eyebrow tone="accent" className="mb-4 inline-flex items-center">
              <LiveDot className="mr-2 align-middle" />
              READY WHEN YOU ARE
            </Eyebrow>
            <h2
              className="font-bold mb-5 mx-auto"
              style={{
                fontFamily:    "var(--font-sans)",
                fontSize:      "clamp(32px, 4vw, 48px)",
                letterSpacing: "-0.025em",
                lineHeight:    1.05,
                color:         "var(--ink)",
                maxWidth:      720,
              }}
            >
              Know what&rsquo;s claimable, the moment it&rsquo;s claimable.
            </h2>
            <p
              className="mx-auto mb-10 text-base md:text-lg"
              style={{ color: "var(--grey-1)", maxWidth: 560, lineHeight: 1.6 }}
            >
              Paste any wallet address. Free, no signup. Real on-chain data in under thirty seconds.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button href="/find-vestings" variant="primary" size="hero">
                Find my vestings
              </Button>
              <Button href="/pricing" variant="secondary" size="hero">
                See pricing
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <SiteFooter />
    </main>
  );
}

// ─── Section bits ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  subtle,
}: {
  label:   string;
  value:   string;
  subtle?: boolean;
}) {
  return (
    <div className="flex flex-col items-start md:items-center px-4 py-8 md:py-12">
      <span
        style={{
          fontFamily:         "var(--font-mono)",
          fontSize:           subtle ? 28 : 36,
          fontWeight:         500,
          letterSpacing:      "-0.01em",
          color:              "var(--ink)",
          fontVariantNumeric: "tabular-nums lining-nums",
        }}
      >
        {value}
      </span>
      <Eyebrow className="mt-2">{label}</Eyebrow>
    </div>
  );
}

function HowStep({
  num,
  title,
  body,
  barFraction,
  accent = false,
}: {
  num:         string;
  title:       string;
  body:        string;
  barFraction: number;
  accent?:     boolean;
}) {
  return (
    <div
      className="p-8 md:p-10"
      style={{ background: "var(--paper)", minHeight: 320 }}
    >
      <Eyebrow className="block mb-5">STEP · {num}</Eyebrow>

      {/* Brand-mark echo: three ascending bars, with the active one in teal
          per the "live state" principle (brief §07). The accent step is the
          step we're currently mid-flight on in the metaphor (release). */}
      <div className="flex flex-col gap-1 mb-6 mt-2" aria-hidden="true">
        <span style={{ display: "block", height: 6, width: "30%", background: "var(--ink)", opacity: 0.35 }} />
        <span style={{ display: "block", height: 6, width: "55%", background: "var(--ink)", opacity: 0.65 }} />
        <span
          style={{
            display:    "block",
            height:     6,
            width:      `${Math.round(barFraction * 100)}%`,
            background: accent ? "var(--teal)" : "var(--ink)",
            opacity:    accent ? 1 : 0.85,
          }}
        />
      </div>

      <h3
        className="text-xl font-semibold mb-3"
        style={{ letterSpacing: "-0.015em", color: "var(--ink)" }}
      >
        {title}
      </h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--grey-1)" }}>
        {body}
      </p>
    </div>
  );
}

function AudienceCard({
  eyebrow,
  title,
  question,
  body,
  features,
}: {
  eyebrow:  string;
  title:    string;
  question: string;
  body:     string;
  features: readonly string[];
}) {
  return (
    <div
      className="p-8 md:p-10 flex flex-col gap-5"
      style={{ background: "var(--paper)", minHeight: 360 }}
    >
      <Eyebrow className="block">FOR · {eyebrow}</Eyebrow>

      <h3
        className="text-xl font-semibold"
        style={{ letterSpacing: "-0.015em", color: "var(--ink)" }}
      >
        {title}
      </h3>

      <p
        className="text-base"
        style={{
          fontFamily: "var(--font-mono)",
          color:      "var(--ink)",
          fontStyle:  "italic",
          lineHeight: 1.5,
        }}
      >
        &ldquo;{question}&rdquo;
      </p>

      <p className="text-sm leading-relaxed" style={{ color: "var(--grey-1)" }}>
        {body}
      </p>

      <ul
        className="flex flex-col gap-2 mt-auto pt-4"
        style={{ borderTop: "1px solid var(--rule)" }}
      >
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--ink)" }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}>·</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProtocolPill({
  name,
  color,
  initial,
}: {
  name:    string;
  color:   string;
  initial: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5"
      style={{
        background:   "var(--paper)",
        border:       "1px solid var(--rule-2)",
        borderRadius: 3,
        color:        "var(--ink)",
      }}
    >
      {/* Small protocol-color tile (option B per brand discussion).
          Everything around it is brand-neutral. */}
      <span
        style={{
          width: 18,
          height: 18,
          background: color,
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 2,
        }}
      >
        {initial}
      </span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
    </span>
  );
}
