// src/app/faq/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive FAQ page — primarily a Search/AI Optimisation surface. The
// homepage carries a short 10-question FAQ aimed at scanners; this page goes
// deeper with grouped categories, self-contained long-form answers, and
// schema.org FAQPage JSON-LD so Google and AI search engines can parse each
// Q&A as a discrete structured fact.
//
// Guidance for editing:
//   - Keep each answer self-contained: a reader (human or LLM) should be able
//     to quote a single Q&A and have it make sense without the rest of the
//     page.
//   - Avoid marketing hype in answers — concrete specifics beat adjectives
//     for both ranking and user trust. Numbers, chain names, protocol names,
//     prices should appear verbatim.
//   - Rename categories or reorder only if you also update the `FAQ_DATA`
//     array and the category anchor map below. The JSON-LD regenerates
//     from the same array so it stays in sync automatically.
//   - Do not add promotional copy between questions. Google penalises
//     "fluff" between FAQ entries when they're marked up as FAQPage.
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "FAQ — TokenVest | Token vesting, unlock alerts, developer API",
  description:
    "Answers to every common question about TokenVest: supported protocols and chains, how unlock alerts work, pricing, security, the developer REST API and MCP server, mobile app, account management, and more.",
  alternates: { canonical: "https://vestream.io/faq" },
  openGraph: {
    title: "TokenVest FAQ",
    description:
      "Everything you need to know about tracking token vesting with TokenVest — supported protocols, unlock alerts, pricing, developer API, and more.",
    url: "https://vestream.io/faq",
    siteName: "TokenVest",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TokenVest FAQ",
    description:
      "Supported protocols, unlock alerts, pricing, developer API, mobile app — answered in depth.",
  },
};

// ── Content ─────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: string; // Markdown-lite: plain prose; <strong>, <code>, <a> allowed.
}

interface FaqCategory {
  slug: string;          // URL anchor (#getting-started)
  title: string;         // Section heading
  summary: string;       // 1-line intro shown under the H2
  items: FaqItem[];
}

