import type { NextConfig } from "next";

// ── HTTP Security Headers ────────────────────────────────────────────────────
// Applied to every response from the Next.js server.
// Cloudflare adds HSTS on top of this at the edge once DNS propagates.
const securityHeaders = [
  // Prevent the site from being embedded in iframes (clickjacking)
  {
    key:   "X-Frame-Options",
    value: "DENY",
  },
  // Stop browsers from guessing content types (MIME sniffing attacks)
  {
    key:   "X-Content-Type-Options",
    value: "nosniff",
  },
  // Force HTTPS for 2 years, include subdomains
  {
    key:   "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Only send origin (no path) as referrer to external sites
  {
    key:   "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features the app doesn't use
  {
    key:   "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()",
  },
  // Allow DNS prefetching for performance
  {
    key:   "X-DNS-Prefetch-Control",
    value: "on",
  },
  // Content Security Policy
  // 'unsafe-inline' and 'unsafe-eval' are required by Next.js App Router / Tailwind.
  // frame-ancestors 'none' duplicates X-Frame-Options for modern browsers.
  {
    key:   "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      // API calls: own origin + The Graph gateway + RPC nodes + WalletConnect.
      // Both .com and .org WalletConnect/Web3Modal hosts are needed: RainbowKit's
      // bundled Web3Modal calls api.web3modal.org (project limits) and
      // pulse.walletconnect.org (telemetry). Without these, the modal fails to
      // initialise and wallet connectors (incl. MetaMask) never get a chance to
      // open — which presents as "MetaMask popup never fires". GA: googletagmanager
      // serves gtag.js; google-analytics.com is the collection endpoint.
      // viem default RPC fallbacks for the EVM chains in our wagmi config.
      // Without these, wagmi's wallet-state reads fail with 32+ console
      // CSP errors per page — fired in a tight loop because viem retries
      // each chain on every reconnect attempt. Endpoints added May 4 2026:
      //   - eth.merkle.io / cloudflare-eth.com / ethereum.publicnode.com (mainnet)
      //   - bsc-rpc.publicnode.com / bsc.publicnode.com (covered by *.publicnode.com)
      //   - polygon-rpc.com (Polygon's official public RPC)
      //   - mainnet.base.org (Base official RPC)
      //   - arbitrum-one.publicnode.com (covered)
      //   - optimism.publicnode.com (covered)
      // dRPC is included for chains where we configure it explicitly server-
      // side — keeps client + server allowlists symmetric.
      "connect-src 'self' https://gateway.thegraph.com https://*.publicnode.com https://*.alchemy.com https://eth.merkle.io https://cloudflare-eth.com https://polygon-rpc.com https://*.base.org https://*.drpc.org https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org https://*.web3modal.org https://*.supabase.co https://vestream.io https://*.google-analytics.com https://*.googletagmanager.com",
      // Web3Modal occasionally embeds verify.walletconnect.org in an iframe for
      // origin verification on certain wallet flows.
      "frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
];

// ── Cache-Control for marketing-data pages ──────────────────────────────────
//
// These pages are `force-dynamic` (DB-dependent at runtime) but the data they
// surface — protocol stats, TVL, upcoming unlocks, token info — only
// changes on a minute-or-slower scale. Without explicit Cache-Control,
// `force-dynamic` returns `private, no-cache, no-store, must-revalidate`,
// which means EVERY request hits a cold lambda + the slow data fetch path.
// First user after data-cache eviction sees a 6+ second render.
//
// The fix: tell Vercel's edge to cache the rendered HTML aggressively with
// stale-while-revalidate. Subsequent visitors within the SWR window get
// the cached HTML in <100ms while the edge fetches a fresh version in the
// background. The user-perceived render time is always sub-second, even
// when the underlying data fetch is slow.
//
// Cache directive breakdown:
//   - `public`: edge can cache + share across users (these are anonymous
//     marketing pages — no per-user content)
//   - `s-maxage=60`: serve from cache for 60s without revalidation
//   - `stale-while-revalidate=300`: for the next 5 minutes, serve stale
//     while async-revalidating in background
//   - Total time the user sees a fast response: 6 minutes after first
//     render, then the background re-fetch completes and the cycle continues
//
// Why not on every page: applying SWR globally would cache personalised
// content (e.g. /dashboard, /settings) which is per-user and must stay
// fresh. We keep this scoped to marketing-data routes.
const dataCacheHeader = {
  key:   "Cache-Control",
  value: "public, s-maxage=60, stale-while-revalidate=300",
};

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Per-protocol marketing pages — slowest data path (DexScreener
      // pricing on cold renders). SWR caching here is the biggest single
      // win for user-perceived performance.
      {
        source: "/protocols/:slug",
        headers: [dataCacheHeader],
      },
      // Per-protocol unlocks calendar — same data shape, same caching.
      {
        source: "/protocols/:slug/unlocks",
        headers: [dataCacheHeader],
      },
      // Chain-filtered variant (path segment since 2026-06-12 — the old
      // ?chain= query form 308s here via middleware).
      {
        source: "/protocols/:slug/unlocks/:chain",
        headers: [dataCacheHeader],
      },
      // Token explorer pages — same DexScreener pricing dependency.
      {
        source: "/token/:chainId/:address",
        headers: [dataCacheHeader],
      },
      // /unlocks index + windowed pages (today, this-week, 30-days, etc.).
      {
        source: "/unlocks",
        headers: [dataCacheHeader],
      },
      {
        source: "/unlocks/:range",
        headers: [dataCacheHeader],
      },
      // /protocols index page.
      {
        source: "/protocols",
        headers: [dataCacheHeader],
      },
    ];
  },
  async redirects() {
    return [
      // The Team Finance vesting guide article was removed (June 2026) when
      // we pulled all Team Finance mentions pre-launch. Redirect any stray
      // external/indexed links to the resources index instead of 404ing.
      {
        source: "/resources/team-finance-vesting-guide",
        destination: "/resources",
        permanent: true,
      },
    ];
  },
  // /unlocks is now the canonical home of the date-windowed unlock calendar
  // (today, this-week, 30-days, etc.) — a higher-value SEO surface than the
  // legacy /unlocks → /protocols redirect could provide. Old backlinks like
  // /unlocks/sablier are now rare enough that the redesigned 404 page (which
  // surfaces /unlocks, /protocols, and /resources cards) is a better
  // recovery path than a misleading auto-redirect would be.
};

export default nextConfig;
