# Vestream — Claude Code Reference

## Operating principles

These four rules guide every change in this codebase. Read them once,
then internalise. Everything below is project-specific context; these
four are the lens through which to read the rest.

### 1. Think before coding
State your assumptions about the change before writing it. If a
requirement is ambiguous, ask — don't guess. If the path forward is
unclear, propose two or three options with trade-offs rather than
picking one silently and shipping it. A 30-second clarifying question
saves an hour of unwinding the wrong solution.

### 2. Simplicity first
Write the minimum code that solves the actual problem in front of you.
No premature abstractions, no "I'll add a config option for that
future case" — that future rarely arrives, and the abstraction always
costs reading time. If you find yourself building a class hierarchy
or plugin system for a 10-line change, stop. The native primitives
are almost always enough.

### 3. Surgical changes
Don't touch code unrelated to the request. Every changed line should
trace back to what was asked. "While I'm here, let me also refactor X"
is how PRs become unreviewable and unrelated bugs slip in. If you
spot something off in a different file, surface it as a follow-up
task or TODO comment — don't roll the cleanup into this commit.

### 4. Goal-driven execution
Turn vague instructions into verifiable success criteria BEFORE
writing code. "Make the dashboard load faster" is unworkable; "the
/dashboard route should TTFB under 500ms on a cold Vercel edge cache"
is workable. Restate the goal in concrete terms first, then build.
Aim for changes where you can say afterwards: "I'll know I'm done
when X is true."

---

## Stack
- **Framework**: Next.js pinned to **`16.3.0-canary.19`** exact (no caret). Earlier 16.2.x stable is in the vulnerable range of 7 published advisories (middleware bypass, RSC cache poisoning, SSRF) — the fix only landed in `16.3.0-canary.6+`. Re-pin to 16.3.0 stable as soon as it lands. Don't drop the exact-pin without checking `npm audit` against the new version.
- **Styling**: Tailwind CSS v4 + inline `style={{}}` for one-off values (no separate CSS files)
- **Database**: Postgres via Drizzle ORM + Supabase hosting
- **Auth (web — desktop dashboard)**: QR pairing only. Pro-tier users open the mobile app → Settings → Connect Desktop → scan the QR shown at `vestream.io/login`. The poll endpoint sets an `iron-session` cookie (`vestr_session`) with the user's address. No email/password, no SIWE. See "Auth model" subsection below.
- **Auth (mobile)**: Bearer token via `Authorization: Bearer <token>` header — issued at email-OTP login. Mobile-app email OTP routes (`/api/mobile/auth/*`) are unchanged; only the web-side OTP was removed in Phase 5 (May 2026).
- **Wallet**: wagmi v3 + viem v2 (still used for on-chain reads; SIWE login no longer primary)
- **Email**: Resend
- **Rate limiting**: Upstash Redis
- **Data fetching**: SWR (client), native fetch (server)
- **MCP**: `@vestream/mcp` npm package (lives in `mcp/`)
- **Mobile subscriptions**: RevenueCat (`react-native-purchases`) for iOS/Android IAP

---

## Directory Map

```
src/
  app/                    Next.js App Router pages + API routes
    page.tsx              Homepage — B2C portfolio audience (white theme)
    developer/page.tsx    Developer API page — navy theme
    ai/page.tsx           AI Agents page — near-black theme
    pricing/page.tsx      Standalone pricing page (also embedded on homepage)
    dashboard/page.tsx    Authenticated app dashboard
    dashboard/discover/   Token Vesting Explorer (authenticated)
    explore/[chainId]/[tokenAddress]/  Public token explorer
    early-access/         Waitlist / early access gate page
    login/                SIWE wallet login
    resources/            Blog/articles index + [slug] pages
    admin/                Internal admin (key management, approvals)
    api-docs/             Swagger UI (gated)
    developer/account/    API key management (gated)
    developer/portal/     API key login page
    settings/             Tracked wallet management + notification preferences
    login/                QR-based desktop sign-in (Pro tier only)
    api/                  All API route handlers (see API Routes section)

  components/
    SiteNav.tsx           Global nav — used on every public page
    WaitlistForm.tsx      Email capture form (used on homepage CTA)
    ApiAccessForm.tsx     Developer API access request form
    StreamCard.tsx        Individual vesting stream display card
    VestingTimeline.tsx   Visual unlock timeline component
    UnlockSummary.tsx     Dashboard unlock summary widget
    WalletInput.tsx       Address input with ENS resolution
    WalletList.tsx        Tracked wallets list manager
    UpsellModal.tsx       Plan upgrade prompt
    ConnectWallet.tsx     Wallet connection button
    AuthCard.tsx          SIWE login card
    ContactModal.tsx      Contact/enquiry modal
    CookieBanner.tsx      GDPR cookie consent
    Providers.tsx         wagmi + react-query providers wrapper
    (AuthCard.tsx removed May 2026 — old OTP login form, replaced by QR)
    ui/                   shadcn primitives (button, card, badge, input, etc.)

  lib/
    vesting/
      types.ts            VestingStream interface + math helpers (source of truth)
      adapters/           One file per protocol — sablier, hedgey, uncx, uncx-vm,
                          unvest, team-finance, superfluid, pinksale. Each exports fetchStreams(address, chainId)
      aggregate.ts        Calls all adapters in parallel, dedupes, sorts
      normalize.ts        Cross-protocol field normalisation
      dbcache.ts          Cache-first read/write to vestingStreamsCache (serves stale + background-revalidates; filters disabled protocols)
      explorer.ts         Token-level explorer queries (all holders of a token)
      graph.ts            The Graph API helpers
      ingestors/          Per-protocol claim-event ingestors (*-claims.ts) → claimEvents table (tax income). index.ts fans out via ingestAllClaimsForUser / ingestClaimsForToken
      sell-detect.ts      Auto sell-detection: Alchemy getAssetTransfers → disposalCandidates (tax gains)
      historical-prices.ts getHistoricalPrice(chainId, token, ts) — USD-at-claim/at-sale pricing (Redis-cached)
      user-vestings.ts    getUserVestingTokens — vestings-first list (one entry per token + claim totals)
    db/
      schema.ts           Drizzle table definitions (source of truth for DB shape)
      index.ts            Drizzle client singleton
      queries.ts          Common query helpers
    auth/session.ts       iron-session config + getSession helper
    api-key-auth.ts       API key hashing, validation, rate limit checks
    notifications/        Email scheduler + Resend integration
    ratelimit.ts          Upstash rate limiter helpers
    cors.ts               CORS headers for /api/v1/* routes
    wagmi.ts              wagmi config (chains, connectors)
    articles.ts           MDX/markdown article loader for /resources
    utils.ts              clsx/cn helper
```

---

## Page Architecture & Themes

Three distinct audience pages with deliberate visual hierarchy:

| Page | Route | Audience | Theme | Background |
|---|---|---|---|---|
| Portfolio | `/` | Token holders / retail | Light | `#f8fafc` (white) |
| Developers | `/developer` | API builders | Navy | `#0d1b35` |
| AI Agents | `/ai` | AI agent builders | Near-black | `#0d0f14` |

### Rules
- **Never mix themes** — each page uses its own background throughout all sections
- **SiteNav theme** must match: `<SiteNav theme="light" />` on `/`, `<SiteNav theme="navy" />` on `/developer`, `<SiteNav theme="dark" />` on `/ai`
- The developer page uses navy card backgrounds (`#122040`, `#0a1628`) — NOT the near-black values from `/ai`
- The AI page uses near-black card backgrounds (`#141720`, `#0d0f14`)

---

## SiteNav

```tsx
import { SiteNav } from "@/components/SiteNav";

<SiteNav theme="light" />   // homepage, pricing, resources — white nav
<SiteNav theme="navy" />    // /developer — navy nav matches page bg
<SiteNav theme="dark" />    // /ai — near-black nav matches page bg
```

### Nav links (current)
```ts
const NAV_LINKS = [
  { label: "Protocols", href: "/protocols" },
  { label: "Demo",      href: "/demo"      },
  { label: "Pricing",   href: "/pricing"   },
];
```

- **Do not add** Resources or other links to the top nav — they live in page footers
- Pricing IS in the nav (added 2026-06-01)
- CTA is always "Early Access →" linking to `/early-access`
- Active state: `"/"` uses exact match only (`pathname === "/"`); all other hrefs use startsWith

### Logo files
All logos live in `/public/`:
- `logo.svg` — horizontal lockup, light backgrounds (320×80)
- `logo-dark.svg` — horizontal lockup, dark backgrounds, white wordmark (320×80)
- `logo-icon.svg` — V-path mark only, square (100×100)

The nav uses `<img src={isDark ? "/logo-dark.svg" : "/logo.svg"} />` — never inline SVG or text for the logo.

---

## Design System

### Colour palette (shared across all pages)

```
Blue accent:     #2563eb   (primary CTA, active states)
Purple accent:   #7c3aed   (gradient partner)
Indigo:          #6366f1   (Fund tier, MCP / AI contexts)
Green:           #10b981   (Fund tier checks, success states)
Cyan:            #0891b2   (explorer, secondary accents)

Gradient (CTAs): linear-gradient(135deg, #2563eb, #7c3aed)

Light page bg:   #f8fafc
Light card bg:   white
Light border:    rgba(0,0,0,0.07–0.09)
Light text:      #0f172a (headings), #64748b (body), #94a3b8 (muted)

Navy page bg:    #0d1b35
Navy card bg:    #122040 (raised), #0a1628 (recessed/alt sections)
Navy border:     rgba(255,255,255,0.06–0.09)
Navy text:       white (headings), rgba(255,255,255,0.55) (body), #94a3b8 (muted)

Dark page bg:    #0d0f14
Dark card bg:    #141720 (raised), #0d0f14 (recessed)
Dark border:     rgba(255,255,255,0.06–0.08)
Dark text:       white (headings), rgba(255,255,255,0.55) (body)
```

