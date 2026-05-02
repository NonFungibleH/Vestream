# Vestream Feature Inventory (internal)

> Honest snapshot of what exists today. Ground truth for pitch decks, sales
> conversations, marketing brief writing, and "what does Vestream actually
> do?" answers. **Not a roadmap** — see `ROADMAP.md` for what's planned.
>
> _Last updated: 2026-05-02_
>
> Update on every shipping commit. One line per feature. Be specific about
> half-built things — the **partial** and **paused** badges below exist
> precisely so we can be honest internally about what's complete vs aspirational.

---

## Status legend

- **live** — shipped, working, no asterisks needed
- **beta** — shipped but expect bugs or reach limits; iterating
- **partial** — partially built; specific gaps called out per-item
- **paused** — built but currently disabled (e.g. via `disabled` flag)
- **planned** — on roadmap, not yet started

---

## At a glance — investor / pitch pull-quote numbers

Live numbers in `/admin` → **Index Health** panel. Approximate ranges as of 2026-05-02:

- **9 indexed protocols** active (Sablier, Hedgey, Superfluid, LlamaPay, UNCX, Unvest, PinkSale, Streamflow, Jupiter Lock); 1 paused (Team Finance)
- **6 chains in production** (Ethereum, BSC, Polygon, Base, Arbitrum, Solana) + 2 testnets (Sepolia, Base Sepolia)
- **~117k vesting streams cached** across mainnets
- **~ tens of thousands of unique recipient wallets** (run the admin query for the precise number)
- **$X.X B+ USD value indexed** — sum of latest TVL snapshots; varies daily, see admin
- **Web + mobile clients** — Next.js dashboard, native iOS + Android via Expo
- **REST API + MCP server** — `@vestream/mcp` npm package, OpenAPI spec, 3 endpoints
- **Daily refresh** via Vercel cron with self-fan-out architecture (no missed cells under normal ops)

---

## Recipient-side product (the core)

### Web dashboard (`/dashboard`)

| Feature | Status | Notes |
|---|---|---|
| Multi-wallet portfolio view | **live** | Free: 1 wallet, Pro: 3, Enterprise: ∞ |
| Cross-protocol unlock calendar | **live** | All 9 active protocols × 6 chains |
| Per-stream detail (expandable rows) | **live** | Emission chart + claim history per stream |
| Live USD valuation | **live** | DexScreener prices, refreshed per page load |
| Vesting progress bars | **live** | Claimed / claimable / locked tri-segment |
| Live unlock countdown | **live** | Per-second tick on hero, 30s tick in table |
| Stream annotations (custom names + 200-char notes) | **live** | Shipped 2026-05-02, see "Stickiness features" |
| Cliff-active / fully-vested badges | **live** | Surfaces edge states clearly |
| Cancellable stream watchdog | **live** | Warns when an issuer can rug a stream |
| Stream sharing (deep link + "share" button) | **live** | Single-stream URL works as link target |
| Discover — search any wallet | **live** | Token Vesting Explorer (Pro-gated) |
| Token explorer (`/token/[chainId]/[address]`) | **live** | Public, all wallets vested-to a token |
| Income statement page | **live** | Pro-gated, exportable to PDF |
| Tax exports page (`/dashboard/exports`) | **live** | Pro-gated, see "Tax & reporting" |

### Mobile app (Expo / React Native — iOS + Android)

| Feature | Status | Notes |
|---|---|---|
| Email OTP authentication (Bearer-token sessions) | **live** | SecureStore-persisted |
| Cross-device handoff | **live** | "Open in app" flow from web `/find-vestings` results |
| Portfolio tab (`/(tabs)/index`) | **live** | Cross-protocol stream list with chain badges |
| Calendar tab | **live** | Premium-mockup-tier visual upgrade shipped recently |
| Alerts tab | **partial** | Notification history list; empty-state UI pending mockup-tier upgrade |
| Settings tab (wallets, prefs, theme, biometric) | **live** | |
| Per-stream detail screen (`/stream/[id]`) | **live** | Emission chart, claim history, P&L tracker, annotations editor |
| Stream annotations (custom names + notes) | **live** | Shipped 2026-05-02, parity with web |
| Native push notifications | **live** | Expo Push Service; tap → `/claim-alert` route |
| Biometric lock (FaceID / TouchID) | **live** | Re-locks on app background |
| Background refresh (15-minute) | **live** | `expo-background-fetch` pre-warms cache |
| Dark / light mode | **live** | System-following toggle |
| RevenueCat IAP for Pro subscription | **live** | Monthly $17.99 / Annual $144.99 |
| Onboarding (welcome + auth + profile + first wallet + scan) | **live** | 5-step funnel |
| Cross-device first-wallet handoff | **live** | Reduces "find your vestings" friction |
| Deep link scheme (`vestream://`) | **live** | Stream and claim deep-links route correctly |

