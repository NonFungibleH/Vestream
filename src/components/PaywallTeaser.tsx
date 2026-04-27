// Visual paywall used on the deep-calendar surfaces
// (/protocols/[slug]/unlocks, /unlocks/[range]). Renders the gated rows
// blurred-out behind a centred upgrade card so visitors see the *shape* of
// the data they're missing — strictly more compelling than a hard cut-off
// + "Show more →" button.
//
// Design constraints:
//   - The blurred children stay in the DOM (server-rendered HTML), which
//     keeps the JSON-LD ItemList useful for crawlers and avoids the
//     "thin-content paywall" SEO penalty.
//   - The blur is CSS-only (filter: blur, pointer-events: none, aria-hidden)
//     so screen readers skip it and keyboard users can't tab into the
//     hidden anchors.
//   - No JavaScript required to enforce the gate — paywall is server-
//     rendered, no client-side hydration cost.

import Link from "next/link";

interface PaywallTeaserProps {
  /** The gated rows. Rendered blurred + non-interactive. */
  children:    React.ReactNode;
  /** "32 more upcoming unlocks", "all 47 events", etc. */
  hiddenLabel: string;
  /** Where the upgrade button points. Defaults to /pricing. */
  upgradeHref?: string;
  /** Caller can override the headline. */
  headline?:   string;
  /** Caller can override the sub-line. */
  subline?:    string;
}

export function PaywallTeaser({
  children,
  hiddenLabel,
  upgradeHref = "/pricing",
  headline    = "Upgrade to Pro to unlock the full calendar",
  subline     = "$14.99/mo · 14-day free trial · cancel anytime",
}: PaywallTeaserProps) {
  return (
    <div className="relative">
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
              background:   "rgba(13,148,136,0.08)",
              border:       "1px solid rgba(13,148,136,0.25)",
              color:        "#0d9488",
              letterSpacing:"0.05em",
            }}
          >
            PRO
          </div>
          <h3
            className="text-lg sm:text-xl font-semibold mb-2"
            style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
          >
            {headline}
          </h3>
          <p className="text-sm mb-1" style={{ color: "#64748b" }}>
            {hiddenLabel} hidden behind upgrade.
          </p>
          <p className="text-xs mb-5" style={{ color: "#94a3b8" }}>
            {subline}
          </p>
          <Link
            href={upgradeHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
            style={{
              background: "linear-gradient(135deg, #0d9488, #0891b2)",
              color:      "white",
              boxShadow:  "0 4px 16px rgba(13,148,136,0.3)",
            }}
          >
            View pricing →
          </Link>
        </div>
      </div>
    </div>
  );
}