### Typography
- All heading letter-spacing: `letterSpacing: "-0.02em"` to `"-0.03em"`
- H1 font size: `clamp(2.5rem, 5vw, 3.75rem)` on hero sections
- Body text: `text-sm` (14px) or `text-base` (16px), `leading-relaxed`
- Mono/code: `fontFamily: "monospace"` (system mono, no custom font)
- Uppercase labels: `text-xs font-semibold uppercase tracking-widest`

### Spacing & layout
- Max widths: `max-w-5xl` (content), `max-w-4xl` (medium), `max-w-2xl` / `max-w-3xl` (narrow CTA/form)
- Section padding: `px-4 md:px-8 pb-16 md:pb-28` (standard section)
- Always use responsive padding: `px-4 md:px-8` — never just `px-8`
- Grids: always use responsive breakpoints — e.g. `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; **never** hardcode `grid-cols-3` without mobile fallback

### Cards
```tsx
// Light page card
<div className="rounded-2xl p-6"
  style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

// Navy page card (raised)
<div className="rounded-2xl p-6"
  style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>

// Dark page card (raised)
<div className="rounded-2xl p-6"
  style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
```

### Badges / Pills
```tsx
// Blue badge (used for page/section labels)
<div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold"
  style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)", color: "#2563eb" }}>

// Amber badge (used for "Beta Testing", "Coming soon")
<div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
  style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#d97706" }}>
```

### CTA buttons
```tsx
// Primary gradient (main CTA)
<a className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 4px 20px rgba(37,99,235,0.3)" }}>

// Ghost blue (secondary on dark pages)
<a className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm"
  style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa" }}>
