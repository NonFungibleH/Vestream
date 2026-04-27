// src/lib/analytics.ts
// ─────────────────────────────────────────────────────────────────────────────
// Thin wrapper around Google Analytics 4 + future analytics destinations.
//
// Goals at MVP:
//   1. Fire the events investors typically ask about — "how many people
//      searched / scanned / added a wallet last week" — without sprinkling
//      `window.gtag('event', ...)` calls throughout the codebase.
//   2. Respect cookie consent. Until the user accepts analytics in the
//      cookie banner, every `track()` call is a silent no-op so we stay
//      on the right side of GDPR.
//   3. Stay swappable. Today this only writes to gtag; tomorrow we can add
//      Posthog, Plausible, or a server-side proxy by editing one file.
//
// Event taxonomy (kept short, semantically meaningful, snake_case):
//   page_view                  — fired automatically by GoogleAnalytics.tsx
//   search_performed           — explorer + dashboard search bar submits
//   wallet_scan_started        — find-vestings or dashboard discover scan kickoff
//   wallet_scan_completed      — same flow, with `result_count` param
//   wallet_added               — successful POST /api/wallets
//   wallet_removed             — successful DELETE /api/wallets/[address]
//   stream_detail_viewed       — stream/[id] page or modal opened
//   notification_prefs_saved   — user toggled or saved alert prefs
//   signup_started             — email entered, OTP sent
//   signup_completed           — OTP verified, session created
//   login_completed            — same as signup_completed for returning users
//   early_access_requested     — homepage waitlist form submitted
//   onboarding_step_completed  — step name passed via `step` param
//   upgrade_clicked            — any CTA pointing at /pricing or Stripe checkout
//   subscription_started       — Stripe checkout success (server-side fired
//                                via Measurement Protocol — see /api/analytics/event)
//   subscription_canceled      — Stripe webhook cancel event (server-side)
//   api_access_requested       — developer access form submitted
//   cta_clicked                — generic catch-all, takes a `cta_id` param
//
// Param-naming rules:
//   - all keys in snake_case
//   - prefer enums over free-text where possible (e.g. `surface: "explorer"
//     | "discover" | "find_vestings"`) so dashboards can group cleanly
//   - never include PII (email addresses, wallet addresses, etc.) — only
//     coarse properties like `address_type: "evm" | "solana"`
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "vestream-cookie-consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// ── Event names ────────────────────────────────────────────────────────────

export type AnalyticsEvent =
  | "search_performed"
  | "wallet_scan_started"
  | "wallet_scan_completed"
  | "wallet_added"
  | "wallet_removed"
  | "stream_detail_viewed"
  | "notification_prefs_saved"
  | "signup_started"
  | "signup_completed"
  | "login_completed"
  | "early_access_requested"
  | "onboarding_step_completed"
  | "upgrade_clicked"
  | "subscription_started"
  | "subscription_canceled"
  | "api_access_requested"
  | "cta_clicked";

// ── Allowed params per event ────────────────────────────────────────────────
// We keep this loose-typed (Record<string, unknown>) at the call site so
// adding a new param doesn't require touching this file, but call sites
// should follow the conventions in the comment block above.

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

// ── Internals ───────────────────────────────────────────────────────────────

function consentGranted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "all";
  } catch {
    return false;
  }
}

function gtagAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fire a custom analytics event. No-op until the user has accepted analytics
 * cookies AND the GA4 script has loaded. Safe to call from anywhere — server,
 * client, before or after hydration — without crashing.
 */
export function track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined") return;
  if (!consentGranted()) return;
  if (!gtagAvailable()) return;
  try {
    // Strip undefined values so they don't show up as "undefined" strings in
    // GA4. Coerce booleans to "true"/"false" because GA4 dimension reports
    // render those nicer than the raw bool.
    const cleaned: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v == null) continue;
      cleaned[k] = typeof v === "boolean" ? String(v) : v;
    }
    window.gtag!("event", event, cleaned);
  } catch {
    // Analytics must never break the app. Swallow.
  }
}

/**
 * Detect the kind of input a search/scan started with so dashboards can
 * group "EVM scans vs Solana scans vs symbol searches" without the
 * tracking call site needing to know our regexes.
 */
export function classifyAddressOrQuery(input: string):
  | "evm"
  | "solana"
  | "ens"
  | "symbol"
  | "freeform" {
  const trimmed = input.trim();
  if (/^0x[0-9a-f]{40}$/i.test(trimmed)) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "solana";
  if (/\.(eth|xyz|crypto|nft)$/i.test(trimmed)) return "ens";
  if (/^[A-Z0-9$]{2,12}$/i.test(trimmed)) return "symbol";
  return "freeform";
}