const FAQ_DATA: FaqCategory[] = [
  {
    slug:    "getting-started",
    title:   "Getting started",
    summary: "New to TokenVest? Start here.",
    items: [
      {
        q: "What is TokenVest?",
        a: "TokenVest is a cross-protocol, cross-chain tracker for on-chain token vesting. It indexes every public vesting schedule from seven major platforms — Sablier, Hedgey, UNCX, Unvest, Team Finance, Superfluid, and PinkSale — across Ethereum, Base, BNB Chain, and Polygon, and gives you one dashboard to see every unlock coming to any wallet, plus email and push alerts before each one.",
      },
      {
        q: "Who is TokenVest for?",
        a: "Three audiences: (1) token holders who need to know when their vested allocations unlock so they can claim, decide whether to sell, or plan tax events; (2) funds and team treasuries tracking investor allocations, cliffs, and unlock schedules across multiple positions; (3) developers and AI agent builders who want programmatic access to normalised vesting data via our REST API or MCP server.",
      },
      {
        q: "How do I start using TokenVest?",
        a: "Go to /early-access, enter your email, and you'll get a one-time code to sign in. From there you add any wallet — EVM 0x… address or Solana pubkey — and TokenVest automatically scans it across all 8 protocols and 5 chains. Free plan tracks 1 wallet; Pro tracks 3; Enterprise is unlimited.",
      },
      {
        q: "Do I need to connect my wallet to use TokenVest?",
        a: "No. TokenVest is strictly a read-only, address-watching tracker — you enter addresses as text, not by connecting a wallet. There is no wallet-signing step, no transaction approval, no access to your keys. Email OTP is the only login required.",
      },
      {
        q: "Do I need to know what protocol my tokens are vested on?",
        a: "No. When you add a wallet address, TokenVest auto-scans all 8 supported protocols across all 5 chains (EVM + Solana) and surfaces every vesting stream found — you don't need to know in advance which platform your tokens are on.",
      },
    ],
  },
  {
    slug:    "protocols-and-chains",
    title:   "Protocols & chains",
    summary: "What TokenVest indexes, and how the data gets there.",
    items: [
      {
        q: "Which vesting protocols does TokenVest support?",
        a: "Seven as of today: Sablier (linear and tranched streaming), Hedgey (NFT-based vesting plans), UNCX Network (TokenVesting and VestingManager locker contracts), Unvest (step/milestone vesting), Team Finance (team token vesting), Superfluid (cliff + linear streaming via its VestingScheduler), and PinkSale PinkLock V2 (TGE + cycle schedules). Each protocol has its own dedicated adapter that normalises its data into a shared VestingStream shape.",
      },
      {
        q: "Which blockchains are supported?",
        a: "Four production chains: Ethereum mainnet (chainId 1), BNB Chain (56), Polygon (137), and Base (8453). Ethereum Sepolia (11155111) and Base Sepolia (84532) are also supported for testing and contract deployments that haven't yet shipped on mainnet.",
      },
      {
        q: "How does TokenVest get the vesting data?",
        a: "For six protocols (Sablier, Hedgey, UNCX, UNCX-VestingManager, Unvest, Team Finance) we query each protocol's official subgraph on The Graph Network — same data source the protocol's own frontend uses. Superfluid is queried via its hosted subgraph. PinkSale is the exception: it has no subgraph, so we read the PinkLock V2 contract directly via viem RPC calls. All data is public, on-chain, and matches what you'd see on the protocol's native UI.",
      },
      {
        q: "How fresh is the data?",
        a: "The dashboard queries subgraphs in real-time when you load a wallet, so for scheduled-data fields (start time, end time, cliffs, unlock amounts) you're looking at live on-chain state. Aggregate stats (TVL, streams-tracked counts) are cached in our own database and refreshed nightly to amortise subgraph costs. Token prices come live from DexScreener on every page load, using the highest-volume trading pair.",
      },
      {
        q: "Will you add more protocols?",
        a: "Yes. The roadmap prioritises protocols with public subgraphs or well-documented contract interfaces. Vote for what you want by emailing us via the contact page — volume of requests genuinely drives prioritisation.",
      },
      {
        q: "Can I propose a new chain or protocol?",
        a: "Yes — use the contact form and tell us the protocol name, contract addresses, and (if known) the subgraph ID or where the schedule data lives on-chain. If it has a subgraph we can usually prototype an adapter in a day.",
      },
    ],
  },
  {
    slug:    "alerts",
    title:   "Unlock alerts",
    summary: "Email and push notifications for every unlock event.",
    items: [
      {
        q: "How do unlock alerts work?",
        a: "Turn on alerts in Settings and pick your preferences — email, push, or both, and a lead time (1 hour to 3 days before each unlock). A background cron job scans every tracked wallet against the next 30 days of unlocks, compares against a dedup log, and fires a notification at the chosen lead time. You get one alert per unlock event; we never spam.",
      },
      {
        q: "What counts as an unlock event?",
        a: "Any scheduled time at which a vesting stream moves tokens from locked to claimable — linear stream end, tranche boundary in a stepped vest, cliff release, or scheduled cycle unlock on PinkSale. A continuously streaming Superfluid vest is treated as \"fully unlocked at end time\" for alert purposes.",
      },
      {
        q: "Will I get alerts for unlocks that have already happened?",
        a: "No. Notifications only fire for unlock events strictly in the future as of the scan time. If you add a wallet that has an unlock tomorrow, you'll get the alert. If it had an unlock yesterday, you won't be notified — that event is already in the past.",
      },
      {
        q: "How many push alerts can I send on the Free plan?",
        a: "Three lifetime push alerts on Free. Email alerts have no such cap on any tier — free accounts get unlimited email alerts from day one. Pro and Enterprise have unlimited push alerts.",
      },
      {
        q: "Can I get alerts for a wallet that isn't mine?",
        a: "Yes. You can add any Ethereum address — a team treasury, a founder's wallet, an advisor allocation — and receive alerts on it. The data is all public on-chain anyway. You authenticate with your own email; the addresses you track are just configuration.",
      },
    ],
  },
  {
    slug:    "features",
    title:   "Features & workflows",
    summary: "Everything the dashboard does beyond the unlock list.",
    items: [
      {
        q: "What is the P&L Tracker?",
        a: "An optional layer on top of your vesting positions where you log your purchase price (entry) and any individual sales (date, token amount, sell price or total USD received). TokenVest automatically splits your P&L into realised (already sold) and unrealised (remaining vested tokens at current market price). All P&L data is stored locally in your browser — it's never transmitted to TokenVest or any third party.",
      },
      {
        q: "What is the Discover page?",
        a: "A searchable, filterable view of every token we've ever indexed a vesting schedule for, with upcoming unlocks, total TVL locked per token, and per-protocol distribution. Great for finding tokens with heavy upcoming unlocks that might affect price, or for researching how competing projects structure their vesting. Pro and Enterprise only.",
      },
      {
        q: "Can I export my data?",
        a: "Yes. The Export button on the dashboard generates a CSV of every tracked stream including protocol, chain, token, amounts (total, vested, withdrawn, locked), cliff/start/end times, and your logged sell transactions. For printed reports, use your browser's print-to-PDF — the dashboard has print-specific CSS so you get a clean, human-readable document.",
      },
      {
        q: "How accurate are the token prices?",
        a: "Prices come from DexScreener, using the highest-volume DEX pair with liquidity over $1,000. Market cap and FDV match what DexScreener itself displays on the token page. For tokens with no DEX listing at all (testnet tokens, brand-new deployments), prices are marked unavailable and the UI falls back to raw token amounts rather than showing a fake dollar value.",
      },
      {
        q: "Can I see on-chain claim history?",
        a: "Yes — where the source subgraph exposes withdrawal events (most do), the TokenVest stream detail view lists every historical claim with timestamp and amount. PinkSale is the exception: since there's no subgraph, we can only show the scheduled unlock plan, not historical withdrawals.",
      },
    ],
  },
  {
    slug:    "pricing",
    title:   "Pricing & plans",
    summary: "Free forever for individuals, paid plans for volume users.",
    items: [
      {
        q: "How much does TokenVest cost?",
        a: "Free: $0, 1 wallet, unlimited email alerts on Pro and Enterprise, 3 lifetime push alerts. Pro: $14.99/month or $119.99/year on web ($17.99/$144.99 via the iOS/Android app — the Apple/Google cut is baked into the in-app price) for 3 wallets, unlimited push and email alerts, and the Discover page. Every new Pro signup on web includes a 14-day free trial. Enterprise: contact us — unlimited wallets, REST API + MCP access, Slack/Telegram/WhatsApp, SSO, dedicated support.",
      },
      {
        q: "Is there a free trial for Pro?",
        a: "Yes — every new web signup to Pro includes a 14-day free trial. Add a card to start; we don't charge until day 15, and you can cancel anytime before then with one click. The Free plan is indefinite on top of that, so you can also validate the core experience (wallet tracking, email alerts, dashboard) without ever entering payment details. iOS and Android follow each store's respective trial policy.",
      },
      {
        q: "Why does the mobile app price more than the web price?",
        a: "Apple and Google take roughly 15-30% of in-app purchase revenue depending on tier and volume. Rather than eating that into operating margin, we pass it through — web subscribers pay the base price, in-app subscribers pay ~20% more to cover the store cut. Same features, different distribution cost.",
      },
      {
        q: "What counts as a \"wallet\" for plan limits?",
        a: "A wallet is a distinct address you want scanned — EVM (0x…) or Solana (base58). If the same address has vestings on Sablier, Hedgey, UNCX and Streamflow, that still counts as one wallet — we auto-scan all 8 protocols and all 5 chains regardless of tier. The limit only bites when you want to track multiple different addresses (e.g. personal + team + investor wallets).",
      },
      {
        q: "Can I cancel my subscription anytime?",
        a: "Yes. Web subscriptions cancel instantly from account settings and remain active until the end of the current billing period. In-app subscriptions cancel through the Apple/Google subscription management in your device settings. We don't do lock-in contracts, surprise renewals, or retention dark patterns.",
      },
    ],
  },
  {
    slug:    "security",
    title:   "Security & privacy",
    summary: "How your data is handled and what TokenVest never has access to.",
    items: [
      {
        q: "Can TokenVest access or move my funds?",
        a: "No — never. TokenVest is strictly read-only. We never request your private key or seed phrase, we don't ask you to connect a wallet, and we have no capability to initiate a transaction. Adding a wallet to your dashboard is typing its public address into a text field; the address is publicly visible on-chain anyway.",
      },
      {
        q: "What personal data do you store?",
        a: "Only: the email you signed up with, the wallet addresses you choose to track, your notification preferences, and (if you're a paid subscriber) your Stripe/RevenueCat customer ID for billing. We don't store KYC data, phone numbers, names, or any fields we don't have a concrete product reason to hold.",
      },
      {
        q: "Where is my data stored?",
        a: "In a Postgres database hosted on Supabase (EU region by default). API secrets live in Vercel environment variables. Email delivery goes through Resend. Push delivery goes through Expo (for the mobile app) and Web Push (for PWAs). Payment data never touches our servers — Stripe and RevenueCat handle card details directly.",
      },
      {
        q: "Is the site open source?",
        a: "Not currently. The MCP server (@vestream/mcp) is published to npm and its source is available there. The main web app is closed-source during early access, but we're committed to publishing the core vesting adapters as a standalone open-source library once the interfaces stabilise.",
      },
      {
        q: "Do you use cookies or trackers?",
        a: "We use a single first-party session cookie for authentication (iron-session, HttpOnly, same-site) and nothing for third-party tracking. No Google Analytics, no Facebook Pixel, no retargeting trackers. The cookie banner you may see is a safety net for GDPR compliance — you can decline all optional cookies with no impact on functionality.",
      },
    ],
  },
  {
    slug:    "developers",
    title:   "Developers & AI agents",
    summary: "REST API, MCP server, webhooks, and tier limits for programmatic access.",
    items: [
      {
        q: "Does TokenVest have a developer API?",
        a: "Yes — a public REST API at /api/v1/ with three primary endpoints: GET /api/v1/wallet/{address}/vestings returns every stream for a wallet; GET /api/v1/wallet/{address}/upcoming-unlocks returns scheduled unlocks within a configurable window; GET /api/v1/stream/{id} returns full detail for a single stream by composite ID. See /api-docs for the Swagger UI and live request builder.",
      },
      {
        q: "How do I get an API key?",
        a: "Request access via /early-access or the contact form. API keys have the format vstr_live_{32 hex chars}, are shown once at creation time, and are stored as SHA-256 hashes — we can never recover a lost key, so copy it into your secret manager immediately. Use the Authorization: Bearer vstr_live_... header on every request.",
      },
      {
        q: "What is the MCP server?",
        a: "@vestream/mcp is a Model Context Protocol server published to npm. It exposes three tools to AI agents — get_wallet_vestings, get_upcoming_unlocks, and get_stream — so Claude Desktop, Cursor, or any MCP-compatible client can query TokenVest data natively without you writing glue code. See the AI Agents page at /ai for a quick-start config.",
      },
      {
        q: "What are the rate limits on the API?",
        a: "Free-tier API keys: 30 requests per minute burst, 150 per day. Pro: 5,000 per day. Enterprise: negotiated per contract, typically uncapped. All limits are enforced via Upstash Redis and return a standard 429 response with Retry-After header when exceeded. Rate-limit headers (X-RateLimit-Remaining, X-RateLimit-Reset) are on every response.",
      },
      {
        q: "Do you offer webhooks?",
        a: "Not yet — the current API is pull-based. Webhook support (fire-on-unlock delivery) is on the Enterprise roadmap. If that's blocking your use case, tell us via the contact form and we'll prioritise it.",
      },
    ],
  },
  {
    slug:    "mobile",
    title:   "Mobile app",
    summary: "iOS and Android companion to the web dashboard.",
    items: [
      {
        q: "Is there a mobile app?",
        a: "An iOS and Android app is in beta as of April 2026. It's a React Native / Expo companion to the web dashboard — same account, same wallets, same notification preferences, plus native push notifications (instead of web push) for reliable delivery when the app is backgrounded.",
      },
      {
        q: "What can I do in the mobile app that I can't on the web?",
        a: "Native OS-level push notifications with richer previews, Face ID / Touch ID biometric re-lock when you background the app, and (roadmap) a lock-screen widget showing your next upcoming unlock. The mobile app is read-only and navigates to the same dashboard as web for settings and wallet management.",
      },
      {
        q: "How do I sign in on mobile?",
        a: "Same email OTP as web — enter your email, receive a 6-digit code, enter it. The mobile app uses an Authorization: Bearer token in the HTTP header (not a cookie) so sessions persist across app restarts without you having to re-verify.",
      },
      {
        q: "How do I manage my subscription on mobile?",
        a: "Through your device's native subscription management — iOS Settings → Apple ID → Subscriptions, or Google Play → Subscriptions. This is required by Apple and Google for in-app purchases. Web subscriptions are managed in your TokenVest account settings.",
      },
    ],
  },
  {
    slug:    "account-and-billing",
    title:   "Account & billing",
    summary: "Managing your account, data, and subscription.",
    items: [
      {
        q: "How do I change my email?",
        a: "Email is your account identifier and changing it requires confirming ownership of both the old and new addresses. Contact support via the form and we'll walk you through it — takes a couple of minutes.",
      },
      {
        q: "How do I delete my account?",
        a: "Contact support via the form and request deletion. All your data — wallets, notification preferences, any stored P&L data (if any) — is permanently removed from our database within 7 days. Subscriptions are cancelled as part of the same request.",
      },
      {
        q: "What payment methods do you accept?",
        a: "Web: any credit or debit card supported by Stripe (Visa, Mastercard, Amex, Discover, JCB, UnionPay). Apple Pay and Google Pay for in-app purchases on iOS and Android respectively. No crypto payments currently — adding USDC checkout is on the roadmap but not committed.",
      },
      {
        q: "Do you offer refunds?",
        a: "Yes, within 14 days of the initial subscription purchase if you haven't used the paid features substantively. Contact support and we'll process it — no questions, no hoops. In-app purchase refunds go through Apple or Google per their policies.",
      },
    ],
  },
  {
    slug:    "troubleshooting",
    title:   "Troubleshooting",
    summary: "Common issues and quick fixes.",
    items: [
      {
        q: "I added my wallet but no streams are showing up. Why?",
        a: "Three common causes, in order of likelihood: (1) the wallet genuinely has no vesting streams on any of the 8 supported protocols on any of the 5 chains; (2) the streams exist on a protocol or chain we don't yet support; (3) the data source (subgraph or Solana RPC) is temporarily rate-limited or unreachable. Refresh in 60 seconds, and if you still see nothing, check the address on the protocol's own frontend to confirm streams exist.",
      },
      {
        q: "I'm not receiving email alerts — what should I check?",
        a: "First, check your spam folder — new sender domains often land there until you mark them safe. Second, confirm the email in Settings is correct and that the \"Email alerts\" toggle is on. Third, note that alerts only fire for unlocks in the future and at the lead time you configured; if the next unlock is 10 days out and you set \"1 hour before\", you won't hear anything for 9 days and 23 hours.",
      },
      {
        q: "The dashboard shows \"Pricing indexed tokens…\" — what does that mean?",
        a: "That state appears when the TVL bar is loading token prices from DexScreener, or when the price cache is briefly stale during a cold deploy. It clears within 10-30 seconds. If it persists more than a minute, refresh — our CDN layer may be holding a stale version from before the last deploy.",
      },
      {
        q: "I forgot my sign-in email and can't log in.",
        a: "Contact support via the form and we'll help verify your identity (via wallet signature or other means) and recover account access. For obvious reasons we can't just send account details to whoever claims to be you in a chat — but we can always help legitimate account owners regain access.",
      },
    ],
  },
];