```

---

## Logo & Brand — DO NOT CHANGE

The V-path mark concept:
- **Left arm** (solid line) = vested past
- **Valley dot** = now / the present moment
- **Right arm** (ghost/faded line) = future unlocks
- **Fading dots** = upcoming unlock events getting further away

The SVG files in `/public/` are the canonical versions. Do not redesign or alter them without explicit instruction.

---

## Marketing Content Conventions

### Fake token names in mockups
Never use real token names (ARB, OP, UNI, etc.) in landing page mockups — it implies real integrations. Always use:
- **NOVA** — orange, primary example token
- **FLUX** — blue/purple, secondary
- **VEST** — green, tertiary
- **KLAR** — cyan, fourth

### Fake wallet addresses
Use truncated form: `0x3f5CE...8b2e`, `0x1a4c...f2d8` — never real addresses.

### Protocol / chain references
Use real protocol names (Sablier, Hedgey, UNCX, Unvest, Team Finance) and chain names (Ethereum, Base, BNB Chain, Polygon) — these are factual integrations, not marketing claims.

---

## Routing & Auth Gates

### Public routes (no auth)
`/`, `/developer`, `/ai`, `/pricing`, `/resources`, `/resources/[slug]`,
`/early-access`, `/login`, `/privacy`, `/terms`, `/faq`, `/contact`,
`/find-vestings`, `/explore/[chainId]/[tokenAddress]`

`/login` renders the QR pairing page — anyone can visit it, but
only a Pro-tier mobile app can complete the handshake.

### Gated routes (middleware in `src/middleware.ts`)

| Route | Cookie required | Redirect if missing |
|---|---|---|
| `/dashboard/*` | `vestr_session` (iron-session, set by QR pair) | `/login` |
| `/api-docs` | `vestr_early_access` OR `vestr_api_access` | `/developer/portal` |
| `/developer/account` | `vestr_api_access` | `/developer/portal` |
| `/admin/*` | `vestr_admin` | `/admin/login` |

The dashboard middleware just checks for cookie *presence*. The
encrypted iron-session payload is decrypted server-side in dashboard
route handlers via `getSession()`; if `session.address` is empty, the
handler returns 401 / redirects, so a stripped or corrupted cookie
still bounces.

### Auth model — QR pairing for desktop

Web sign-in is QR-only as of Phase 5 (May 2026). The flow:

1. User on desktop visits `/login`. The page calls
   `POST /api/auth/desktop-pair/init` which mints a UUID pairing
   code, stores `{status:"waiting"}` in Upstash Redis with a 5-min
   TTL, and returns the code. Page renders the code as a QR
   (`vestream://desktop-pair?code=<uuid>`) and starts polling.
2. User opens the mobile app → Settings → "Connect Desktop". Camera
   scans the QR. App calls `POST /api/mobile/desktop-pair/confirm`
   with bearer token + code. Server checks `user.tier === "pro"`
   (canAccessDashboard helper); on success writes
   `{status:"confirmed", address}` to the same Redis key preserving
   TTL.
3. Desktop's poll picks up the confirmation. The poll route does
   GETDEL on the Redis key (replay-proof), upserts the user, and
   calls `session.save({ address })`. Desktop now has the iron-
   session cookie and `window.location = "/dashboard"`.

Removed: web-side OTP routes, SIWE nonce/verify, AuthCard component,
mobile-handoff (which depended on the web user being pre-authenticated).
Mobile-side OTP (`/api/mobile/auth/*`) is unchanged — that's how mobile
users still sign into the app itself.

### Setting cookies (for local dev/testing)
```js
// In browser console on localhost:3000
document.cookie = "vestr_api_access=1; path=/";
// vestr_admin is now a derived token — set it via the login form at /admin/login
// vestr_session is set automatically by the QR pairing flow — there's no
// dev shortcut; either run through the mobile app, OR temporarily call
// session.save({ address: "test@example.com" }) from a server component
// you're hacking on.
```

---

## API Routes

### Public REST API (`/api/v1/`)
These are the external developer API endpoints — require `Authorization: Bearer vstr_live_...` header.

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/wallet/[address]/vestings` | All streams for a wallet |
| GET | `/api/v1/wallet/[address]/upcoming-unlocks` | Upcoming unlock events |
| GET | `/api/v1/stream/[streamId]` | Single stream detail |
| GET/POST | `/api/v1/admin/keys` | Admin: list/create API keys |

Stream ID format: `"{protocol}-{chainId}-{nativeId}"` e.g. `sablier-1-12345`, `uncx-56-9876`

### Internal app API (`/api/`)
| Route | Purpose |
|---|---|
| `/api/vesting` | Dashboard: fetch streams for tracked wallets |
| `/api/wallets` | CRUD for tracked wallets (web) |
| `/api/wallets/[address]` | PATCH label/chains/protocols/tokenAddress; DELETE wallet |
| `/api/wallets/scan` | Trigger multi-protocol scan (Pro only) |
| `/api/market` | DexScreener price data |
| `/api/prices` | Token price cache |
| `/api/explore` | Token explorer queries |
| `/api/auth/desktop-pair/init` | QR pair: mint pairing code (called by `/login`) |
| `/api/auth/desktop-pair/poll` | QR pair: desktop polls; sets iron-session on confirmation |
| `/api/auth/logout` | Clear iron-session cookie |
| `/api/auth/account` | DELETE: account self-deletion |
| `/api/waitlist` | Waitlist email signup |
| `/api/api-access` | Submit developer API access request |
| `/api/contact` | Contact form submission |
| `/api/feedback` | Beta feedback submission |
| `/api/find-vestings/save-link` | Web→mobile handoff: persist (email, wallet) so mobile OTP-verify can auto-claim it. Fires a confirmation email via Resend with App Store badges. Rate-limited 20/hr per (IP, email). |
| `/api/notifications/preferences` | Save notification settings |
| `/api/claims/history` | GET: claim history (income), filters `since`/`until`/`protocol`/`tokenAddress`. POST `?action=refresh`: ingest claims for the user's wallets (global, or scoped via `chainId`+`protocol`). |
| `/api/claims/vestings` | GET: one entry per token the user vests, with claim totals — the vestings-first list on the Tax page. |
| `/api/claims/export` | GET: tax-ready CSV (Koinly / CoinTracker / TurboTax / generic), filters `since`/`until`/`tokenAddress`. Persists a copy to `taxReportFiles`. |
| `/api/dashboard/pnl/[token]` | GET entry price + sales + purchases + pending sell-detection candidates; POST entry price; DELETE clears. Web mirror of `/api/mobile/pnl/[token]`. |
| `/api/dashboard/pnl/[token]/sales` + `/sales/[saleId]` | Manual gains ledger: POST add sale, DELETE remove. |
| `/api/dashboard/pnl/[token]/detect-sales` | POST `?chainId=`: auto sell-detection scan (Alchemy `getAssetTransfers`, ETH+Base) → upserts `disposalCandidates`, returns pending. Pro-gated, rate-limited. |
| `/api/dashboard/pnl/[token]/candidates/[id]` | POST `{action: confirm\|dismiss}`: confirm → `streamSales` (source="detected"); dismiss → keep, skip on re-scan. |
| `/api/cron/ingest-claims` | Cron (daily 07:00 UTC): runs `ingestAllClaimsForUser` for paid users → populates `claimEvents`. `?userId=` scopes to one user (verification). |
| `/api/cron/notify` | Cron: send unlock notification emails |
| `/api/cron/cleanup-pending-links` | Cron (daily 04:15 UTC): sweeps expired unclaimed `pending_wallet_links` + > 30 day `webhook_event_dedup` rows |
| `/api/admin/login` | Admin login — rate-limited, timing-safe, sets derived cookie |
| `/api/admin/approve` | Admin: approve API access request |
| `/api/admin/revoke` | Admin: revoke an API key |
| `/api/developer/unlock` | Set vestr_api_access cookie |
| `/api/stripe/webhook` | Stripe webhook (signature-verified, replay-deduped via `webhook_event_dedup`) |

### Mobile API (`/api/mobile/`)
| Route | Purpose |
|---|---|
| `/api/mobile/auth/email` | Mobile OTP: send + verify (both actions on one route). Honours `REVIEWER_EMAIL` + `REVIEWER_OTP` env-var bypass for App Store / Play Store reviewers. |
| `/api/mobile/me` | Current user profile + tier |
| `/api/mobile/me/timezone` | POST IANA timezone string. Mobile detects via `Intl.DateTimeFormat().resolvedOptions().timeZone` on launch and POSTs here so emails render dates in local time. |
| `/api/mobile/wallets` | CRUD for tracked wallets (mobile) — enforces same free-plan limits as web |
| `/api/mobile/notifications` | Save mobile notification preferences |
| `/api/mobile/notifications/test` | POST → fire a sample push to the user's `expoPushToken`. Doesn't consume the monthly push budget. |
| `/api/mobile/notifications/log` | GET last N (default 30, max 100) rows from `notifications_sent` for the requesting user, joined with vesting cache for token symbols. |
| `/api/mobile/pnl/[token]` | GET (entry price + sales), POST (upsert entry price), DELETE (clear both). Per-token P&L cross-device sync — see "P&L sales ledger" cross-ref below. |
| `/api/mobile/pnl/[token]/sales` | POST → add a sale row |
| `/api/mobile/pnl/[token]/sales/[saleId]` | DELETE → remove one sale, scoped to requesting user |
| `/api/mobile/desktop-pair/confirm` | QR pair: mobile confirms a pairing code (Pro tier required) |
| `/api/mobile/revenuecat-webhook` | RevenueCat subscription events → update user tier in DB. Replay-deduped via `webhook_event_dedup`. On OTP verify the handler also auto-claims any `pending_wallet_links` for the same email (web→mobile handoff). |

---

## Database Schema (Drizzle + Postgres)

Tables in `src/lib/db/schema.ts`:

| Table | Purpose |
|---|---|
| `users` | Authenticated wallet users (address, tier, scan limits, monthly push counter) |
| `wallets` | Tracked wallet addresses per user (with labels, chain/protocol filters) |
| `notificationPreferences` | Per-user email alert settings |
| `notificationsSent` | Dedup log — prevents re-sending the same alert |
| `apiKeys` | Developer API keys (stored as SHA-256 hash only, never plaintext) |
| `apiAccessRequests` | Submitted access request forms (reviewed manually) |
| `waitlist` | Email waitlist signups |
| `betaFeedback` | In-app feedback submissions |
| `vestingStreamsCache` | Persisted normalised VestingStream objects from subgraphs |
| `tokenPricesCache` | Read-through cache for DexScreener / CoinGecko USD prices. Hourly refresh cron picks the stalest entries. |
| `pendingWalletLinks` | Web→mobile handoff. (email, wallet_address) rows persisted from `/find-vestings` email-capture. Mobile OTP verify auto-claims matching rows into the `wallets` table. 30-day TTL. |
| `webhookEventDedup` | (event_id, source) replay protection for the RevenueCat + Stripe webhooks. `claimWebhookEvent()` in `lib/webhook-dedup.ts` is the single gate; failure-open on DB outage. 30-day TTL via the cleanup cron. |
| `streamPnl` | 1:1 entry-price row per `(userId, tokenAddress)`. Powers the cross-device P&L sync at `/api/mobile/pnl/[token]`. Unique index enforces one entry-price per user-per-token. |
| `streamSales` | 1:N sales-ledger rows per `(userId, tokenAddress)`. Each row = `{saleDate, amount, price, source}`. `source` is `"manual"` or `"detected"` (confirmed from a sell-detection candidate). Indexed on `(userId, tokenAddress)`. |
| `streamPurchases` | 1:N purchase-ledger rows per `(userId, tokenAddress)` — cost-basis lots, mirror of `streamSales`. |
| `claimEvents` | Per-claim income rows for the tax feature. One row per on-chain withdrawal/claim: `(userId, streamId, protocol, chainId, tokenAddress, tokenSymbol, amount, claimedAt, usdValueAtClaim)`. Populated by the per-protocol claim ingestors (`src/lib/vesting/ingestors/*-claims.ts`) via the `ingest-claims` cron. `usdValueAtClaim` is priced at receipt via `getHistoricalPrice`. This is the **income** half of the Tax Reports tool. |
| `disposalCandidates` | Sell-detection inbox. One row per outbound ERC-20 transfer of a tracked token: `(userId, chainId, tokenAddress, txHash, uniqueId, toAddress, amountRaw, decimals, occurredAt, priceUsdAtTime, internalTransfer, status)`. `status` ∈ `pending|confirmed|dismissed`; confirmed rows are copied into `streamSales` (source="detected"). Dedup unique index on `(userId, chainId, txHash, uniqueId)`. The **gains** half. See `src/lib/vesting/sell-detect.ts`. |
| `taxReportFiles` | Persisted CSV exports (so mobile Tax Reports can list + re-download). Written via `after()` from `/api/claims/export`. |
| `tokenVestingRollups` | Per-token vesting rollup (PK `chain_id` + lowercased `token_address`): `total_locked`, `top_holder_share`, wallet/round/stream counts, vest span (`first_start`/`last_end`), `has_cliff`. The **durable fix for the explorer's recurring Cloudflare 524s** — the Vesting Explorer used to compute these aggregates LIVE per render (a per-recipient nested GROUP BY that hit 4s+ under pooler load). `refreshTokenRollups()` (in `lib/vesting/token-rollups.ts`) recomputes the whole table in the hourly `refresh-rollups` cron; the explorer does ONE indexed read (`readTokenRollups`) — ~49ms vs ~6.2s. Stale rows for now-fully-vested tokens are harmless (readers key on the live token set). |

`users.timezone` (IANA string, nullable) — added 2026-05-20. Mobile detects via `Intl.DateTimeFormat` and POSTs to `/api/mobile/me/timezone`. Used by the email scheduler to render dates in user-local time. Future quiet-hours / daily-digest features will consume the same column.

### API key format
`vstr_live_{32 random hex bytes}` — plaintext shown once on creation, never stored. Only SHA-256 hash + 12-char prefix kept in DB.

### User tiers
`"free"` | `"mobile"` | `"pro"` — stored on `users.tier`. No trial period — users start on free.
Renamed in Phase 1 (May 2026) from the legacy `"free"|"pro"|"fund"` scheme.
`normaliseTier()` in `src/lib/auth/tier.ts` defensively coerces any unknown
DB value (including legacy `"fund"` rows) to `"free"`.

| Tier | $ | Wallets | Push alerts | Email alerts | Web dashboard | Tax exports |
|---|---|---|---|---|---|---|
| Free | $0                              | 3  | 10 / month (resets) | — | — | — |
| Pro  | $9.99/mo *or* $74.99/yr (37% off) | 10 | Unlimited           | ✓ | ✓ (QR sign-in) | ✓ Koinly / CoinTracker / TurboTax + Income Statement + Year-end PDF |

The web dashboard (and Discover, saved searches, tax exports) is gated
to `"pro"` only via `canAccessDashboard()` in `src/lib/auth/tier.ts`.
Legacy `tier="mobile"` rows (pre-May-2026 subscribers on the retired
middle tier) are aliased to Pro everywhere — same wallet cap, same
feature set — until natural renewal drains the alias.

**Wallet-count enforcement** (`src/app/api/wallets/route.ts` +
`src/app/api/mobile/wallets/route.ts`):
- Free: 3 · Pro: 10. Legacy `mobile` tier kept at 10 (pro alias).
- Pro is finite at 10 because the dashboard renders all wallets in one
  view; bigger fleets contact us directly via team@vestream.io. No
  self-serve enterprise tier at this stage.
- Push alerts metered by `users.pushAlertsSent` (monthly counter, resets
  on the 1st of each calendar month — `users.pushAlertsMonthStart`
  tracks which month it belongs to). `checkAndConsumePushCredit(userId)`
  in `src/lib/db/queries.ts` is the single gate — Pro is unmetered;
  Free is capped at `FREE_PUSH_ALERT_LIMIT = 10` per month.

**Wallet indexes**: `wallets_user_idx` (userId) and `wallets_user_address_idx` (userId + address) are defined in schema.

---

## Vesting Data Layer

### VestingStream interface (`src/lib/vesting/types.ts`)
This is the canonical data shape everything normalises to:
```ts
interface VestingStream {
  id: string;               // "{protocol}-{chainId}-{nativeId}"
  protocol: string;         // "sablier" | "hedgey" | "uncx" | "uncx-vm" | "unvest" | "team-finance" | "superfluid" | "pinksale"
  chainId: SupportedChainId;
  recipient: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  totalAmount: string;      // stringified bigint
  withdrawnAmount: string;
  claimableNow: string;
  lockedAmount: string;
  startTime: number;        // unix seconds
  endTime: number;
  cliffTime: number | null;
  isFullyVested: boolean;
  nextUnlockTime: number | null;
  cancelable?: boolean;
  shape?: "linear" | "steps";
  unlockSteps?: { timestamp: number; amount: string }[];
  claimEvents?: { timestamp: number; amount: string }[];
}
```

### Supported chains
| Chain | ID | Ecosystem |
|---|---|---|
| Ethereum | 1 | EVM |
| BNB Chain | 56 | EVM |
| Polygon | 137 | EVM |
| Base | 8453 | EVM |
| Arbitrum One | 42161 | EVM |
| Solana | 101 | Non-EVM (SVM) |
| Sepolia (testnet) | 11155111 | EVM |
| Base Sepolia (testnet) | 84532 | EVM |

Non-EVM chain IDs are synthetic (Solana has no canonical EVM-style chainId — 101 matches Solana's cluster enum convention). EVM address format: 0x-prefixed hex. Solana format: base58 pubkey. Address validation is centralised in `src/lib/address-validation.ts`; call `isValidWalletAddress(addr)` anywhere you'd previously have called `viem.isAddress(addr)`.

### Supported protocols
| Protocol | ID | Chains | Data source | Notes |
|---|---|---|---|---|
| Sablier | `sablier` | ETH, BSC, Polygon, Base, Arbitrum, Sepolia | Envio Hasura (single endpoint, chainId-filtered) | Linear + tranched (LockupTranched). Replaced per-chain The Graph subgraphs in 2025. |
| Hedgey | `hedgey` | ETH, BSC, Polygon, Base, **Arbitrum, Optimism**, Sepolia | Event-driven indexer (ERC721 `Transfer` scan) — same contract address on every EVM chain | NFT-based vesting plans. Migrated to the event-driven indexer (`indexer/hedgey.ts`) on all chains incl. Arbitrum + Optimism (verified live in cache June 2026). Legacy seeder discovery uses paginated `tokenByIndex` + `ownerOf` multicalls (HEDGEY_PAGE_SIZE=100). |
| UNCX (TokenVesting) | `uncx` | ETH, BSC, Polygon, Base, Sepolia | The Graph subgraph | Token locker v3 |
| UNCX (VestingManager) | `uncx-vm` | ETH only | `eth_getLogs` event scan via shared multi-RPC pool | Hidden in UI; merged with `uncx`. BSC/Base/Polygon dropped Apr 29 2026 — dRPC free tier no longer serves eth_getLogs there. Re-add if/when paid RPC env vars set. |
| Unvest | `unvest` | ETH, BSC, Polygon, Base | The Graph subgraph | Step/milestone vesting |
| Team Finance | `team-finance` | ETH, BSC, Polygon, Base, Sepolia | Squid GraphQL (different stack than The Graph) | **PAUSED — `disabled: true` (May 2026).** **June 2026:** all user-facing mentions removed pre-launch (no legal agreement yet) AND the cache + TVL rows were **purged** (815 + 4 rows deleted). The `disabled` gate stops the seeder from rebuilding them, and `dbcache` (`readFromCache`/`readAllStreamsForWallets`) now filters out any disabled-protocol row defensively. Adapter/walker/ingestor code is intact — re-enable is a single `disabled: false` flip + a deep-seed once legal lands. Do NOT add Team Finance to any user-facing surface (UI/blog/docs/manifest) until then. See "Pausing an integration" subsection below. |
| Superfluid | `superfluid` | ETH, BSC, Polygon, Base | Superfluid hosted subgraph (no GRAPH_API_KEY) | Cliff + linear streaming; endpoint: `https://subgraph-endpoints.superfluid.dev/{chain}/vesting-scheduler` |
| PinkSale (PinkLock V2) | `pinksale` | ETH, BSC, Polygon, Base | Direct contract reads via viem (no subgraph) | TGE + cycle-based schedule. Adapter pages `getUserNormalLockAtIndex` in batches of 50 to dodge free-RPC 100KB response cap (Polygon-shaped bug). PINKSALE_CONTRACT_ADDRESSES is the single-source-of-truth map in protocol-constants.ts — do NOT add per-file copies. |
| Streamflow | `streamflow` | Solana | @streamflow/stream SDK | Per-user fetches throttled via `mapBounded` (concurrency 4, 100ms inter-batch delay) to stay under Helius free CU/s. AlignedContract variant skipped. Gated behind `SOLANA_ENABLED=true`. |
| Jupiter Lock | `jupiter-lock` | Solana | Solana `getProgramAccounts` + dataSize=296 filter | Solana's default token locker (used by JUP team allocations). Same `mapBounded` throttle as Streamflow. Helius is the only free Solana RPC that supports `getProgramAccounts`. |
| LlamaPay | `llamapay` | ETH, Optimism (per-wallet); DefiLlama TVL covers more | Real per-wallet adapter (`adapters/llamapay.ts` + `tvl-walker/llamapay.ts`); DefiLlama passthrough for TVL | **Real adapter shipped** — tracks per-wallet streams on ETH + Optimism (~637 streams indexed). BSC/Polygon/Arbitrum/Base per-wallet dropped May 2026 (LlamaPay's subgraphs there became unreliable); re-add when they redeploy. Continuous per-second streaming (payroll); claimable = accrued − withdrawn. |

### Adding a new adapter

> ⚠️ **ARCHITECTURAL RULE — read before adding any new protocol:**
>
> **Every new EVM protocol MUST have an event-driven indexer. It must NEVER be added only to `SEED_JOBS`.**
>
> The batch seeder (`seed-cache` cron) runs on Vercel with a hard 300s ceiling. Every new protocol added to `SEED_JOBS` makes the timeout problem worse. The seeder is being migrated away from, not grown. New EVM protocols go event-driven from day one — write the indexer first, then the adapter. Non-EVM protocols (Solana) are the only exception; they stay in `SEED_JOBS` because Solana has no EVM-style event logs.
>
> See the "Event-driven indexer" section below for the full migration strategy and adding-a-new-indexer steps.

Create `src/lib/vesting/adapters/{protocol}.ts` — must export a `VestingAdapter` object with `id`, `name`, `supportedChainIds`, and `fetch(wallets, chainId)`. Register it in `adapters/index.ts`.

**Subgraph-based adapters** (most protocols): use `resolveSubgraphUrl()` from `graph.ts` with the GRAPH_API_KEY.
**Superfluid exception**: uses its own hosted endpoints — no GRAPH_API_KEY, endpoint format: `https://subgraph-endpoints.superfluid.dev/{chain}/vesting-scheduler`
**Contract-read adapters** (PinkSale): use viem `createPublicClient` + `http()` transport with RPC env vars. No subgraph.
**Non-EVM adapters** (Streamflow): use the protocol's own TS SDK (e.g. `@streamflow/stream`'s `SolanaStreamClient`) against a Solana RPC URL set in `SOLANA_RPC_URL`. For TVL display on the /protocols card, consider sourcing from DefiLlama (`src/lib/defillama.ts`) via the optional `externalTvl` field on `ProtocolMeta` rather than our own priced-cache pipeline. Feature-flag non-EVM adapters behind an env var (e.g. `SOLANA_ENABLED=true`) so EVM-only environments are unaffected.

### Pausing an integration (the `disabled` flag)

Some scenarios call for temporarily turning a protocol off without deleting it — upstream API outage, pending legal review, rebrand, low-volume protocol where the seeder cost isn't worth it for a while. The pattern is the `disabled?: boolean` field on `ProtocolMeta`. Worked example: Team Finance pause (May 2 2026, commit `e49b0a2`).

Setting `disabled: true`:
- `listProtocols()` filters it out by default — UI cards, /protocols index, search, sitemap, generateStaticParams all skip it.
- `getProtocol(slug)?.disabled` is the check used in `notFound()` guards on `/protocols/[slug]` + `/protocols/[slug]/unlocks`.
- `isAdapterEnabled(adapterId)` returns false → `seedAll()` filters out matching SEED_JOBS, `aggregateVestingStreams()` skips the adapter's `fetch` call, every entry in `ingestAllClaimsForUser` short-circuits to `inserted: 0`, the token explorer's combined fetch skips the call.
- `runAll()` in the TVL snapshot cron honours the filter even on manual `?protocol=X` reruns.
- Existing `vesting_streams_cache` rows are LEFT IN PLACE — re-enabling is a single `disabled: false` flip + a deep-seed.

To re-enable: flip `disabled` to `false`, then trigger a deep seed:
```bash
curl -X POST "https://www.vestream.io/api/cron/seed-cache?mode=deep" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Use this hatch sparingly — the `disabled` flag is for *pauses*, not *removals*. If you're permanently dropping a protocol, delete the entry entirely, drop its cache rows, and remove its adapter from `ADAPTER_REGISTRY`.

### `lastRefreshedAt` semantic shift (May 2 2026)

The `vesting_streams_cache.lastRefreshedAt` column used to mean "last time the seeder touched this row." After commit `df6a6b3` it means "last time the row's data actually moved." We added a `setWhere` clause to the ON CONFLICT branch in `writeToCache` so unchanged rows skip the UPDATE entirely — saved ~90% of write IO during typical incremental cron runs (driver of the May 2 Supabase Disk IO Budget warning).

**Diagnostic implication:** the `freshestSec` column on `/api/admin/cache-stats` is now a "is data still flowing?" signal, not "did the cron run?" signal. A row stuck at days-old freshest means *either* the protocol genuinely has no new data *or* the discovery/adapter pipeline is silently broken (the way Hedgey BSC/Polygon/Base was broken for 8.5 days pre-pagination-fix). Both are actionable. For "did the cron run?" check Vercel logs for the seeder summary line instead.

---

## TVL Methodology (internal — honest-TVL pass, April 2026)

**The rule:** every TVL number we show is vesting-specific. **Never** a protocol's total TVL if that number includes LP locks, launchpad escrows, streaming payments, or staking. If DefiLlama mixes categories, we don't use their headline — we compute the vesting slice ourselves.

### Source-of-truth table (keep up-to-date as protocols are added)

| Protocol | TVL source | Methodology tag | Why |
|---|---|---|---|
| Sablier | DefiLlama `chainTvls.vesting` ($513M) | `defillama-vesting` | DefiLlama already publishes a vesting-specific slice; no point reinventing |
| Hedgey | DefiLlama `chainTvls.vesting` ($142M) | `defillama-vesting` | Same |
| Streamflow | DefiLlama `chainTvls.vesting` ($762M) + category=vesting filter | `defillama-vesting` | Same — excludes Streamflow's "payments" product |
| UNCX + UNCX-VM | **Self-indexed** — subgraph walk of TokenVesting (V3) + event scan of VestingManager | `subgraph-walk-v1` / `contract-reads-v1` | DefiLlama's `uncx-network-v2+v3` is Token Locker category — includes LP locks |
| Team Finance | **Self-indexed** — Squid `vestingFactoryVestings` exhaustive walk | `subgraph-walk-v1` | DefiLlama's `team-finance` is Token Locker category — includes general token locks |
| PinkSale | **Self-indexed** — `LockAdded` event scan → `normalLocksForUser` multicall | `contract-reads-v1` | DefiLlama's `pinksale` is Launchpad category — includes active sales + LP locks |
| Superfluid | **Self-indexed** — hosted subgraph walk of `vestingSchedules` | `subgraph-walk-v1` | DefiLlama's `superfluid` total includes streaming payments + subscriptions |
| Unvest | **Self-indexed** — The Graph walk of `holderBalances` | `subgraph-walk-v1` | No DefiLlama entry |
| Jupiter Lock | **Self-indexed** — Solana `getProgramAccounts` + discriminator filter | `program-scan-v1` | No DefiLlama entry |

### Pipeline

```
/api/cron/tvl-snapshot  (daily 03:15 UTC)
  │
  ├─ for each protocol in protocol-constants.ts:
  │    ├─ externalTvl present?  → runDefiLlamaSnapshot(slug, category?)
  │    │                          → fetchDefiLlamaTvl → per-chain rows
  │    └─ externalTvl absent?   → runWalkerSnapshot(slug, chainIds)
  │                               → for each chain: runWalker(slug, chainId)
  │                                   ├─ WALKER_REGISTRY[slug] — enumerates ALL streams
  │                                   │  (no recipient filter, paginated/full-scan)
  │                                   ├─ aggregates by (chainId, tokenAddress)
  │                                   └─ returns TokenAggregate[] with lockedAmount
  │                               → priceAggregates(tokens)
  │                                   ├─ Pass A: DexScreener batch /latest/dex/tokens
  │                                   │   liquidity bands: ≥$10k high, $1k-$10k medium,
  │                                   │   $100-$1k thin, <$100 skipped
  │                                   └─ Pass B: CoinGecko /simple/token_price (medium)
  │                               → upsert one row per (protocol, chainId)
  │                                 into protocolTvlSnapshots
  │
/protocols page
  └─ unstable_cache(5min) → readAllSnapshots() → aggregate per-protocol →
     render TvlComparisonBar + ProtocolCard rows
```

### Adding a new protocol

If the new protocol's DefiLlama entry exposes `chainTvls.vesting`, set `externalTvl` in `protocol-constants.ts` — that's the whole integration.

Otherwise:
1. Write `src/lib/vesting/tvl-walker/{slug}.ts` — export `walk{Slug}(chainId)` that returns `WalkerResult`
2. Register it in `src/lib/vesting/tvl-walker/index.ts`
3. Omit `externalTvl` from the ProtocolMeta entry
4. The daily cron picks it up automatically; manual first run: `POST /api/cron/tvl-snapshot?protocol={slug}` with `Authorization: Bearer ${CRON_SECRET}`

### Cron + manual ops

Two daily crons:

| Cron | Schedule | Purpose |
|---|---|---|
| `/api/cron/seed-cache` | 03:00 UTC daily | Refreshes `vesting_streams_cache` — discover recipients per (adapter, chain), fetch streams, upsert. |
| `/api/cron/seed-cache?mode=deep` | 04:00 UTC Sundays | Weekly deep seed (DEEP_SEED_LIMIT=5000 vs 500 incremental). |
| `/api/cron/tvl-snapshot` | **4 grouped entries** 03:15–04:20 UTC daily | Writes `protocolTvlSnapshots` rows powering /protocols TVL numbers. Split by cost (2026-06-19) — the single 300s invocation couldn't finish all protocols, starving the slow ones (pinksale ~191s, jupiter-lock ~86s) and freezing their /status cells. Groups: `?protocol=pinksale` (3:15), `jupiter-lock` (3:50), `uncx,unvest,superfluid` (4:05), `sablier,sablier-flow,hedgey,streamflow,llamapay` (4:20). `?protocol=` accepts a comma list or single slug. Each snapshot row carries a heartbeat (`last_attempt_at`/`last_error`/`consecutive_failures`) so a silently-failing cell shows `⚠×N` on /status instead of just aging. |

#### Seed-cache group pattern

Single Vercel function gets 300s. PinkSale × 4 chains alone can exhaust that, leaving every later protocol stale. The `/api/cron/seed-cache` route requires an explicit `?group=` param and runs ONE group's protocols inline — no dispatcher / fan-out anymore. Call each group separately (the daily cron config in `vercel.json` does the same, one entry per group).

2026-05-20: the dispatcher mode (commit `4924c63`) was removed because Vercel's background-fetch throttling on the Hobby tier was causing only 2/3 child invocations to actually run. Calling groups explicitly is more predictable.

The groups (defined in `seeder.ts:groupFor` — SEVEN as of June 2026, the
old four-group list below caused a missed-hedgey seed on 2026-06-10):
- `heavy` — PinkSale × 4 chains. Slowest workload.
- `solana` — Solana protocols; `streamflow` also exists as its own group.
- `subgraphs` — UNCX, UNCX-VM, Unvest, plus paused adapters.
- `sablier` — Sablier alone (Envio Hasura can chew the full 300s on a deep seed).
- `hedgey` — Hedgey × 7 chains (ERC721 multicall discovery), split out of `subgraphs`.
- `superfluid` — Superfluid alone.
- Check `SEED_GROUPS` in seeder.ts for the authoritative list before any
  manual full refresh — loop over THAT, not this doc.

Calling the endpoint WITHOUT a `group=` param returns a `400` with the helpful list of acceptable values — don't be surprised by it, it's the route telling you to be explicit.

```bash
# One group, incremental mode (matches the daily cron)
curl -X POST "https://vestream.io/api/cron/seed-cache?group=heavy" \
  -H "Authorization: Bearer $CRON_SECRET"

# Full deep refresh — fire each group sequentially
for g in heavy solana subgraphs sablier; do
  echo "Seeding $g..."
  curl -X POST "https://vestream.io/api/cron/seed-cache?group=$g&mode=deep" \
    -H "Authorization: Bearer $CRON_SECRET"
  echo ""
done
# Total wall time ~15–20 min across all four groups.

# TVL snapshot — full refresh
curl -X POST https://vestream.io/api/cron/tvl-snapshot \
  -H "Authorization: Bearer $CRON_SECRET"

# TVL single-protocol rerun (use for debugging or staggered slow walkers)
curl -X POST "https://vestream.io/api/cron/tvl-snapshot?protocol=pinksale" \
  -H "Authorization: Bearer $CRON_SECRET"

# TVL background mode (returns 202 immediately, work continues 2-5 min)
curl -X POST "https://vestream.io/api/cron/tvl-snapshot?protocol=uncx-vm&background=true" \
  -H "Authorization: Bearer $CRON_SECRET"

# Cache freshness diagnostic — `freshestSec` per (protocol, chainId)
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.vestream.io/api/admin/cache-stats" | \
jq -r '.nowMs as $now | .cells[] | ((($now/1000) - .freshestSec) / 60 | floor) as $m | "\(.protocol)  chain \(.chainId)  streams=\(.streams)  fresh=\($m)m ago"' | sort
```

### Event-driven indexer (May 2026 onwards)

The seed-cache cron re-walks every recipient every N hours. The event-driven indexer is the replacement: each protocol gets a `*/30 * * * *` cron that scans a bounded block window of logs and writes only new/changed streams. Work is proportional to events since the last tick — fast, bounded, and scales to any number of chains without hitting the 300s ceiling.

**The migration strategy (2026):**
The batch seeder (`SEED_JOBS`) is being migrated away from for all EVM protocols. The goal is for the seeder to handle only Solana protocols (Streamflow, Jupiter Lock), which have no EVM-style event logs. Every EVM protocol that gets migrated reduces load on the seeder groups and eliminates one more potential group-split incident.

Migration order (easiest first): UNCX V3 → Unvest → Superfluid → Sablier → PinkSale.

**Migrated protocols** (indexer handles discovery; seeder kept in parallel during cutover):
- **UNCX-VM** — ETH / Base / BSC. Watches `VestingCreated` events; 5000-block window.
- **Hedgey** — ETH / BSC / Polygon / Base / Arbitrum / Optimism. Watches ERC721 `Transfer` events; 2000-block window. Covers both mints (new plans) and transfers (ownership changes).

Migrated protocols are kept in `SEED_JOBS` in parallel during cutover so cache backfill is preserved. Once a protocol's indexer-managed rows are verified equivalent for 7+ days AND claim events are also being indexed (so `withdrawnAmount` stays fresh), the corresponding entry can be removed from `seeder.ts:SEED_JOBS`.

**The claim-event requirement:** Before removing a protocol from `SEED_JOBS`, its indexer must also watch the protocol's claim/withdrawal event (not just the creation event). Otherwise `withdrawnAmount` goes stale between seeder runs. Each protocol's plan doc specifies which claim event to watch.

**Adding a new indexer:**
1. Implement the `Indexer` interface in `src/lib/vesting/indexer/<protocol>.ts` (see `uncx-vm.ts` for the reference shape — `genesisBlock`, `maxBlocksPerScan`, `reorgLag`, `scanWindow(client, from, to)`).
2. Register it in `src/lib/vesting/indexer/index.ts` (`INDEXERS` array).
3. Add a `vercel.json` cron entry per chain: `/api/cron/indexer?protocol=X&chainId=Y` on `*/30 * * * *`.
4. No route changes — the cron route is generic and dispatches via `findIndexer()`.

**State persistence:** the `indexer_state` table tracks `lastScannedBlock` / `lastConfirmedBlock` per `(protocol, chainId)`. Each tick resumes from `lastConfirmedBlock + 1`. A 12-block reorg lag re-scans the trailing window; `writeToCache`'s `setWhere` clause makes the upserts idempotent.

```bash
# Manual single-tick (forces an immediate scan for one protocol/chain)
curl -X POST "https://www.vestream.io/api/cron/indexer?protocol=uncx-vm&chainId=1" \
  -H "Authorization: Bearer $CRON_SECRET"

