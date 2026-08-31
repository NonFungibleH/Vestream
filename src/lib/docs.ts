// src/lib/docs.ts
// ─────────────────────────────────────────────────────────────────────────────
// Content model + source-of-truth for the /docs section.
//
// Docs are data-driven: each page is a list of typed content blocks that the
// renderer (src/app/docs/_components/DocsBody.tsx) maps to JSX. Keeping content
// as structured data (not raw HTML) means no dangerouslySetInnerHTML and a
// consistent look across every page. The sidebar is built by grouping DOC_PAGES
// by `category` in declaration order.
//
// Accuracy rule: docs describe REAL, shipped functionality only. When a feature
// is Pro-only or free, say so. Keep in sync with the product + CLAUDE.md.
// ─────────────────────────────────────────────────────────────────────────────

export type DocBlock =
  | { type: "lead"; text: string }
  | { type: "h2"; text: string }
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "callout"; tone: "tip" | "note" | "pro" | "free"; text: string }
  | { type: "cards"; items: { title: string; body: string; href?: string }[] }
  | { type: "protocols" }   // renders the live integrated-protocols grid
  | { type: "chains" }      // renders the supported-chains grid
  | { type: "cta"; text: string; href: string; label: string };

export interface DocPage {
  slug: string;
  title: string;
  /** Meta description (SEO) — 140–160 chars. */
  description: string;
  /** Sidebar/section category. */
  category: string;
  /** Emoji shown on cards + sidebar. */
  icon: string;
  /** One-line summary for the overview cards. */
  summary: string;
  body: DocBlock[];
}

export const DOC_CATEGORIES = [
  "Getting started",
  "Features",
  "Tax & reporting",
  "Reference",
] as const;