// FAQPage JSON-LD. Each Q&A pair becomes a Question entity with a single
// accepted Answer, matching schema.org/FAQPage. Google Search and AI search
// engines (Perplexity, ChatGPT Search, etc.) parse this directly to surface
// individual answers as rich results or cited sources.
function buildFaqJsonLd(data: FaqCategory[]): string {
  const mainEntity = data.flatMap((cat) =>
    cat.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  );
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: "https://vestream.io/faq",
    mainEntity,
  });
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function FaqPage() {
  const totalQuestions = FAQ_DATA.reduce((n, c) => n + c.items.length, 0);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#f8fafc", color: "#0f172a" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildFaqJsonLd(FAQ_DATA) }}
      />

      <SiteNav theme="light" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-10 md:pt-36 md:pb-16 px-4 md:px-8 text-center">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-6"
            style={{
              background: "rgba(37,99,235,0.06)",
              borderColor: "rgba(37,99,235,0.2)",
              color: "#2563eb",
            }}
          >
            FAQ · {totalQuestions} answered questions
          </div>

          <h1
            className="font-bold tracking-tight mb-5"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: "#0f172a",
            }}
          >
            Questions, answered.
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto"
            style={{ color: "#64748b" }}
          >
            Everything about how TokenVest works — protocols, chains, alerts, pricing,
            the API, mobile, security, and the things that occasionally go wrong.
          </p>
        </div>
      </section>

      {/* ── Category jumplinks ─────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-10 md:pb-16 max-w-5xl mx-auto">
        <div className="flex flex-wrap justify-center gap-2">
          {FAQ_DATA.map((cat) => (
            <a
              key={cat.slug}
              href={`#${cat.slug}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-all hover:-translate-y-0.5"
              style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.08)",
                color: "#475569",
                boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
              }}
            >
              {cat.title}
            </a>
          ))}
        </div>
      </section>

      {/* ── Categories ────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-8 pb-16 md:pb-24 max-w-3xl mx-auto space-y-14 md:space-y-20">
        {FAQ_DATA.map((cat) => (
          <section key={cat.slug} id={cat.slug} className="scroll-mt-24">
            <div className="mb-6">
              <h2
                className="text-2xl md:text-3xl font-bold mb-1.5"
                style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
              >
                {cat.title}
              </h2>
              <p className="text-sm" style={{ color: "#64748b" }}>
                {cat.summary}
              </p>
            </div>

            <div className="space-y-3">
              {cat.items.map((item, i) => (
                <FaqEntry key={i} {...item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* ── Can't find it? CTA ────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-3xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-10 text-center relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.04) 0%, rgba(124,58,237,0.04) 100%)",
            border: "1px solid rgba(37,99,235,0.12)",
          }}
        >
          <h2
            className="text-xl md:text-2xl font-bold mb-3"
            style={{ letterSpacing: "-0.02em", color: "#0f172a" }}
          >
            Still have a question?
          </h2>
          <p className="text-sm md:text-base mb-6 max-w-xl mx-auto" style={{ color: "#64748b" }}>
            If your question isn&apos;t answered above, send us a note — we reply within one business day.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            Contact us →
          </Link>
        </div>
      </section>

      <SiteFooter theme="light" />
    </div>
  );
}

// ── FaqEntry: one Q&A, semantic <details>/<summary> for accessibility + SEO ──
// We render each pair as a <details> so it's collapsible for visual scanning
// but the answer text is still in the DOM — crawlers and LLMs see it
// regardless of whether a user has expanded it.

function FaqEntry({ q, a }: FaqItem) {
  return (
    <details
      className="group rounded-2xl p-5 md:p-6 transition-all"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <summary
        className="flex items-start justify-between gap-4 cursor-pointer list-none"
      >
        <h3
          className="font-semibold text-base md:text-[1.05rem] leading-snug flex-1"
          style={{ color: "#0f172a", letterSpacing: "-0.01em" }}
        >
          {q}
        </h3>
        <span
          className="flex-shrink-0 mt-1 w-6 h-6 rounded-full flex items-center justify-center transition-transform group-open:rotate-45"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}
          aria-hidden="true"
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div
        className="mt-4 text-sm md:text-[0.95rem] leading-relaxed"
        style={{ color: "#475569" }}
      >
        {a}
      </div>
    </details>
  );
}