# Indexer health — per-(protocol, chainId) lastRunAt + lastError + RPC quarantine snapshot
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.vestream.io/api/admin/indexer-status" | jq

# One-line freshness scan
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://www.vestream.io/api/admin/indexer-status" | \
jq -r '.indexers[] | "\(.protocol)/\(.chainId) lastRun=\(.minutesSinceLastRun // "never")m  events=\(.lastEventCount // 0)  err=\(.lastError // "ok")"'

# Force a cold restart for ONE indexer (deletes its state row → next tick starts from genesisBlock)
# Use sparingly — backfills the full window again.
psql "$DATABASE_URL" -c "DELETE FROM indexer_state WHERE protocol='uncx-vm' AND chain_id=1;"
```

**RPC pool health:** the indexer runs on the shared multi-RPC pool with per-URL quarantine. 3 consecutive failures → 60s skip. `getRpcHealthSnapshot()` is surfaced via `/api/admin/indexer-status` so a single endpoint covers both indexer staleness AND provider quarantine state.

### Headline-confidence rules (defends against dust pricing)

The `tvlUsd` column in `protocolTvlSnapshots` is the **headline** TVL the
/protocols page surfaces. Two rules tighten what counts:

1. **THIN band excluded from headline.** Tokens with $100–$1k DEX liquidity
   (the `low` confidence band) are tracked in the `tvlLow` column for
   transparency but never feed `tvlUsd`. That band is dust — you can't sell
   meaningful size at that depth.
2. **Per-token ceiling: $200M.** A single token contributing > $200M must
   have HIGH-confidence pricing (≥$10k DEX liquidity) to count toward the
   headline. Medium-confidence single-token contributions over the ceiling
   get reclassified down to `tvlLow`. This defends against the failure mode
   where a thin-pair memecoin locked in trillion-unit quantities multiplies
   to a fake $5B+ headline (this exact pattern bit Team Finance pre-fix).

Both rules are implemented in `src/lib/vesting/tvl-snapshot.ts` →
`runWalkerSnapshot`. DefiLlama-passthrough rows are unaffected (they don't
go through token-level pricing — DefiLlama already curates).

### Pitfalls / things to audit before changing

- **Never drop the `chainTvls.vesting` check** in `src/lib/defillama.ts` — if DefiLlama stops exposing a vesting slice, we fall back to their `tvl` which WILL include non-vesting categories for Sablier/Hedgey/Streamflow. A silent accuracy regression. Alerting opportunity.
- **Walker correctness = CORE product integrity.** Every walker's locked-amount math must match the protocol's on-chain vesting semantics. Unit tests per walker are the single most valuable thing we can add.
- **Confidence bands** (`LIQUIDITY_HIGH=10_000`, `LIQUIDITY_MEDIUM=1_000`, `LIQUIDITY_FLOOR_USD=100`) live in `src/lib/vesting/tvl.ts`. The `SINGLE_TOKEN_HIGH_CONF_CEILING=200_000_000` ceiling lives in `src/lib/vesting/tvl-snapshot.ts`. If these change, the change applies to both the live `/protocols` render and the snapshot cron — by design (single source of truth for pricing).
- **snapshot table `methodology` column** — any new methodology gets a versioned tag (`-v2`, `-v3`) so we can migrate without nuking old rows.

---

## MCP Package (`mcp/`)

The `@vestream/mcp` npm package is a separate TypeScript project.

```bash
cd /Users/howardpearce/vestr/mcp
npm run build         # compiles TypeScript → dist/
npm publish --access public
```

### Three MCP tools
| Tool | Required params | Optional params |
|---|---|---|
| `get_wallet_vestings` | `address` | `protocol`, `chain`, `active_only` |
| `get_upcoming_unlocks` | `address` | `days` (default 30, max 365), `protocol` |
| `get_stream` | `stream_id` | — |

### Quick-start config (for documentation/marketing)
```json
{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": { "VESTREAM_API_KEY": "vstr_live_..." }
    }
  }
}
```

---

## Pricing Tiers

Prices are **live and shown publicly** on `/pricing` and the homepage
pricing section. All paid signups happen through the App Store / Play
Store IAP via RevenueCat — there is no web checkout. The "Get the app →"
CTAs scroll to `#download` on the homepage where iOS + Android badges
sit side by side.