export const DOC_PAGES: DocPage[] = [
  // ── Getting started ───────────────────────────────────────────────────────
  {
    slug: "getting-started",
    title: "Getting started with Vestream",
    description:
      "What Vestream does, how to download the app, and how to start tracking token vesting unlocks across 11 protocols and 9 chains in a few minutes.",
    category: "Getting started",
    icon: "🚀",
    summary: "What Vestream is and how to get up and running.",
    body: [
      { type: "lead", text: "Vestream tracks token vesting and unlocks across every major on-chain vesting protocol, and tells you the moment tokens you're owed become claimable. This guide gets you from zero to your first tracked unlock." },
      { type: "h2", text: "What you can do" },
      { type: "list", items: [
        "Track every vesting stream owed to any wallet — cliffs, linear vesting, and TGE unlocks.",
        "Get a push or email alert before each unlock, so you never miss a cliff.",
        "Search any wallet for free to see what's vesting to it — no signup.",
        "Explore any token's full vesting picture, export tax-ready reports, and more.",
      ] },
      { type: "h2", text: "Get the app" },
      { type: "p", text: "Vestream is on **iOS and Android**. Download it, and you can start tracking wallets and setting alerts straight away on the free plan." },
      { type: "cta", text: "Download Vestream", href: "/early-access", label: "Get the app →" },
      { type: "h2", text: "Your first few minutes" },
      { type: "steps", items: [
        "Open the app and add a wallet address (or ENS name) you want to track.",
        "Vestream scans it across all supported protocols and chains and lists every vesting stream.",
        "Turn on notifications so you're alerted before each unlock.",
        "Prefer not to install anything yet? Use the free [Find Vestings](/find-vestings) search in your browser.",
      ] },
      { type: "callout", tone: "free", text: "The free plan covers 3 tracked wallets and 10 push alerts a month — enough to track your own positions. Pro lifts the limits and adds email alerts, the web dashboard, the Explorer, and tax exports." },
    ],
  },
  {
    slug: "tracking-wallets",
    title: "Tracking wallets",
    description:
      "How to add and manage tracked wallets in Vestream — ENS support, chain and protocol filters, and the free vs Pro wallet limits.",
    category: "Getting started",
    icon: "👛",
    summary: "Add wallets, filter by chain/protocol, manage your list.",
    body: [
      { type: "lead", text: "A tracked wallet is any address you want Vestream to watch for vesting and unlocks. Add your own wallets, a multisig, or any address you're interested in." },
      { type: "h2", text: "Adding a wallet" },
      { type: "steps", items: [
        "Go to Settings → Wallets (app) or the dashboard.",
        "Paste an EVM address (0x…), a Solana address, or an ENS name — Vestream resolves ENS automatically.",
        "Optionally give it a label (e.g. \"Team multisig\") so it's easy to recognise.",
        "Vestream immediately scans it across every supported protocol and chain.",
      ] },
      { type: "h2", text: "Chain & protocol filters" },
      { type: "p", text: "Each wallet can be scoped to specific chains and protocols if you only care about part of its activity — otherwise Vestream tracks everything it finds. See the full list on the [Protocols](/docs/protocols) and [Supported chains](/docs/chains) pages." },
      { type: "h2", text: "Wallet limits" },
      { type: "list", items: [
        "Free: track up to 3 wallets.",
        "Pro: track up to 10 wallets, with the full web dashboard view.",
      ] },
      { type: "callout", tone: "note", text: "Need to track more than 10 wallets (funds, treasuries, large teams)? Contact team@vestream.io — we handle larger fleets directly." },
    ],
  },
  {
    slug: "notifications",
    title: "Setting up unlock notifications",
    description:
      "Turn on push and email alerts so you're notified before every token unlock. How Vestream alerts work, timing, and the free vs Pro limits.",
    category: "Getting started",
    icon: "🔔",
    summary: "Push + email alerts before every unlock — how to set them up.",
    body: [
      { type: "lead", text: "Notifications are the heart of Vestream: you get alerted before tokens you're owed unlock, so you can claim on time and plan around supply events." },
      { type: "h2", text: "Push notifications (mobile)" },
      { type: "steps", items: [
        "Open the Vestream app and allow notifications when prompted (or enable them later in your device settings).",
        "Go to Settings → Notifications.",
        "Choose which wallets and events you want alerts for.",
        "Vestream sends a push before each upcoming unlock for your tracked wallets.",
      ] },
      { type: "callout", tone: "free", text: "Free plan: up to 10 push alerts per month (resets on the 1st). Pro: unlimited push alerts." },
      { type: "h2", text: "Email alerts (Pro)" },
      { type: "p", text: "Pro users can also receive unlock alerts by email — useful if you don't want to rely on a phone. Set your email preferences in Settings → Notifications. Alerts are rendered in your local timezone." },
      { type: "callout", tone: "pro", text: "Email alerts and unlimited push are part of Pro ($9.99/mo or $74.99/yr)." },
      { type: "h2", text: "Test it" },
      { type: "p", text: "You can fire a sample push from the app to confirm notifications are working — it won't count against your monthly allowance." },
    ],
  },

  // ── Features ────────────────────────────────────────────────────────────────
  {
    slug: "unlock-calendar",
    title: "The unlock calendar",
    description:
      "Browse upcoming token unlocks across every protocol and chain — by today, this week, this month, biggest unlocks, and mass distributions.",
    category: "Features",
    icon: "📅",
    summary: "Every upcoming unlock, ranked and filterable by window.",
    body: [
      { type: "lead", text: "The unlock calendar is a live, public view of upcoming token unlocks across all indexed protocols and chains — no login needed." },
      { type: "h2", text: "Ways to view it" },
      { type: "cards", items: [
        { title: "By window", body: "Today, tomorrow, this week, this month, or rolling 30/60/90-day windows.", href: "/unlocks" },
        { title: "Biggest this week", body: "Every unlock landing this week, ranked by USD value.", href: "/unlocks/biggest-this-week" },
        { title: "Mass distributions", body: "Unlocks hitting many recipients at once — catches airdrops and launchpad rounds.", href: "/unlocks/mass-distributions" },
        { title: "Monthly reports", body: "The biggest scheduled unlocks each month, as a citable report.", href: "/unlocks/report" },
      ] },
      { type: "h2", text: "USD values" },
      { type: "p", text: "Each unlock is priced at current market value where a price source exists, so you can see the size of a supply event at a glance. See our [data & methodology](/methodology) for how USD figures are calculated." },
      { type: "cta", text: "Open the unlock calendar", href: "/unlocks", label: "View upcoming unlocks →" },
    ],
  },
  {
    slug: "find-vestings",
    title: "Find Vestings — free wallet search",
    description:
      "Paste any wallet address and instantly see every vesting stream owed to it across all supported protocols and chains. Free, no signup.",
    category: "Features",
    icon: "🔎",
    summary: "Paste a wallet, see everything vesting to it — free.",
    body: [
      { type: "lead", text: "Find Vestings is the fastest way to see what's vesting to a wallet. Paste an address and Vestream scans every protocol and chain it supports — free, in your browser, no account required." },
      { type: "h2", text: "How to use it" },
      { type: "steps", items: [
        "Go to [Find Vestings](/find-vestings).",
        "Paste any EVM or Solana address (or ENS name).",
        "See every vesting stream owed to that wallet, with amounts, tokens, and next-unlock dates.",
      ] },
      { type: "callout", tone: "free", text: "Find Vestings is completely free and needs no signup. To get alerts before those unlocks, add the wallet in the app." },
      { type: "cta", text: "Try Find Vestings", href: "/find-vestings", label: "Search a wallet →" },
    ],
  },
  {
    slug: "explorer",
    title: "The Token Vesting Explorer",
    description:
      "Explore any token's full vesting picture — every holder, locked supply, top recipients, and upcoming unlocks. Includes smart-money views.",
    category: "Features",
    icon: "🧭",
    summary: "Explore any token's full vesting picture and top recipients.",
    body: [
      { type: "lead", text: "The Explorer (Discover in the app) lets you go beyond your own wallets and investigate any token's vesting — who's vesting it, how much is locked, and what's about to unlock." },
      { type: "h2", text: "What you can see" },
      { type: "list", items: [
        "Every recipient vesting a given token, ranked by size.",
        "Total locked supply and top-holder concentration.",
        "Upcoming unlocks for that token across protocols.",
        "Smart-money views — wallets receiving vestings of the most distinct tokens.",
      ] },
      { type: "h2", text: "Search any wallet" },
      { type: "p", text: "Pro users can search any wallet — not just their tracked ones — to see its full vesting position instantly." },
      { type: "callout", tone: "pro", text: "The Explorer, smart-money views, and search-any-wallet are Pro features." },
    ],
  },
  {
    slug: "web-dashboard",
    title: "The web dashboard",
    description:
      "Sign in to the Vestream web dashboard with a QR code from the app to see all your tracked wallets, upcoming unlocks, and tax tools on desktop.",
    category: "Features",
    icon: "🖥️",
    summary: "Your full portfolio on desktop, via QR sign-in.",
    body: [
      { type: "lead", text: "The web dashboard brings your tracked wallets, upcoming unlocks, the Explorer, and tax tools to the big screen. It's available to Pro users and pairs securely with the app — no passwords." },
      { type: "h2", text: "How to sign in (QR pairing)" },
      { type: "steps", items: [
        "On desktop, go to the [login page](/login).",
        "Open the Vestream app → Settings → Connect Desktop.",
        "Scan the QR code shown on the login page.",
        "You're in — the dashboard loads your wallets and unlocks.",
      ] },
      { type: "callout", tone: "pro", text: "The web dashboard is a Pro feature. Sign-in is QR-only — there's no password to manage or leak." },
    ],
  },

  // ── Tax & reporting ──────────────────────────────────────────────────────────
  {
    slug: "tax-reports",
    title: "Tax reports & P&L",
    description:
      "Vesting income statements, claim history, and tax-ready CSV exports for Koinly, CoinTracker and TurboTax — plus a P&L ledger with sell detection.",
    category: "Tax & reporting",
    icon: "🧾",
    summary: "Income statements, CSV exports, P&L and sell detection.",
    body: [
      { type: "lead", text: "Vestream turns your on-chain vesting income into tax-ready reports. It records each claim as income at the value received, and helps you track disposals for capital-gains reporting." },
      { type: "h2", text: "What's included" },
      { type: "list", items: [
        "Vesting income statement — every claim you've received, priced at receipt.",
        "Claim history across all your wallets and protocols.",
        "Tax-ready CSV exports formatted for Koinly, CoinTracker and TurboTax (plus a generic format).",
        "Year-end PDF summary.",
        "P&L ledger — record entry prices and sales; auto sell-detection surfaces likely disposals for you to confirm.",
      ] },
      { type: "h2", text: "How to run a report" },
      { type: "steps", items: [
        "Open the Tax section (app or web dashboard).",
        "Run a scan to ingest your claim history across protocols.",
        "Review the income and P&L, then export a CSV for your accountant or tax software.",
      ] },
      { type: "callout", tone: "pro", text: "Tax reports, exports and P&L are Pro features. Vestream provides data tools, not tax advice — always confirm with a professional." },
    ],
  },

  // ── Reference ────────────────────────────────────────────────────────────────
  {
    slug: "protocols",
    title: "Integrated protocols",
    description:
      "Every vesting protocol Vestream indexes — Sablier, Hedgey, UNCX, Team Finance, PinkSale, Superfluid, Unvest, Streamflow, Jupiter Lock, LlamaPay and HoodLock.",
    category: "Reference",
    icon: "🔗",
    summary: "Every vesting protocol Vestream indexes.",
    body: [
      { type: "lead", text: "Vestream reads vesting directly from each protocol's on-chain data — so coverage is real, not a manually-maintained list. Tap any protocol for its live tracker with TVL, recipients and upcoming unlocks." },
      { type: "protocols" },
      { type: "callout", tone: "note", text: "Don't see a protocol you use? Let us know at team@vestream.io — we add integrations based on demand." },
    ],
  },
  {
    slug: "chains",
    title: "Supported chains",
    description:
      "The blockchains Vestream indexes for token vesting — Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Solana and Robinhood Chain.",
    category: "Reference",
    icon: "⛓️",
    summary: "Every chain Vestream indexes, EVM and Solana.",
    body: [
      { type: "lead", text: "Vestream covers the major EVM chains plus Solana — and now Robinhood Chain. Vesting on any of these shows up automatically for a tracked wallet." },
      { type: "chains" },
    ],
  },
  {
    slug: "developers",
    title: "Developers — API & MCP",
    description:
      "Access Vestream's vesting data programmatically: a REST API across every protocol and chain, plus an MCP server for AI agents like Claude and Cursor.",
    category: "Reference",
    icon: "⚙️",
    summary: "REST API + MCP server for the vesting data layer.",
    body: [
      { type: "lead", text: "Everything Vestream tracks is available programmatically — one normalised schema across every protocol and chain." },
      { type: "cards", items: [
        { title: "REST API", body: "Query wallet vestings, upcoming unlocks and individual streams over HTTPS with an API key.", href: "/developer" },
        { title: "MCP server", body: "The vesting data layer for AI agents — native support for Claude, Cursor and any MCP-compatible client.", href: "/ai" },
      ] },
      { type: "cta", text: "Read the developer docs", href: "/developer", label: "Developer API →" },
    ],
  },
  {
    slug: "plans",
    title: "Plans & pricing",
    description:
      "Vestream is free for 3 wallets and 10 alerts a month. Pro unlocks unlimited alerts, 10 wallets, the web dashboard, the Explorer, and tax exports.",
    category: "Reference",
    icon: "💳",
    summary: "What's free, what's Pro, and how to upgrade.",
    body: [
      { type: "lead", text: "Vestream has a genuinely useful free plan and a Pro plan for power users. Upgrade in the app via the App Store or Google Play." },
      { type: "cards", items: [
        { title: "Free — $0", body: "Free wallet search, 3 tracked wallets, and 10 push alerts a month.", href: "/pricing" },
        { title: "Pro — $9.99/mo or $74.99/yr", body: "Unlimited push + email alerts, 10 wallets, the web dashboard, the Explorer, and tax-ready exports.", href: "/pricing" },
      ] },
      { type: "cta", text: "See full pricing", href: "/pricing", label: "View pricing →" },
    ],
  },
];

// ── Lookups ────────────────────────────────────────────────────────────────
export const DOC_SLUGS = DOC_PAGES.map((p) => p.slug);

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

/** Pages grouped by category in declaration order — powers the sidebar + overview. */
export function docsByCategory(): { category: string; pages: DocPage[] }[] {
  return DOC_CATEGORIES.map((category) => ({
    category,
    pages: DOC_PAGES.filter((p) => p.category === category),
  })).filter((g) => g.pages.length > 0);
}