### Public marketing pages

| Feature | Status | Notes |
|---|---|---|
| Homepage (`/`) — B2C, white theme | **live** | Three-panel hero (forecast / P&L / tax exports) updated today |
| `/developer` — navy theme, REST + MCP marketing | **live** | API access request form |
| `/ai` — near-black, AI agent builders | **live** | MCP-focused |
| `/protocols` index + per-protocol landing pages | **live** | One landing page per active protocol; Team Finance returns 404 (paused) |
| `/protocols/[slug]/unlocks` — per-protocol unlock calendar | **live** | Live-fed from cache |
| `/unlocks` (range-based: today / week / 30d / 60d / 90d) | **live** | SEO landing pages for unlock-window queries |
| `/find-vestings` — public wallet scanner | **live** | Funnel into mobile app install |
| `/token/[chainId]/[address]` — public token explorer | **live** | All vestings for a given token |
| `/tokens/[symbol]` — symbol disambiguation page | **live** | E.g. USDC across multiple chains |
| `/resources` — long-form SEO articles | **live** | ~30 articles on vesting concepts, protocol guides |
| `/faq` — comprehensive FAQ with FAQPage JSON-LD | **live** | |
| `/pricing` — public price page | **live** | Live prices, Pro 14-day trial mentioned |
| `/early-access` — waitlist gate | **live** | OTP-based unlock flow |
| `/corporate/token-payroll` — B2B angle | **live** | Sender-side companion pitch |
| OpenGraph / Twitter Card images | **live** | Auto-generated for /protocols/* and /unlocks |
| Sitemap.xml | **live** | Includes all per-protocol and per-token pages |

---

## Index coverage (the supply side — what we know about)

### Protocols (9 active, 1 paused)

| Protocol | Status | Chains | Data source | Notes |
|---|---|---|---|---|
| **Sablier** | **live** | ETH, BSC, Polygon, Base, **Arbitrum**, Sepolia | Envio Hasura (single endpoint) | Linear + tranched (LockupTranched). Arbitrum wired 2026-05-02. |
| **Hedgey** | **live** | ETH, BSC, Polygon, Base, Sepolia | The Graph subgraph + ERC721Enumerable contract reads | NFT-based plans. BSC/Polygon/Base RPC-pool fix 2026-05-02 (was silently broken 8.85d). |
| **Superfluid** | **live** | ETH, BSC, Polygon, Base | Superfluid hosted subgraph | Cliff + linear streaming via VestingScheduler |
| **LlamaPay** | **partial** | ETH, BSC, Polygon, Base, Arbitrum (TVL only) | DefiLlama vesting passthrough | TVL-only — no per-wallet adapter yet. Real adapter on roadmap. |
| **UNCX (TokenVesting V3)** | **live** | ETH, BSC, Polygon, Base, Sepolia | The Graph subgraph | Token locker v3 |
| **UNCX (VestingManager)** | **live** | ETH only | eth_getLogs event scan | BSC/Base/Polygon dropped Apr 29 — dRPC free tier no longer serves logs there. ETH stays via shared multi-RPC pool. |
| **Unvest** | **live** | ETH, BSC, Polygon, Base | The Graph subgraph | Step / milestone vesting |
| **PinkSale (PinkLock V2)** | **live** | ETH, BSC, Polygon, Base | Direct contract reads via viem | No subgraph. Paginated multicall (50/page). PINKSALE_CONTRACT_ADDRESSES single-source-of-truth in protocol-constants.ts. |
| **Streamflow** | **live** | Solana | `@streamflow/stream` SDK + Helius RPC | First non-EVM protocol. AlignedContract variant skipped. mapBounded throttle. |
| **Jupiter Lock** | **live** | Solana | `getProgramAccounts` + dataSize=296 filter | Solana's default token locker (used by JUP team allocations). |
| **Team Finance** | **paused** | ETH, BSC, Polygon, Base, Sepolia | Squid GraphQL | Paused 2026-05-02 via `disabled: true` flag. Cache rows preserved. Re-enable = one flag flip + deep seed. |

### Chains (6 production + 2 testnets)

| Chain | ID | Ecosystem | Status |
|---|---|---|---|
| Ethereum mainnet | 1 | EVM | **live** |
| BNB Chain | 56 | EVM | **live** |
| Polygon | 137 | EVM | **live** |
| Base | 8453 | EVM | **live** |
| Arbitrum One | 42161 | EVM | **live** (Sablier wired; Hedgey/UNCX/Unvest/Superfluid pending) |
| Solana mainnet-beta | 101 | Non-EVM | **live** |
| Sepolia | 11155111 | EVM testnet | **live** (testing only) |
| Base Sepolia | 84532 | EVM testnet | **live** (testing only) |

### Scale signals (live in `/admin/Index Health`)

- Streams cached, by (protocol, chain) cell
- Distinct recipient wallets (mainnets only)
- USD value indexed (sum of latest TVL snapshots)
- Streams added in last 24h
- Cache freshness per cell (colour-coded by age)

### Indexing infrastructure

| Feature | Status | Notes |
|---|---|---|
| Multi-RPC pool with round-robin fall-through | **live** | dRPC + 1RPC + publicnode + chain-native; per-chain provider lists in `lib/vesting/rpc.ts` |
| Daily seed-cache cron with 3-way fan-out | **live** | heavy / Solana / subgraphs groups, each gets own 300s budget |
| Weekly deep seed (Sundays 04:00 UTC) | **live** | DEEP_SEED_LIMIT=5000 vs 500 incremental |
| TVL snapshot cron (daily 03:15 UTC) | **live** | Per (protocol, chain) row; honest-TVL methodology |
| writeToCache setWhere optimisation | **live** | Skips UPDATE when stream data unchanged; ~90% IO reduction |
| Hedgey discovery pagination (multicall in 100-call pages) | **live** | Required for free-RPC ~100KB response cap |
| Build-phase DB guards (NEXT_PHASE checks) | **live** | Prevents Postgres-pooler-drop build failures |
| Stream-id format `{protocol}-{chainId}-{nativeId}` | **live** | Stable across cache rebuilds; foundation for annotations + claims |
| Claim event ingestion (10 protocols) | **live** | All 10 ingestors shipped; powers tax exports |

---

## Notifications & alerts

| Feature | Status | Notes |
|---|---|---|
| Email unlock alerts | **live** | Resend; 1h–3d configurable lead window |
| Native mobile push notifications | **live** | Expo Push Service |
| Per-event push on individual unlocks | **live** | |
| Free tier: 3 lifetime push credits | **live** | `checkAndConsumePushCredit` gate |
| Pro / Enterprise: unlimited push + email | **live** | |
| Notification dedup log (`notifications_sent`) | **live** | Prevents duplicate sends |
| Per-wallet alert toggle | **live** | |
| Saved-search alerts (token-level watchlist digests) | **live** | Weekly digest opt-in, per-event opt-out by default |

---

## Tax & reporting (Pro-gated)

| Feature | Status | Notes |
|---|---|---|
| Tax-ready CSV export — Vestream generic format | **live** | 13 columns including new "Description" col carrying user annotations |
| Koinly format CSV | **live** | Native Koinly columns; description prefixes user notes |
| CoinTracker format CSV | **live** | Native CT columns |
| TurboTax format CSV | **live** | Cap-gains-friendly layout; description carries user notes |
| Year-end PDF | **live** | Income-statement PDF for tax filings |
| Income Statement page (web) | **live** | Pro-gated, browser-renderable + PDF export |
| Cost basis at claim event (USD-priced at receipt) | **live** | Real on-chain claim event timestamps via ingestors |
| Tax-jurisdiction-specific lot matching (FIFO / pooling / wash-sale) | **planned** | Roadmap "Soon" bucket |
| Auto sell-detection + P&L matching | **planned** | Roadmap "Next" bucket; ~3-4 weeks |

---

## Stickiness features (personal context)

| Feature | Status | Notes |
|---|---|---|
| Stream notes (200-char freeform per user, per stream) | **live** | Shipped 2026-05-02 |
| Stream custom names (80-char per user, per stream) | **live** | Shipped 2026-05-02; replaces auto-generated label in title + portfolio cells |
| Custom names flow into tax CSV "Description" column | **live** | Vestream-generic, Koinly, TurboTax formats |
| Tags / categories | **planned** | Next stickiness ship — see roadmap |
| Calendar export (.ics + Google Calendar subscribe) | **planned** | After tags |
| Watchlist / pinned streams | **planned** | |
| Per-stream alert preferences (mute / custom thresholds) | **planned** | |
| Counterparty / issuer field | **planned** | |
| Goal tracker | **planned** | |
| Shared view-only links for accountants | **planned** | |
| Document attachments (grant PDFs, side letters) | **planned** | Needs Supabase storage |

---

## Developer surface

| Feature | Status | Notes |
|---|---|---|
| REST API v1 (3 endpoints) | **live** | `/wallet/{address}/vestings`, `/wallet/{address}/upcoming-unlocks`, `/stream/{id}` |
| OpenAPI / Swagger UI (`/api-docs`) | **live** | Gated behind API access |
| API access request form (`/developer`) | **live** | Email-based; admin approval flow |
| API key issuance — `vstr_live_*` format | **live** | Shown once on creation, SHA-256 hash stored |
| Per-key rate limits (free: 30/min, 150/day) | **live** | Upstash Redis |
| API audit log | **live** | Visible in `/admin` |
| MCP server — `@vestream/mcp` npm package | **live** | 3 tools: `get_wallet_vestings`, `get_upcoming_unlocks`, `get_stream` |
| Webhook subscriptions | **live** | Schema + endpoint shipped; outbound dispatcher pending |
| Bearer-token auth for mobile (parallel to API keys) | **live** | `vstr_mob_*` prefix |
| Single endpoint serving both web (cookie) + mobile (Bearer) auth | **live** | Used for stream annotations |
| Public TVL leaderboard / trends API | **planned** | |

---

## Pricing & monetisation

| Feature | Status | Notes |
|---|---|---|
| Free tier (1 wallet, 3 lifetime push alerts) | **live** | |
| Pro web subscription ($14.99/mo · $119.99/yr · 14-day trial) | **live** | Stripe |
| Pro mobile IAP ($17.99/mo · $144.99/yr) | **live** | RevenueCat — iOS App Store + Google Play |
| Enterprise tier (contact sales) | **live** | Unlimited wallets, REST + MCP, SSO, dedicated support |
| Tier-gated features (wallet count, push credits, tax exports, Discover page) | **live** | Server-enforced at API layer |
| RevenueCat → DB sync via webhook | **live** | Updates `users.tier` on subscription events |
| Stripe → DB sync via webhook | **live** | |
| 14-day free trial (web Pro only) | **live** | |
| Free trial → Pro conversion analytics | **partial** | Server-side GA4 events fire; cohort funnel not yet wired |

---

## Auth & security

| Feature | Status | Notes |
|---|---|---|
| Email OTP login (web) | **live** | iron-session cookies |
| Email OTP login (mobile) | **live** | Bearer-token persisted in expo-secure-store |
| Cross-device handoff token (web → mobile) | **live** | Single-use mint via web "Get the app" flow |
| Wallet-connect SIWE (legacy) | **live** | Still present; OTP is now primary |
| Biometric lock (mobile) | **live** | FaceID / TouchID re-lock on background |
| Admin login (timing-safe + rate-limited) | **live** | ADMIN_PASSWORD-derived cookie token |
| API key SHA-256 hashing (plaintext never stored) | **live** | |
| RLS on Supabase tables | **disabled** | Was enabled briefly (migration 0010), then disabled (0011) — see migration history |

---

## Admin / ops infrastructure

| Feature | Status | Notes |
|---|---|---|
| Admin dashboard (`/admin`) | **live** | Beta analytics + Index Health + Operations |
| Beta analytics section (users, wallets, streams, alerts, waitlist, feedback) | **live** | |
| Index Health section (recipients, USD indexed, freshness rollup) | **live** | Shipped 2026-05-02 |
| Sign-up trend sparkline (14-day) | **live** | |
| Per-protocol / per-chain stream breakdown bars | **live** | |
| API access request review (approve / revoke) | **live** | |
| Active API keys list | **live** | |
| Waitlist export | **live** | |
| Beta feedback feed | **live** | |
| Cache stats endpoint (`/api/admin/cache-stats`) | **live** | Per (protocol, chainId) cell with freshestSec |
| Seed diagnostic endpoint (`/api/admin/seed-diagnostic`) | **live** | Runs discover + adapter.fetch for one protocol/chain pair |
| TVL snapshot manual triggers | **live** | `?protocol={slug}` query param + `?background=true` |
| Seed cache manual triggers (per-group fan-out) | **live** | `?group=heavy\|solana\|subgraphs` |

---

## Content / SEO surface

| Feature | Status | Notes |
|---|---|---|
| Per-protocol landing pages with FAQPage JSON-LD | **live** | 9 active protocols × full SEO meta |
| ~30 long-form articles in `/resources` | **live** | Vesting concepts, protocol guides |
| FAQ JSON-LD on `/faq` | **live** | |
| WebApplication + Organization + WebSite JSON-LD on homepage | **live** | |
| Token symbol disambiguation page | **live** | E.g. multi-chain USDC |
| OpenGraph image generation per route | **live** | |
| Sitemap.xml (auto-generated) | **live** | |
| robots.txt | **live** | |

---

## Analytics & observability

| Feature | Status | Notes |
|---|---|---|
| Vercel Analytics (server-side, ad-blocker-proof) | **live** | |
| Google Analytics 4 (cookie-gated) | **live** | Activates with `NEXT_PUBLIC_GA_ID` env |
| Microsoft Clarity (heatmaps + session replay, cookie-gated) | **live** | Activates with `NEXT_PUBLIC_CLARITY_ID` env |
| Server-side GA4 via Measurement Protocol (subscription events) | **live** | Bypasses ad blockers for revenue events |
| Sentry error tracking (web) | **live** | |
| Sentry stub (mobile — wired but not yet activated) | **partial** | Infrastructure ready; `lib/sentry.ts` is a no-op until DSN set |
| Mobile analytics provider | **planned** | PostHog or Firebase candidate; queue-and-flush stub in place |
| Conversion funnel (waitlist → signup → wallet → claim → Pro) | **planned** | Needs a real analytics provider with funnels |
| Geographic distribution / referrer breakdown | **planned** | Same |

---

## Known gaps / honest weak spots

Captured deliberately so they don't get rediscovered as surprises:

- **Auto P&L tracking from DEX sells** — competitors (CoinTracker, Koinly) have this; we don't yet. Roadmap "Next" bucket. Big build (~3-4 weeks) but our claim-event cost-basis is a defensible edge.
- **Tax-jurisdiction-specific accuracy** — current tax exports are good "for an accountant to work with" but not "tax-ready" claims-able. Per-jurisdiction logic (FIFO, UK pooling, etc.) on roadmap.
- **Hedgey on Arbitrum / UNCX on Arbitrum / Unvest / Superfluid on Arbitrum** — chain support shipped, only Sablier currently wired on Arbitrum. Subgraph-deployment-ID research per protocol.
- **LlamaPay per-wallet adapter** — TVL passthrough only; per-wallet stream tracking is a follow-up.
- **Custom contract import** — power users with bespoke vesting contracts can't add them yet. Roadmap "Later".
- **Shared view-only links / accountant access** — would benefit Pro tax users but not built.
- **Mobile design system applied to all screens** — only Calendar tab is at premium-mockup tier; Home / Discover / Onboarding / Alerts pending.
- **Team Finance paused** — protocol still listed in articles but not actively indexed. Re-enable is one flag flip + a deep seed.
- **No Slack / Telegram / WhatsApp alerts** — Enterprise marketing copy mentions these; not built yet.

---

## Maintenance

This file is the **canonical answer to "what does Vestream do?"** Keep it current.

- Update on every shipping commit. One line per feature added / removed / status-changed.
- Live numbers in the "At a glance" section come from the `/admin` Index Health panel — re-run the queries before any pitch deck export.
- Cross-reference with `ROADMAP.md` — when a "planned" item ships, move it to "live" here AND remove from the relevant roadmap bucket.
- Keep tone honest. **partial** and **paused** badges are features, not bugs. If we can't write the badge accurately, the underlying feature isn't ready to claim publicly.

For a **public** version, fork this doc to `/public-features` (or fold curated subsets into existing marketing pages). Strip **partial** / **paused** / internal jargon; reframe **planned** items as roadmap teasers if at all.