| Tier | Price | Key features |
|---|---|---|
| Free | $0                                | Public `/find-vestings` search, 3 wallets, 10 push alerts / month (resets on the 1st) |
| Pro  | $9.99/mo *or* $74.99/yr (saves 37%) | Mobile app + **web dashboard** (QR sign-in): 10 wallets, unlimited push + email alerts, Discover (Token Vesting Explorer), search any wallet, tax-ready CSV exports (Koinly / CoinTracker / TurboTax), vesting income statement, year-end PDF. |

**No free trial currently.** The 14-day free trial was removed from all
consumer pricing surfaces (2026-06) — do NOT reintroduce "14-day free trial"
copy on /pricing, the homepage, FAQ, or login. It will return later once
Stripe billing is wired up; the developer-side Stripe checkout
(`/api/billing/checkout`, `BillingPanel.tsx`) intentionally still carries
`trial_period_days` for that future rollout.

RevenueCat entitlement IDs to set in their dashboard:
- `pro` — entitled by either the $9.99/mo or $74.99/yr product

Legacy `mobile` entitlement (pre-May-2026 retired middle tier) is still
honoured server-side: `tierFromEntitlements()` in
`src/app/api/mobile/revenuecat-webhook/route.ts` maps **any** active
entitlement (`pro`, legacy `mobile`, legacy `fund`) to `tier="pro"` so
grandfathered subscribers keep full access until their natural renewal.

