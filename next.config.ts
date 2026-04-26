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
      "connect-src 'self' https://gateway.thegraph.com https://*.publicnode.com https://*.alchemy.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org https://*.web3modal.org https://*.supabase.co https://vestream.io https://*.google-analytics.com https://*.googletagmanager.com",
      // Web3Modal occasionally embeds verify.walletconnect.org in an iframe for
      // origin verification on certain wallet flows.
      "frame-src 'self' https://verify.walletconnect.org https://verify.walletconnect.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/(.*)",
        headers: securityHeaders,
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
