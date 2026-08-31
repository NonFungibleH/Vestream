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
// Style rules for docs copy:
//   - Describe REAL, shipped functionality only. Say when a feature is Pro-only
//     or free. Keep in sync with the product + CLAUDE.md.
//   - No em dashes. Use commas, colons, parentheses, or separate sentences.
//   - `icon` is an icon-set name (see DocsIcon.tsx), never an emoji.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocIconName } from "@/app/docs/_components/DocsIcon";

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
  /** Meta description (SEO), 140 to 160 chars. */
  description: string;
  /** Sidebar/section category. */
  category: string;
  /** Icon-set name shown on cards + sidebar (see DocsIcon.tsx). */
  icon: DocIconName;
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
      "What Vestream does, how to download the app, and how to start tracking token vesting unlocks across 11+ protocols and 9+ chains in a few minutes.",
    category: "Getting started",
    icon: "rocket",
    summary: "What Vestream is and how to get up and running.",
    body: [
      { type: "lead", text: "Vestream tracks token vesting and unlocks across every major on-chain vesting protocol, and tells you the moment tokens you're owed become claimable. This guide gets you from zero to your first tracked unlock." },
      { type: "h2", text: "What you can do" },
      { type: "list", items: [
        "Track every vesting stream owed to any wallet: cliffs, linear vesting, tranched schedules, and TGE unlocks.",
        "Get a push or email alert before each unlock, so you never miss a cliff.",
        "Search any wallet for free to see what's vesting to it, with no signup.",
        "Explore any token's full vesting picture, browse the unlock calendar, and export tax-ready reports.",
      ] },
      { type: "h2", text: "How it works" },
      { type: "p", text: "Vestream reads vesting data directly from each protocol's on-chain contracts and subgraphs, then normalises it into one consistent shape. Coverage is real and live, not a hand-maintained list, so a stream shows up the moment it exists on-chain. See [how vesting works](/docs/vesting-explained) for the underlying concepts." },
      { type: "h2", text: "Get the app" },
      { type: "p", text: "Vestream is on **iOS and Android**. Download it and you can start tracking wallets and setting alerts straight away on the free plan. Prefer the browser? The web tools (wallet search, unlock calendar, protocol pages) work with no install." },
      { type: "cta", text: "Download Vestream", href: "/early-access", label: "Get the app" },
      { type: "h2", text: "Your first few minutes" },
      { type: "steps", items: [
        "Open the app and add a wallet address (or ENS name) you want to track.",
        "Vestream scans it across all supported protocols and chains and lists every vesting stream.",
        "Turn on notifications so you're alerted before each unlock.",
        "Not ready to install? Use the free [Find Vestings](/find-vestings) search in your browser.",
      ] },
      { type: "callout", tone: "free", text: "The free plan covers 3 tracked wallets and 10 push alerts a month, enough to track your own positions. Pro lifts the limits and adds email alerts, the web dashboard, the Explorer, and tax exports." },
      { type: "h2", text: "Where to go next" },
      { type: "cards", items: [
        { title: "Track wallets", body: "Add wallets, use ENS, and manage chain and protocol filters.", href: "/docs/tracking-wallets" },
        { title: "Set up alerts", body: "Turn on push and email notifications before every unlock.", href: "/docs/notifications" },
        { title: "The unlock calendar", body: "Browse every upcoming unlock across protocols and chains.", href: "/docs/unlock-calendar" },
        { title: "Plans & pricing", body: "What's free, what's Pro, and how to upgrade.", href: "/docs/plans" },
      ] },
    ],
  },
  {
    slug: "vesting-explained",
    title: "How token vesting works",
    description:
      "A plain-English guide to token vesting: cliffs, linear vesting, tranched schedules, TGE unlocks, and why unlock events matter for holders and traders.",
    category: "Getting started",
    icon: "book",
    summary: "Cliffs, linear vesting, TGE unlocks, and why they matter.",
    body: [
      { type: "lead", text: "Token vesting is how projects release tokens gradually over time instead of all at once. If you're an investor, team member, or trader, understanding the vesting schedule tells you when new supply hits the market." },
      { type: "h2", text: "The building blocks" },
      { type: "list", items: [
        "**Cliff:** a date before which nothing is claimable. At the cliff, the first chunk unlocks in one step.",
        "**Linear vesting:** tokens unlock smoothly, second by second or block by block, between a start and end date.",
        "**Tranched (stepped) vesting:** tokens unlock in discrete chunks on set dates, for example 25% every quarter.",
        "**TGE unlock:** a portion released at the Token Generation Event, often followed by a cliff and then vesting.",
        "**Lock:** the whole amount is held until a single unlock date, then withdrawable in full.",
      ] },
      { type: "h2", text: "Claimable vs locked" },
      { type: "p", text: "At any moment a stream splits into three parts: the amount already withdrawn, the amount claimable now (vested but not yet withdrawn), and the amount still locked. Nothing is claimable before a cliff. Vestream computes all three for every stream so you see exactly what you can claim today and what's still to come." },
      { type: "h2", text: "Why unlocks matter" },
      { type: "p", text: "An unlock is a supply event. For a recipient it's income you can claim and plan around. For the wider market, a large unlock can add sell pressure. That's why Vestream prices each unlock in USD and lets you filter for the biggest ones. See the [unlock calendar](/docs/unlock-calendar)." },
      { type: "callout", tone: "tip", text: "Every protocol models vesting slightly differently. Vestream normalises them all into one shape (start, cliff, end, unlock steps, claimable, locked) so you don't have to learn each protocol's quirks." },
    ],
  },
  {
    slug: "tracking-wallets",
    title: "Tracking wallets",
    description:
      "How to add and manage tracked wallets in Vestream: ENS support, chain and protocol filters, labels, and the free vs Pro wallet limits.",
    category: "Getting started",
    icon: "wallet",
    summary: "Add wallets, filter by chain/protocol, manage your list.",
    body: [
      { type: "lead", text: "A tracked wallet is any address you want Vestream to watch for vesting and unlocks. Add your own wallets, a multisig, or any address you're interested in." },
      { type: "h2", text: "What counts as a wallet" },
      { type: "p", text: "A wallet is a single address: an EVM address (0x...), a Solana address (base58), or an ENS name that resolves to one. If the same address has vestings on several protocols and chains, that's still one tracked wallet, Vestream scans all of them together." },
      { type: "h2", text: "Adding a wallet" },
      { type: "steps", items: [
        "Go to Settings then Wallets in the app, or add a wallet from the web dashboard.",
        "Paste an EVM address, a Solana address, or an ENS name. Vestream resolves ENS automatically.",
        "Optionally give it a label (for example \"Team multisig\") so it's easy to recognise.",
        "Vestream immediately scans it across every supported protocol and chain.",
      ] },
      { type: "h2", text: "Chain & protocol filters" },
      { type: "p", text: "Each wallet can be scoped to specific chains and protocols if you only care about part of its activity. Leave the filters open and Vestream tracks everything it finds. See the full coverage on the [Protocols](/docs/protocols) and [Supported chains](/docs/chains) pages." },
      { type: "h2", text: "Editing & removing" },
      { type: "p", text: "You can relabel a wallet, change its filters, or remove it at any time from the same Wallets screen. Removing a wallet stops its alerts and takes it off your dashboard, it does not affect anything on-chain." },
      { type: "h2", text: "Wallet limits" },
      { type: "list", items: [
        "Free: track up to 3 wallets.",
        "Pro: track up to 10 wallets, with the full web dashboard view.",
      ] },
      { type: "callout", tone: "note", text: "Need to track more than 10 wallets (funds, treasuries, large teams)? Contact team@vestream.io and we'll handle larger fleets directly." },
    ],
  },
  {
    slug: "notifications",
    title: "Setting up unlock notifications",
    description:
      "Turn on push and email alerts so you're notified before every token unlock. How Vestream alerts work, timing, timezones, and the free vs Pro limits.",
    category: "Getting started",
    icon: "bell",
    summary: "Push + email alerts before every unlock, and how to set them up.",
    body: [
      { type: "lead", text: "Notifications are the heart of Vestream. You get alerted before tokens you're owed unlock, so you can claim on time and plan around supply events." },
      { type: "h2", text: "What triggers an alert" },
      { type: "p", text: "Vestream watches the upcoming unlocks for every wallet you track. When a stream is about to reach a cliff or its next scheduled unlock, you get an alert ahead of time so nothing catches you by surprise." },
      { type: "h2", text: "Push notifications (mobile)" },
      { type: "steps", items: [
        "Open the Vestream app and allow notifications when prompted (or enable them later in your device settings).",
        "Go to Settings then Notifications.",
        "Choose which wallets and events you want alerts for.",
        "Vestream sends a push before each upcoming unlock for your tracked wallets.",
      ] },
      { type: "callout", tone: "free", text: "Free plan: up to 10 push alerts per month, resetting on the 1st. Pro: unlimited push alerts." },
      { type: "h2", text: "Email alerts (Pro)" },
      { type: "p", text: "Pro users can also receive unlock alerts by email, useful if you don't want to rely on a phone. Set your email preferences in Settings then Notifications." },
      { type: "h2", text: "Timing & timezones" },
      { type: "p", text: "Alerts are sent ahead of each unlock and rendered in your local timezone, which the app detects automatically. That means dates and times in your alerts match what you'd expect wherever you are." },
      { type: "callout", tone: "pro", text: "Email alerts and unlimited push are part of Pro ($9.99/mo or $74.99/yr)." },
      { type: "h2", text: "Test it" },
      { type: "p", text: "You can fire a sample push from the app to confirm notifications are working. The test push does not count against your monthly allowance." },
    ],
  },

  // ── Features ────────────────────────────────────────────────────────────────
  {
    slug: "unlock-calendar",
    title: "The unlock calendar",
    description:
      "Browse upcoming token unlocks across every protocol and chain: by today, this week, this month, biggest unlocks, mass distributions, and monthly reports.",
    category: "Features",
    icon: "calendar",
    summary: "Every upcoming unlock, ranked and filterable by window.",
    body: [
      { type: "lead", text: "The unlock calendar is a live, public view of upcoming token unlocks across all indexed protocols and chains. No login needed." },
      { type: "h2", text: "Ways to view it" },
      { type: "cards", items: [
        { title: "By window", body: "Today, tomorrow, this week, this month, or rolling 30/60/90-day windows.", href: "/unlocks" },
        { title: "Biggest this week", body: "Every unlock landing this week, ranked by USD value.", href: "/unlocks/biggest-this-week" },
        { title: "Mass distributions", body: "Unlocks hitting many recipients at once, which catches airdrops and launchpad rounds.", href: "/unlocks/mass-distributions" },
        { title: "Monthly reports", body: "The biggest scheduled unlocks each month, as a citable report.", href: "/unlocks/report" },
      ] },
      { type: "h2", text: "USD values" },
      { type: "p", text: "Each unlock is priced at current market value where a price source exists, so you can see the size of a supply event at a glance. Tokens without a reliable price source show amounts only. See our [data & methodology](/methodology) for how USD figures are calculated." },
      { type: "h2", text: "Per-protocol and per-chain" },
      { type: "p", text: "Every [protocol page](/protocols) has its own unlock calendar scoped to that protocol, with live TVL and recipient counts. It's a fast way to focus on just the protocols you care about." },
      { type: "cta", text: "Open the unlock calendar", href: "/unlocks", label: "View upcoming unlocks" },
    ],
  },
  {
    slug: "find-vestings",
    title: "Find Vestings, the free wallet search",
    description:
      "Paste any wallet address and instantly see every vesting stream owed to it across all supported protocols and chains. Free, no signup, EVM and Solana.",
    category: "Features",
    icon: "search",
    summary: "Paste a wallet, see everything vesting to it, free.",
    body: [
      { type: "lead", text: "Find Vestings is the fastest way to see what's vesting to a wallet. Paste an address and Vestream scans every protocol and chain it supports, free, in your browser, with no account required." },
      { type: "h2", text: "How to use it" },
      { type: "steps", items: [
        "Go to [Find Vestings](/find-vestings).",
        "Paste any EVM or Solana address, or an ENS name.",
        "See every vesting stream owed to that wallet, with amounts, tokens, and next-unlock dates.",
      ] },
      { type: "h2", text: "What it scans" },
      { type: "p", text: "Find Vestings checks all 11+ integrated protocols across all 9+ supported chains (EVM and Solana) in parallel. Results are grouped by protocol, chain, and token, with the amount locked, the amount claimable now, and the next unlock date for each." },
      { type: "callout", tone: "free", text: "Find Vestings is completely free and needs no signup. To get alerts before those unlocks, add the wallet in the app." },
      { type: "cta", text: "Try Find Vestings", href: "/find-vestings", label: "Search a wallet" },
    ],
  },
  {
    slug: "explorer",
    title: "The Token Vesting Explorer",
    description:
      "Explore any token's full vesting picture: every holder, locked supply, top-recipient concentration, and upcoming unlocks. Includes smart-money views.",
    category: "Features",
    icon: "compass",
    summary: "Explore any token's full vesting picture and top recipients.",
    body: [
      { type: "lead", text: "The Explorer (called Discover in the app) lets you go beyond your own wallets and investigate any token's vesting: who's vesting it, how much is locked, and what's about to unlock." },
      { type: "h2", text: "What you can see" },
      { type: "list", items: [
        "Every recipient vesting a given token, ranked by size.",
        "Total locked supply and top-holder concentration, so you can gauge how distributed a token is.",
        "Upcoming unlocks for that token across every protocol at once.",
        "Smart-money views: wallets receiving vestings of the most distinct tokens.",
      ] },
      { type: "h2", text: "Search any wallet" },
      { type: "p", text: "Pro users can search any wallet, not just their tracked ones, to see its full vesting position instantly. It's the quickest way to check a team wallet, an investor, or a counterparty." },
      { type: "h2", text: "Public token pages" },
      { type: "p", text: "Every token Vestream indexes also has a public page with its locked supply, holders, and upcoming unlocks, linked from the Explorer and from search results. These need no login." },
      { type: "callout", tone: "pro", text: "The Explorer, smart-money views, and search-any-wallet are Pro features. Public per-token pages are free." },
    ],
  },
  {
    slug: "web-dashboard",
    title: "The web dashboard",
    description:
      "Sign in to the Vestream web dashboard with a QR code from the app to see all your tracked wallets, upcoming unlocks, the Explorer, and tax tools on desktop.",
    category: "Features",
    icon: "monitor",
    summary: "Your full portfolio on desktop, via QR sign-in.",
    body: [
      { type: "lead", text: "The web dashboard brings your tracked wallets, upcoming unlocks, the Explorer, and tax tools to the big screen. It's available to Pro users and pairs securely with the app, with no passwords." },
      { type: "h2", text: "How to sign in (QR pairing)" },
      { type: "steps", items: [
        "On desktop, go to the [login page](/login).",
        "Open the Vestream app, then Settings, then Connect Desktop.",
        "Scan the QR code shown on the login page.",
        "You're in. The dashboard loads your wallets and unlocks.",
      ] },
      { type: "h2", text: "What's on it" },
      { type: "list", items: [
        "All your tracked wallets and their vesting positions in one view.",
        "The upcoming-unlock timeline across every wallet.",
        "The Token Vesting Explorer and search.",
        "Tax reports, income statements, and CSV exports.",
      ] },
      { type: "callout", tone: "pro", text: "The web dashboard is a Pro feature. Sign-in is QR-only, so there's no password to manage or leak, and pairing needs the app you're already signed in to." },
    ],
  },

  // ── Tax & reporting ──────────────────────────────────────────────────────────
  {
    slug: "tax-reports",
    title: "Tax reports & P&L",
    description:
      "Vesting income statements, claim history, and tax-ready CSV exports for Koinly, CoinTracker and TurboTax, plus a P&L ledger with automatic sell detection.",
    category: "Tax & reporting",
    icon: "receipt",
    summary: "Income statements, CSV exports, P&L, and sell detection.",
    body: [
      { type: "lead", text: "Vestream turns your on-chain vesting income into tax-ready reports. It records each claim as income at the value received, and helps you track disposals for capital-gains reporting." },
      { type: "h2", text: "Income vs gains" },
      { type: "p", text: "There are two halves to vesting tax. Income is the value of tokens at the moment you claim them. Gains (or losses) come later, when you sell, based on the difference between the sale price and that claim-time value. Vestream tracks both." },
      { type: "h2", text: "What's included" },
      { type: "list", items: [
        "Vesting income statement: every claim you've received, priced at receipt.",
        "Claim history across all your wallets and protocols.",
        "Tax-ready CSV exports formatted for Koinly, CoinTracker, and TurboTax, plus a generic format.",
        "Year-end PDF summary.",
        "P&L ledger: record entry prices and sales. Automatic sell detection surfaces likely disposals for you to confirm.",
      ] },
      { type: "h2", text: "How to run a report" },
      { type: "steps", items: [
        "Open the Tax section (in the app or the web dashboard).",
        "Run a scan to ingest your claim history across protocols.",
        "Review the income and P&L, then export a CSV for your accountant or tax software.",
      ] },
      { type: "callout", tone: "pro", text: "Tax reports, exports, and P&L are Pro features. Vestream provides data tools, not tax advice. Always confirm with a qualified professional." },
    ],
  },

  // ── Reference ────────────────────────────────────────────────────────────────
  {
    slug: "protocols",
    title: "Integrated protocols",
    description:
      "Every vesting protocol Vestream indexes: Sablier, Hedgey, UNCX, Team Finance, PinkSale, Superfluid, Unvest, Streamflow, Jupiter Lock, LlamaPay, and HoodLock.",
    category: "Reference",
    icon: "plug",
    summary: "Every vesting protocol Vestream indexes.",
    body: [
      { type: "lead", text: "Vestream reads vesting directly from each protocol's on-chain data, so coverage is real, not a manually-maintained list. Tap any protocol for its live tracker with TVL, recipients, and upcoming unlocks." },
      { type: "protocols" },
      { type: "h2", text: "How coverage works" },
      { type: "p", text: "Each protocol models vesting differently: linear streams, tranched schedules, NFT-based plans, TGE-plus-cycle locks, and simple time locks. Vestream normalises them all into one shape, so your dashboard, alerts, and exports look the same no matter which protocol a stream comes from." },
      { type: "callout", tone: "note", text: "Don't see a protocol you use? Let us know at team@vestream.io. We add integrations based on demand." },
    ],
  },
  {
    slug: "chains",
    title: "Supported chains",
    description:
      "The blockchains Vestream indexes for token vesting: Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, Avalanche, Solana, and Robinhood Chain.",
    category: "Reference",
    icon: "link",
    summary: "Every chain Vestream indexes, EVM and Solana.",
    body: [
      { type: "lead", text: "Vestream covers the major EVM chains plus Solana, and now Robinhood Chain. Vesting on any of these shows up automatically for a tracked wallet." },
      { type: "chains" },
      { type: "h2", text: "EVM and Solana" },
      { type: "p", text: "On EVM chains, an address is a single 0x account that works across every EVM network. On Solana, addresses are base58 and case-sensitive. Vestream handles both, so one tracked wallet can surface vestings across ecosystems at once." },
      { type: "callout", tone: "tip", text: "Vestream is the first vesting tracker to cover Robinhood Chain and its HoodLock locker. New chains are added as vesting activity appears on them." },
    ],
  },
  {
    slug: "developers",
    title: "Developer API & MCP",
    description:
      "Access Vestream's vesting data programmatically: a REST API across every protocol and chain, plus an MCP server for AI agents like Claude and Cursor.",
    category: "Reference",
    icon: "code",
    summary: "REST API + MCP server for the vesting data layer.",
    body: [
      { type: "lead", text: "Everything Vestream tracks is available programmatically, in one normalised schema across every protocol and chain." },
      { type: "cards", items: [
        { title: "REST API", body: "Query wallet vestings, upcoming unlocks, and individual streams over HTTPS with an API key.", href: "/developer" },
        { title: "MCP server", body: "The vesting data layer for AI agents, with native support for Claude, Cursor, and any MCP-compatible client.", href: "/ai" },
      ] },
      { type: "h2", text: "What you can build" },
      { type: "list", items: [
        "Portfolio and treasury dashboards that show upcoming unlocks.",
        "Alerting and automation keyed to on-chain unlock schedules.",
        "AI agents that answer vesting questions in natural language via MCP.",
      ] },
      { type: "cta", text: "Read the developer docs", href: "/developer", label: "Developer API" },
    ],
  },
  {
    slug: "plans",
    title: "Plans & pricing",
    description:
      "Vestream is free for 3 wallets and 10 alerts a month. Pro unlocks unlimited alerts, 10 wallets, the web dashboard, the Explorer, and tax exports.",
    category: "Reference",
    icon: "card",
    summary: "What's free, what's Pro, and how to upgrade.",
    body: [
      { type: "lead", text: "Vestream has a genuinely useful free plan and a Pro plan for power users. Upgrade in the app via the App Store or Google Play." },
      { type: "cards", items: [
        { title: "Free, $0", body: "Free wallet search, 3 tracked wallets, and 10 push alerts a month.", href: "/pricing" },
        { title: "Pro, $9.99/mo or $74.99/yr", body: "Unlimited push and email alerts, 10 wallets, the web dashboard, the Explorer, and tax-ready exports.", href: "/pricing" },
      ] },
      { type: "h2", text: "How to upgrade" },
      { type: "p", text: "Open the app and go to the upgrade screen, then subscribe through the App Store or Google Play. Your Pro features unlock everywhere, including the web dashboard once you pair it by QR." },
      { type: "callout", tone: "note", text: "Funds and teams needing more than 10 wallets, the REST API, MCP, or custom alert channels can reach us at team@vestream.io." },
      { type: "cta", text: "See full pricing", href: "/pricing", label: "View pricing" },
    ],
  },
];

// ── Lookups ────────────────────────────────────────────────────────────────
export const DOC_SLUGS = DOC_PAGES.map((p) => p.slug);

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}

/** Pages grouped by category in declaration order, powers the sidebar + overview. */
export function docsByCategory(): { category: string; pages: DocPage[] }[] {
  return DOC_CATEGORIES.map((category) => ({
    category,
    pages: DOC_PAGES.filter((p) => p.category === category),
  })).filter((g) => g.pages.length > 0);
}