For larger usage (funds, teams needing > 10 wallets, REST API + MCP,
SSO, custom alert channels) — direct them to `team@vestream.io`. There
is no self-serve Enterprise tier at this stage; we'll add one once
demand justifies the operational overhead.

---

## Environment Variables

Required in `.env.local` (dev) and Vercel dashboard (production):

```
DATABASE_URL                  Postgres connection string (Supabase)
GRAPH_API_KEY                 The Graph hosted service API key
POLYGON_RPC_URL               Polygon RPC endpoint
ALCHEMY_RPC_URL_ETH           Alchemy ETH mainnet RPC
ALCHEMY_RPC_URL_BASE          Alchemy Base RPC
BSC_RPC_URL                   BNB Chain RPC endpoint
UPSTASH_REDIS_REST_URL        Upstash Redis (rate limiting)
UPSTASH_REDIS_REST_TOKEN      Upstash Redis token
RESEND_API_KEY                Resend email API key
RESEND_FROM_EMAIL             Sender address for OTP/notification emails
IRON_SESSION_SECRET           iron-session cookie encryption secret (32+ chars)
NEXT_PUBLIC_WALLETCONNECT_ID  WalletConnect project ID
ADMIN_PASSWORD                Admin panel password (plaintext, compared with timing-safe equal)
DEV_OTP                       (dev only — MOBILE OTP only after Phase 5) Fixed OTP code bypassing real email send for /api/mobile/auth/email. Web-side OTP routes were removed; web sign-in is QR pairing only.
REVIEWER_EMAIL                (production) Specific email address that App Store / Play Store reviewers use to sign in. Combined with REVIEWER_OTP, lets reviewers bypass the real email-OTP flow without ever receiving an email. Activates ONLY when both env vars are set AND the incoming request matches both exactly. Other users unaffected. See src/app/api/mobile/auth/email/route.ts.
REVIEWER_OTP                  (production) Fixed 6-digit code that pairs with REVIEWER_EMAIL. Never use 123456 (Apple flags as test data). Suggested format: 424242, 808080, 271828 — memorable but non-obvious.
LOOPS_API_KEY                 Loops (loops.so) API key for lifecycle emails. When set, /api/find-vestings/save-link (and future signup/wallet events) fire Loops events instead of the legacy Resend HTML emails. Missing key = automatic fallback to Resend. See src/lib/loops.ts for the email-channel responsibility split.
REVENUECAT_WEBHOOK_SECRET     Secret to validate RevenueCat webhook Authorization header
NEXT_PUBLIC_GA_ID             Google Analytics 4 Measurement ID (G-XXXXXXXXXX). Cookie-gated.
NEXT_PUBLIC_CLARITY_ID        Microsoft Clarity Project ID (10 chars). Cookie-gated.
GA_MEASUREMENT_ID             (optional) Same as NEXT_PUBLIC_GA_ID for server-side events
GA_API_SECRET                 GA4 Measurement Protocol API secret — server-only, used for
                              ad-blocker-proof events (subscription_started, etc).
                              Create in GA4 → Admin → Data Streams → Web → Measurement
                              Protocol API secrets.
```

