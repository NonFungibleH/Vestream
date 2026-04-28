// Visual signup teaser used on the deep-calendar surfaces
// (/protocols/[slug]/unlocks, /unlocks/[range]). Renders the rest of the
// rows blurred behind a centred "Sign up free to see all N" card so
// visitors see the *shape* of what's hidden — much more compelling than a
// "Show more →" button.
//
// Design constraints:
//   - The blurred children stay in the DOM (server-rendered HTML), which
//     keeps the JSON-LD ItemList useful for crawlers and avoids any
//     "thin-content" SEO penalty.
//   - The blur is CSS-only (filter: blur, pointer-events: none, aria-hidden)
//     so screen readers skip it and keyboard users can't tab into the
//     hidden anchors.
//   - No JavaScript required — server-rendered, zero client-side cost.
//   - The CTA goes to the FREE signup flow, not the paid upgrade flow.
//     Marketing-page funnel logic: a free signup is much easier to get
//     than a paid upgrade, and the upgrade moment lives inside the
//     authenticated dashboard product where users already see value.

import Link from "next/link";

interface PaywallTeaserProps {
  /** The hidden rows. Rendered blurred + non-interactive. */
  children:    React.ReactNode;
  /** "32 more upcoming unlocks", "all 47 events", etc. */
  hiddenLabel: string;
  /** Where the CTA button points. Defaults to the free-signup funnel
   *  entry (/find-vestings) — see the file-level note for why. */
  ctaHref?:    string;
  /** Caller can override the headline. Defaults to a generic "see all" copy. */
  headline?:   string;
  /** Caller can override the sub-line under the headline. */
  subline?:    string;
  /** CTA button text. Defaults to "Sign up free to see all →". */
  ctaLabel?:   string;
}

export function PaywallTeaser({
  children,
  hiddenLabel,
  ctaHref     = "/find-vestings",
  headline    = "See every upcoming unlock",
  subline     = "Free · no credit card · access the full calendar in your dashboard",
  ctaLabel    = "Sign up free →",
}: PaywallTeaserProps) {
  return (
    // min-height ensures the card has room even when the blurred children
    // are short (e.g. only 2-3 hidden rows). Previously, callers wrapping
    // PaywallTeaser in `rounded-2xl overflow-hidden` saw the bottom of the
    // card (CTA button + subline) clipped, because absolute-positioned
    // children that overflow `inset-0` were getting cut off by the parent's
    // overflow:hidden. min-height on the relative container forces enough
    // box height for the card to fit fully.
    <div className="relative" style={{ minHeight: "22rem" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none select-none"
        style={{
          filter:        "blur(6px)",
          opacity:       0.55,
          maskImage:     "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.2) 90%)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 40%, rgba(0,0,0,0.2) 90%)",
        }}
      >
        {children}
      </div>
      <div
        className="absolute inset-0 flex items-start justify-center pt-12"
        style={{
          background: "linear-gradient(to bottom, rgba(248,250,252,0) 0%, rgba(248,250,252,0.6) 30%, rgba(248,250,252,0.95) 70%)",
        }}
      >
        <div
          className="rounded-2xl p-6 sm:p-8 max-w-md text-center mx-4"
          style={{
            background:    "white",
            border:        "1px solid rgba(0,0,0,0.08)",
            boxShadow:     "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{
              background:   "rgba(28,184,184,0.08)",
              border:       "1px solid rgba(28,184,184,0.25)",
              color:        "#0F8A8A",
              letterSpacing:"0.05em",
            }}
          >
            FREE ACCOUNT
          </div>
          <h3
            className="text-lg sm:text-xl font-semibold mb-2"
            style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
          >
            {headline}
          </h3>
          <p className="text-sm mb-1" style={{ color: "#64748b" }}>
            {hiddenLabel} below.
          </p>
          <p className="text-xs mb-5" style={{ color: "#94a3b8" }}>
            {subline}
          </p>
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
            style={{
              background: "#1CB8B8",
              color:      "white",
              boxShadow:  "0 4px 16px rgba(28,184,184,0.3)",
            }}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
