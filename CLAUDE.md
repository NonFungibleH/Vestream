# Vestream — Claude Code Reference

## Stack
- **Framework**: Next.js 16 App Router (TypeScript, React 19, Server Components)
- **Styling**: Tailwind CSS v4 + inline `style={{}}` for one-off values (no separate CSS files)
- **Database**: Postgres via Drizzle ORM + Supabase hosting
- **Auth (web)**: Email OTP via `iron-session` cookies — user enters email, receives OTP, session cookie set
- **Auth (mobile)**: Bearer token via `Authorization: Bearer <token>` header — issued at login
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
    ui/                   shadcn primitives (button, card, badge, input, etc.)

  lib/
    vesting/
      types.ts            VestingStream interface + math helpers (source of truth)
      adapters/           One file per protocol — sablier, hedgey, uncx, uncx-vm,
                          unvest, team-finance, superfluid, pinksale. Each exports fetchStreams(address, chainId)
      aggregate.ts        Calls all adapters in parallel, dedupes, sorts
      normalize.ts        Cross-protocol field normalisation
      dbcache.ts          Read/write to vestingStreamsCache table
      explorer.ts         Token-level explorer queries (all holders of a token)
      graph.ts            The Graph API helpers
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
  { label: "Portfolio",   href: "/"          },
  { label: "Developers",  href: "/developer" },
  { label: "AI Agents",   href: "/ai"        },
];
```

- **Do not add** Resources, Pricing, or other links to the top nav — they live in page footers
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
`/early-access`, `/login`, `/privacy`, `/terms`, `/explore/[chainId]/[tokenAddress]`

### Gated routes (middleware in `src/middleware.ts`)

| Route | Cookie required | Redirect if missing |
|---|---|---|
| `/dashboard/*` | `vestr_early_access` | `/early-access` |
| `/api-docs` | `vestr_early_access` OR `vestr_api_access` | `/developer/portal` |
| `/developer/account` | `vestr_api_access` | `/developer/portal` |
| `/admin/*` | `vestr_admin` | `/admin/login` |

### Setting cookies (for local dev/testing)
```js
// In browser console on localhost:3000
document.cookie = "vestr_early_access=1; path=/";
document.cookie = "vestr_api_access=1; path=/";
// vestr_admin is now a derived token — set it via the login form at /admin/login
```

### OTP in development
Set `DEV_OTP=123456` in `.env.local` to bypass real email sending — any email will accept that code.
The OTP value is **never** logged in production.

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
| `/api/auth/nonce` | SIWE nonce generation (legacy, still present) |
| `/api/auth/verify` | SIWE signature verification (legacy, still present) |
| `/api/auth/logout` | Clear session |
| `/api/auth/email` | Email OTP: send code (step 1) |
| `/api/auth/verify-otp` | Email OTP: verify code + set session (step 2) |
| `/api/waitlist` | Waitlist email signup |
| `/api/api-access` | Submit developer API access request |
| `/api/contact` | Contact form submission |
| `/api/feedback` | Beta feedback submission |
| `/api/notifications/preferences` | Save notification settings |
| `/api/cron/notify` | Cron: send unlock notification emails |
| `/api/admin/login` | Admin login — rate-limited, timing-safe, sets derived cookie |
| `/api/admin/approve` | Admin: approve API access request |
| `/api/admin/revoke` | Admin: revoke an API key |
| `/api/developer/unlock` | Set vestr_api_access cookie |

### Mobile API (`/api/mobile/`)
| Route | Purpose |
|---|---|
| `/api/mobile/auth/email` | Mobile OTP: send code |
| `/api/mobile/auth/verify-otp` | Mobile OTP: verify + return bearer token |
| `/api/mobile/me` | Current user profile + tier |
| `/api/mobile/wallets` | CRUD for tracked wallets (mobile) — enforces same free-plan limits as web |
| `/api/mobile/notifications` | Save mobile notification preferences |
| `/api/mobile/revenuecat-webhook` | RevenueCat subscription events → update user tier in DB |

---

## Database Schema (Drizzle + Postgres)

Tables in `src/lib/db/schema.ts`:

| Table | Purpose |
|---|---|
| `users` | Authenticated wallet users (address, tier, scan limits) |
| `wallets` | Tracked wallet addresses per user (with labels, chain/protocol filters) |
| `notificationPreferences` | Per-user email alert settings |
| `notificationsSent` | Dedup log — prevents re-sending the same alert |
| `apiKeys` | Developer API keys (stored as SHA-256 hash only, never plaintext) |
| `apiAccessRequests` | Submitted access request forms (reviewed manually) |
| `waitlist` | Email waitlist signups |
| `betaFeedback` | In-app feedback submissions |
| `vestingStreamsCache` | Persisted normalised VestingStream objects from subgraphs |

### API key format
`vstr_live_{32 random hex bytes}` — plaintext shown once on creation, never stored. Only SHA-256 hash + 12-char prefix kept in DB.

### User tiers
`"free"` | `"pro"` | `"fund"` — stored on `users.tier`. No trial period — users start on free.
The `"fund"` tier stays in the DB/webhook plumbing for existing subscribers but is
no longer self-serve. Enterprise customers go through the contact form.

| Tier | Wallets | Token discovery | Push alerts | Discover page |
|---|---|---|---|---|
| Free | 1 | Auto-scan across all chains + all 7 platforms | 3 lifetime credits | Blocked (redirect to `/pricing`) |
| Pro | 3 | Auto-scan | Unlimited | Full access |
| Fund / Enterprise | Unlimited | Auto-scan | Unlimited | Full access |

**Free plan enforcement** (both `/api/wallets` and `/api/mobile/wallets`):
- Enforced at the API layer purely by **wallet count** — all tiers can omit `chains`/`protocols`/`tokenAddress` for auto-scan.
- Free: hard limit of 1 wallet. Pro: 3. Fund: unlimited.
- Push alerts are metered by `users.pushAlertsSent` (lifetime counter).
  `checkAndConsumePushCredit(userId)` in `src/lib/db/queries.ts` is the single gate
  — it's called by the notification scheduler before `sendExpoPush`. Paid tiers
  are unmetered; free tier is capped at `FREE_PUSH_ALERT_LIMIT = 3`.

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
| Chain | ID |
|---|---|
| Ethereum | 1 |
| BNB Chain | 56 |
| Polygon | 137 |
| Base | 8453 |
| Sepolia (testnet) | 11155111 |
| Base Sepolia (testnet) | 84532 |

### Supported protocols
| Protocol | ID | Chains | Data source | Notes |
|---|---|---|---|---|
| Sablier | `sablier` | ETH, BSC, Polygon, Base, Sepolia | The Graph subgraph | Linear + tranched (LockupTranched) |
| Hedgey | `hedgey` | ETH, BSC, Polygon, Base | The Graph subgraph | NFT-based vesting plans |
| UNCX (TokenVesting) | `uncx` | ETH, BSC, Polygon, Base, Sepolia | The Graph subgraph | Token locker v3 |
| UNCX (VestingManager) | `uncx-vm` | ETH, BSC, Polygon, Base | The Graph subgraph | Hidden in UI; merged with `uncx` |
| Unvest | `unvest` | ETH, BSC, Polygon, Base | The Graph subgraph | Step/milestone vesting |
| Team Finance | `team-finance` | ETH, BSC, Polygon, Base | The Graph subgraph | Team token vesting |
| Superfluid | `superfluid` | ETH, BSC, Polygon, Base | Superfluid hosted subgraph (no GRAPH_API_KEY) | Cliff + linear streaming; endpoint: `https://subgraph-endpoints.superfluid.dev/{chain}/vesting-scheduler` |
| PinkSale (PinkLock V2) | `pinksale` | ETH, BSC, Polygon, Base | Direct contract reads via viem | TGE + cycle-based schedule; no subgraph |

### Adding a new adapter
Create `src/lib/vesting/adapters/{protocol}.ts` — must export a `VestingAdapter` object with `id`, `name`, `supportedChainIds`, and `fetch(wallets, chainId)`. Register it in `adapters/index.ts`.

**Subgraph-based adapters** (most protocols): use `resolveSubgraphUrl()` from `graph.ts` with the GRAPH_API_KEY.
**Superfluid exception**: uses its own hosted endpoints — no GRAPH_API_KEY, endpoint format: `https://subgraph-endpoints.superfluid.dev/{chain}/vesting-scheduler`
**Contract-read adapters** (PinkSale): use viem `createPublicClient` + `http()` transport with RPC env vars. No subgraph.

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

Prices are **live and shown publicly** on `/pricing`.

| Tier | Web price | In-app (iOS/Android) | Key feature |
|---|---|---|---|
| Free | $0 | $0 | 1 wallet (auto-scan), 3 lifetime push alerts |
| Pro | $7.99/mo · $63.99/yr | $9.99/mo · $79.99/yr | 3 wallets, unlimited push + email alerts, Discover page |
| Enterprise | Contact | — | Unlimited wallets, REST API + MCP, SSO, dedicated support |

In-app purchases use RevenueCat product IDs: `io.vestream.pro_monthly` ($9.99) and `io.vestream.pro_annual` ($79.99).
Web users who subscribe directly save ~20% vs in-app pricing.

Tier is updated in the DB by the RevenueCat webhook (`/api/mobile/revenuecat-webhook`) on purchase/renewal/expiry events.

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
DEV_OTP                       (dev only) Fixed OTP code bypassing real email send (e.g. "123456")
REVENUECAT_WEBHOOK_SECRET     Secret to validate RevenueCat webhook Authorization header
```

> **Admin cookie note**: The `vestr_admin` cookie value is no longer `"1"` — it's a token derived from `ADMIN_PASSWORD`. Always log in via `/admin/login` to get a valid cookie.

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

### DB migrations
```bash
npm run db:generate    # generate migration from schema changes
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly (dev only — skips migration files)
npm run db:studio      # open Drizzle Studio GUI
```

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

## Common Mistakes to Avoid

- **Never hardcode grid columns without mobile fallback** — `grid-cols-3` must be `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- **Never use `px-8` without `md:` prefix on section padding** — always `px-4 md:px-8`
- **Never use real token names in mockups** — use NOVA, FLUX, VEST, KLAR
- **Prices are now live** — do not replace them with "Coming soon" badges
- **Never alter the logo SVG files** without explicit instruction
- **Never add nav links to SiteNav** — Resources, Pricing etc. belong in page footers
- **Never use inline SVG for the Vestream logo in the nav** — use `<img src="/logo.svg">` or `<img src="/logo-dark.svg">`
- **Never commit without verifying in preview first**
- **Long `<code>` strings in cards** — add `break-all` or `overflow-x-auto` on the parent `<pre>` to prevent overflow on mobile
- **Section backgrounds on dev/AI pages** — use theme-matched card colours, not the page background colour of the other theme