> **Admin cookie note**: The `vestr_admin` cookie value is no longer `"1"` — it's a token derived from `ADMIN_PASSWORD`. Always log in via `/admin/login` to get a valid cookie.

---

## Analytics

Four-layer stack, each covering a different need:

| Layer | Purpose | Cookie consent | Quota |
|---|---|---|---|
| **Google Analytics 4** | Traffic sources, demographics, custom events | Yes (gated by `vestream-cookie-consent=all`) | Unlimited free |
| **Microsoft Clarity** | Heatmaps, session replay, rage clicks, dead clicks | Yes (same gate) | Unlimited free |
| **Vercel Analytics** | Server-side pageviews (ad-blocker-proof), Web Vitals | No (anonymised at edge) | 2,500/day on Hobby |
| **Server-side GA4 (Measurement Protocol)** | Subscription events from Stripe webhook, fired even if client has ad blocker | N/A (server-side) | Unlimited free |

### Event taxonomy

All client events go through `track()` in `src/lib/analytics.ts`. Server events go through `trackServerEvent()` in `src/lib/server-analytics.ts`. Mobile mirrors the same taxonomy in `mobile/lib/analytics.ts` with `surface: "mobile"` auto-tagged.

Naming rules:
- Event names are `snake_case`, semantic, past-tense (`wallet_added`, not `add_wallet`)
- Param keys are `snake_case`
- Never include PII — no email, no wallet address. Use `address_type: "evm" | "solana" | "ens" | "symbol" | "freeform"` instead
- Prefer enums over free-text params so dashboards group cleanly

### Activation checklist (when you have GA4 + Clarity accounts)

1. Create GA4 property at https://analytics.google.com → Web data stream for vestream.io → copy `G-XXXXXXXXXX`
2. Create Clarity project at https://clarity.microsoft.com → copy 10-char Project ID
3. Set both env vars in Vercel (Production environment): `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_CLARITY_ID`
4. (Optional, for server-side events): GA4 → Admin → Data Streams → Web → Measurement Protocol API secrets → Create. Set `GA_API_SECRET` in Vercel.
5. Redeploy. Both scripts auto-load on next page view if cookie consent is granted.

### Where events fire

| Event | Source |
|---|---|
| `page_view` | Auto via GA `gtag('config')` on every route change |
| `search_performed` | dashboard/explorer SearchInput |
| `wallet_scan_started` / `_completed` | dashboard/discover, find-vestings |
| `wallet_added` / `_removed` | settings, dashboard, WalletInput |
| `signup_started` / `signup_completed` / `login_completed` | AuthCard |
| `early_access_requested` | WaitlistForm |
| `notification_prefs_saved` | settings page |
| `upgrade_clicked` | UpsellModal + every Pro CTA |
| `subscription_started` / `_canceled` | Stripe webhook (server-side) |
| `api_access_requested` | ApiAccessForm |
| `cta_clicked` | Generic catch-all |

### Privacy posture

- All client-side analytics are gated behind the cookie banner. Until the user clicks "Accept all" the `track()` helper is a silent no-op.
- Vercel Analytics doesn't drop a cookie and aggregates at the edge — it runs without consent because there's nothing to consent to.
- Server-side events use a hashed user id (sha256 of `userId + GA_API_SECRET`) so the raw user id never leaves our infrastructure.
- Clarity auto-redacts every form field. Mark any sensitive non-form element with `data-clarity-mask="true"` to opt it out of session replay.

---

## Shared lib helpers (worth knowing exist)

These centralise policy decisions so every endpoint stays consistent. New code that handles emails, webhooks, or wallet validation should reuse these instead of rolling its own.

- **`lib/email-validation.ts`** — `EMAIL_RE`, `normaliseEmail(raw)`, `isDisposableEmail(email)`. Used by every public email-capture endpoint. Strips trailing dot, lowercases, length-caps, rejects disposable-mailbox domains (`mailinator`, `10minutemail`, etc — 17-domain blocklist).
- **`lib/webhook-dedup.ts`** — `claimWebhookEvent(eventId, source)` for at-least-once webhook delivery protection. Used by RevenueCat + Stripe handlers. Returns true on first delivery, false on replay. Fail-open on DB outage by design (better to risk a duplicate than miss a billing event).
- **`lib/cors.ts`** — `checkCors(req)` + `withCorsHeaders(res, origin)`. Allowed origins: `vestream.io`, `www.vestream.io`, plus `localhost:*` in dev. Wired into every unauthenticated public POST (waitlist, contact, feedback, find-vestings/save-link).
- **`lib/auth/timing-safe-bearer.ts`** — `bearerEquals(header, secret)` for cron / webhook static-secret comparisons. Built on `crypto.timingSafeEqual`, length-mismatch short-circuits.
- **`lib/auth/desktop-pair.ts`** — Redis-backed QR pairing flow (5-minute TTL, GETDEL on consume). Used by `/api/auth/desktop-pair/{init,poll}` + `/api/mobile/desktop-pair/confirm`.
- **`lib/address-validation.ts`** — `isValidWalletAddress(addr)` + `normaliseAddress(addr)`. Handles both EVM hex and Solana base58.

## Security posture

[`SECURITY.md`](./SECURITY.md) at the repo root documents the reporting channel and the three accepted upstream risks:
1. `bigint-buffer` chain — abandoned npm package transitively pulled by the Solana SDK. CVSS DoS-only (C:N/I:N/A:H), no RCE. Mitigated by try/catch wrappers in every Solana adapter entry point.
2. CSP `unsafe-inline` / `unsafe-eval` — Next.js + Tailwind structural requirement. Mitigated by zero user-HTML render paths + tight `X-Frame-Options: DENY` + `frame-ancestors 'none'`.
3. RevenueCat webhook timestamp signing — RC doesn't sign with a timestamp, so pure replay protection is via `webhook_event_dedup` instead.

All other audit findings closed. See the `hardening:` commit prefix on `main` for the remediation history.

---

## Build & Deploy

### Local dev
```bash
cd /Users/howardpearce/vestr   # always confirm working directory first
npm run dev                     # localhost:3000
npm run build                   # production build — catches TS errors
```

### Preview server (for Claude Code)
The launch config is at `.claude/launch.json`. Start with:
```
preview_start("vestr-dev")   # server ID: changes each session — use preview_list if needed
```

### Production
Pushes to `main` auto-deploy via Vercel GitHub integration. No manual deploy step needed.

#### ⚠️ Vercel project: ONE only — `vestream`
The production Vercel project is named **`vestream`** (lowercase). It owns the `vestream.io` and `www.vestream.io` custom domains. **Never create a second project for this repo.**

In April 2026 a session accidentally created a duplicate project (`vestr`) by answering "No" to `npx vercel link`'s "Link to existing project?" prompt. The duplicate ran in parallel for days, double-building every commit. It has since been deleted. To prevent recurrence:

**Linking the local repo (one-time, do this on a fresh clone):**
```bash
cd /Users/howardpearce/vestr
npx vercel link
# Set up "~/vestr"?         → Y
# Which scope?              → Howard's projects
# Link to existing project? → Y          ← critical: do NOT answer N
# Project name?             → vestream    ← lowercase, exact
```
A correct link writes `.vercel/project.json` with `"projectName":"vestream"`. The directory is gitignored, so it stays per-machine.

**After that, both deploy paths are safe:**
- `git push origin main` — GitHub webhook fires the Vercel build (default, preferred)
- `npx vercel --prod` — pushes the local working tree to the linked `vestream` project (escape hatch for when the GitHub webhook is flaky)

**Never:**
- ❌ Answer "No" to "Link to existing project?". That creates a NEW project.
- ❌ Run `npx vercel link` if `.vercel/project.json` already exists with `vestream` — already linked.
- ❌ Type any project name other than `vestream` (lowercase). Vercel will offer to create whatever you type.

**Sanity check:**
```bash
cat .vercel/project.json
# Must show "projectName":"vestream"
# If it shows anything else: rm -rf .vercel and re-link.
```

**If a Vercel build problem persists**: prefer dashboard fixes (Settings → Git → Disconnect / Reconnect on the `vestream` project) over CLI workarounds. The CLI is the second line of defence, not the first.

### DB migrations
```bash
npm run db:generate    # generate migration from schema changes
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly (dev only — skips migration files)
npm run db:studio      # open Drizzle Studio GUI
```

> ✅ **The drizzle migration chain was re-baselined 2026-06-16** — `db:generate`
> works again. The old chain was unrepairable (meta snapshots 0005–0007 +
> 0012–0018 missing, and 0009–0011 collided on the same parent), so it was
> reset to a single baseline (`drizzle/0000_amused_peter_quill.sql`) generated
> from `schema.ts`. The pre-reset migrations + broken meta are archived under
> `drizzle/_archive_2026-06-16/` (git history too). `db:generate` now produces
> clean incremental diffs from that baseline.
>
> **Prod is still shipped via raw idempotent SQL** — this has NOT changed. We
> do NOT run `db:migrate` against prod (the Supabase pooler + a baseline that
> recreates existing tables would conflict); the re-baseline only fixes the
> *authoring* workflow. Continue applying schema changes to prod with
> idempotent DDL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF
> NOT EXISTS`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`) via
> `node scripts/apply-migration.mjs drizzle/<file>.sql`, with `schema.ts` as the
> source of truth for the TS types. The hand-rolled raw-SQL files
> (`drizzle/0019_*.sql` … `0031_*.sql`) are those deploy artifacts — they live
> in `drizzle/` but are NOT in drizzle's journal, so `db:generate` ignores them.
> Match column names/types/defaults to `schema.ts` exactly when writing DDL.

### npm publish checklist
Before publishing `@vestream/mcp`:
1. `npm whoami` — confirm correct account
2. `npm token list` — confirm write access
3. Check `package.json` version is bumped
4. `npm publish --dry-run` first
5. `npm publish --access public`

---

## Verification Workflow (DO NOT SKIP)

After every code edit while the preview server is running:
1. Take a `preview_screenshot` to verify the change renders correctly
2. Check for console errors with `preview_console_logs` if anything looks wrong
3. Only commit after visual confirmation

For responsive changes: check both mobile (375px) and desktop (1440px) viewports.

```
preview_resize("vestr-dev", preset="mobile")    # 375×812
preview_resize("vestr-dev", preset="desktop")   # or width=1440, height=900
```

---

## Pre-flight checks before infra / config changes

These four checks are MANDATORY before proposing any change to env vars,
fallback URLs, framework directives (`force-dynamic`, `revalidate`, etc),
retry policies, or cache headers. Skipping them has cost real production
time multiple times. See e.g. commit `ef21b41` (re-introduced a known-bad
publicnode fallback that `bec6fc9` had explicitly warned against).

1. **`git log -S "<identifier>"` for the thing you're touching.** Search
   commits for the function name, env var name, URL, or directive
   you're about to add/change. If a prior commit removed/added the same
   thing, READ that commit before you act. Five minutes here saves
   twenty minutes of regression.

2. **Look for a proven-good neighbour.** Before inventing a new
   fallback / config / pattern, check whether another file in the same
   feature area solves the same problem. Walker ↔ adapter ↔ seeder are
   sibling concerns; if one has a fallback chain, the others should
   match unless there's a documented reason to diverge.

3. **`grep -E "DO NOT|WARNING|IMPORTANT"` across the repo.** These
   comments encode prior pain. Treat them as hard constraints, not
   stylistic preferences. Specific landmines previously documented:
   - publicnode endpoints PRUNE historical logs aggressively (BSC ~17
     days, Polygon ~10 days). DO NOT use as fallback for event-scan
     workloads. Use **dRPC** (`*.drpc.org`) instead — proven in
     `src/lib/vesting/tvl-walker/pinksale.ts`. The shared multi-RPC
     pool (`src/lib/vesting/rpc.ts`) tags publicnode entries with
     `excludeForLogs: true`; pass `{ forLogs: true }` to `getRpcUrl()`
     for any caller doing eth_getLogs.
   - AbortSignal in fetch's `init` disables Next.js's data cache. Use
     `Promise.race` for fetch timeouts instead. See `src/lib/fetch-with-retry.ts`.
   - **ISR / cache-header rules on Next 16.3.0-canary.19** (rewritten
     2026-06-12 after the QUIC-timeout incident; supersedes the old
     "use middleware to set Cache-Control" guidance, which was WRONG):
       1. **Middleware-set Cache-Control does NOT stick on dynamically
          rendered routes** — the framework's `private, no-cache,
          no-store` wins (verified live). On static/ISR routes middleware
          headers DO apply, but there they can only weaken the stronger
          native ISR header. Never use middleware for cache headers.
       2. **`await params` without `generateStaticParams` is a
          request-time API** — the route silently renders per-request and
          any `revalidate` export is dead code (this is why /token pages
          served no-store for weeks). Every dynamic-param marketing page
          MUST export `generateStaticParams` (≥ 1 sample is enough; the
          rest are on-demand ISR). Same for `searchParams` — reading it
          at all makes the route dynamic; use path segments instead
          (see /protocols/[slug]/unlocks/[chain]).
       3. **The Upstash SDK (`@upstash/redis`) hardcodes
          `cache: "no-store"` on every fetch**, which hard-errors inside
          ISR routes. On render paths: reads go through a plain REST
          `fetch` with `next.revalidate` (see `page-data-fallback.ts`),
          pricing passes `{ redis: false }` (`quick-prices.ts`), and
          writes run inside `after()` from `next/server`.
       4. **`unstable_cache` JSON-serialises its payload** — a BigInt
          anywhere in the result makes every cache write reject silently
          (unhandledRejection) and the wrapped query re-runs per request.
          Stringify BigInts before returning.
       5. To verify a route is REALLY cached, don't trust timings or
          headers alone: `curl` it twice and byte-diff — re-renders leak
          through time-relative strings ("in 1 h 38 min").
   - **`BSC_RPC_URL` / `POLYGON_RPC_URL` / `ALCHEMY_RPC_URL_BASE` are
     INTENTIONALLY OPTIONAL.** The user reviewed and rejected adding
     these as required env vars in `ef21b41` (Apr 29, 07:00). The
     canonical fallback is dRPC (`bsc.drpc.org`, `polygon.drpc.org`,
     `base.drpc.org`) wired into both `src/lib/vesting/seeder.ts:getRpcUrl`
     and `src/lib/vesting/tvl-walker/pinksale.ts:getRpcUrl`. If discovery
     is returning zero recipients on those chains, **the fix is NOT to
     tell the user to add env vars** — it's to debug why the dRPC path
     is failing (rate limit, scan window too narrow, contract
     misconfigured, etc). I have already made this exact mistake THREE
     times (`6a09a13` → `ef21b41` → 2026-04-29 session). Search
     `git log -S 'BSC_RPC_URL'` before EVER recommending env vars
     for these.
   - **Free-tier EVM RPCs cap response size around 100KB on Polygon
     and similar on BSC/Base.** A multicall of 200+ calls (or any
     single eth_call returning > ~100KB JSON) silently fails with a
     viem error, the catch returns [], and the discovery/adapter run
     yields zero. PinkSale Polygon (`a65044e`) and Hedgey BSC/Polygon/Base
     (`288c25c`, 8.5-day silent breakage) were both this shape. **Always
     paginate large multicalls** in chunks of 50–100 — see PinkSale
     adapter PAGE=50 and `discoverHedgeyRecipients` HEDGEY_PAGE_SIZE=100.
     Per-page failures are logged but don't abort, so partial coverage
     beats none. If you find yourself adding a 500+ call multicall,
     STOP — paginate first.
   - **DB-touching helpers must short-circuit during `next build`.**
     Vercel production builds occasionally lose the Supabase pooler
     mid-build (XX000 FATAL); subsequent queries CONNECTION_CLOSED
     and individual static pages exhaust their 60s × 3 retry budget,
     killing the whole build. The fix shipped in `805f74d` adds
     `if (process.env.NEXT_PHASE === "phase-production-build") return EMPTY_X`
     at the top of every helper that hits Postgres. New DB query
     helpers MUST follow this pattern — see `getProtocolStats`,
     `getUnlocksInWindow`, `getLatestUnlock`, etc. ISR fills with real
     data on the first runtime request after deploy.
   - **`writeToCache` only updates rows whose data actually changed**
     (commit `df6a6b3`, `setWhere` clause). `lastRefreshedAt` therefore
     means "last time data moved" not "last time the seeder ran" — see
     the "lastRefreshedAt semantic shift" subsection above. Don't
     "fix" this by removing the `setWhere` thinking the timestamp is
     broken; the change is intentional and saved ~90% of write IO.

4. **When the user says "we removed/decided/changed X" — STOP.** Search
   git, read the commit message, then respond. Don't push back without
   reading the history they're referring to. User domain knowledge
   beats my freshly-loaded context every time.

---

## Common Mistakes to Avoid

- **Never hardcode grid columns without mobile fallback** — `grid-cols-3` must be `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- **Never use `px-8` without `md:` prefix on section padding** — always `px-4 md:px-8`
- **Never use real token names in mockups** — use NOVA, FLUX, VEST, KLAR
- **Prices are now live** — do not replace them with "Coming soon" badges
- **Never alter the logo SVG files** without explicit instruction
- **Never add nav links to SiteNav** without explicit instruction — Resources etc. belong in page footers; Pricing was added 2026-06-01
- **Never use inline SVG for the Vestream logo in the nav** — use `<img src="/logo.svg">` or `<img src="/logo-dark.svg">`
- **Never commit without verifying in preview first**
- **Long `<code>` strings in cards** — add `break-all` or `overflow-x-auto` on the parent `<pre>` to prevent overflow on mobile
- **Section backgrounds on dev/AI pages** — use theme-matched card colours, not the page background colour of the other theme
- **Cliff vesting math — nothing is claimable before the cliff.** `computeLinearVesting` (in `@vestream/shared`) takes an optional `cliffTime` and returns 0 claimable / all-locked while `now < cliff`; the Hedgey adapter has its own `hedgeyRedeemable()` gate. A claimable/vested calc that accrues straight-line from `startTime` and ignores the cliff is a bug (we shipped tokens as "claimable" pre-cliff in June 2026). Any new claimable/vested code MUST gate on the cliff, and the emission charts (web `EmissionChart`, mobile `LinearVestingCurve`) must draw flat-until-cliff → jump → linear.
- **The vestings read path is cache-first.** `/api/vesting` + `/api/mobile/vestings` serve cached streams INSTANTLY and revalidate stale wallets in the background (`void aggregate…then(writeToCache)`) — never re-introduce a blocking live scan on the normal load path. Only a first-ever load with zero cache, or an explicit `?refresh=1`, may block.
- **Don't surface a `disabled` protocol.** `listProtocols()` excludes disabled protocols by default, the seeder skips them, and `dbcache` filters their rows out of reads. Team Finance is disabled + purged — keep it (and any future paused protocol) off every user-facing surface.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
