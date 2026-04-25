"use client";

// src/components/SiteFooter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared footer for every public page. Ensures the same set of links and
// visual style across light / navy / dark themed pages — so the footer never
// drifts page-to-page as it has historically.
//
// "use client" because the social buttons and link columns use onMouseEnter/
// onMouseLeave for theme-driven hover colours. Inline style= doesn't support
// :hover, and the hover tints are driven by the palette (different per theme)
// so Tailwind hover: utilities can't express them statically. Client
// components render fine when imported by server-component pages — Next.js
// handles the boundary automatically.
//
// Themes match SiteNav exactly:
//   - "light" → white B2C pages (homepage, pricing, /protocols, /demo, etc.)
//   - "navy"  → /developer
//   - "dark"  → /ai
//
// Layout:
//   - Left column: logo + tagline + social icons + copyright (stacked)
//   - Right columns: three grouped link columns
//       • Platform:   Protocols · Demo · Pricing · Resources · FAQ · Contact
//       • Developers: Developer API · AI Agents
//       • Legal:      Privacy Policy · Terms of Service
//   - A tiny "·" admin escape-hatch lives adjacent to the copyright — faint
//     enough not to draw attention but available if you ever need to find
//     your way back to /admin.
//
// The copyright strip used to live in its own bordered row below the main
// grid, which added a horizontal rule + a lot of whitespace at the bottom
// of every page. Tucking it under the social icons instead removes the
// divider and tightens the footer into a single cohesive block.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

interface Props {
  /** Colour theme — matches the page background. */
  theme?: "light" | "navy" | "dark";
  /** Optional extra copy line (e.g. "Results may take 10s"). */
  note?: string;
  /** Render the background as a recessed panel (useful on developer/AI). */
  recessed?: boolean;
}

// Grouped link structure. Order matters within each column — matches the
// order the user approved: Protocols, Demo, Pricing, Resources for Platform;
// Developer API, AI Agents for Developers; Privacy, Terms for Legal.
// Column order: Platform → Developers → Corporate → Legal.
// Reads "what can I do today → what do builders get → what's for companies
// → what's the fine print" which matches how visitors move through the
// funnel rather than an arbitrary alphabetical arrangement.
const LINK_GROUPS = [
  {
    heading: "Platform",
    links: [
      { label: "Protocols", href: "/protocols" },
      { label: "Demo",      href: "/demo"      },
      { label: "Pricing",   href: "/pricing"   },
      { label: "Resources", href: "/resources" },
      { label: "FAQ",       href: "/faq"       },
      { label: "Contact",   href: "/contact"   },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "Developer API", href: "/developer" },
      { label: "AI Agents",     href: "/ai"        },
    ],
  },
  {
    heading: "Corporate",
    links: [
      { label: "Token Payroll", href: "/corporate/token-payroll" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy",   href: "/privacy" },
      { label: "Terms of Service", href: "/terms"   },
    ],
  },
] as const;

// Social — placeholder URLs until real accounts exist. Swap in real handles
// here (they're the only two strings that change).
const SOCIAL = [
  {
    label: "X",
    href:  "https://x.com/vestream",
    // X (formerly Twitter) brand mark. currentColor lets the icon inherit
    // from the parent's colour so theme swaps work without editing the SVG.
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href:  "https://linkedin.com/company/vestream",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
] as const;

const THEME = {
  light: {
    border:     "rgba(0,0,0,0.07)",
    bg:         "transparent",
    mutedBg:    "#f8fafc",
    heading:    "#0f172a",
    copyright:  "#94a3b8",
    link:       "#64748b",
    linkHover:  "#0f172a",
    socialBg:   "rgba(0,0,0,0.04)",
    socialFg:   "#64748b",
    socialHoverBg: "rgba(37,99,235,0.08)",
    socialHoverFg: "#2563eb",
    adminDot:   "rgba(148,163,184,0.3)",
    brandName:  "#0f172a",
  },
  navy: {
    border:     "rgba(255,255,255,0.06)",
    bg:         "transparent",
    mutedBg:    "#0a1628",
    heading:    "rgba(255,255,255,0.85)",
    copyright:  "#4b5563",
    link:       "rgba(255,255,255,0.55)",
    linkHover:  "white",
    socialBg:   "rgba(255,255,255,0.05)",
    socialFg:   "rgba(255,255,255,0.55)",
    socialHoverBg: "rgba(96,165,250,0.12)",
    socialHoverFg: "#60a5fa",
    adminDot:   "rgba(255,255,255,0.14)",
    brandName:  "white",
  },
  dark: {
    border:     "rgba(255,255,255,0.06)",
    bg:         "transparent",
    mutedBg:    "#0d0f14",
    heading:    "rgba(255,255,255,0.85)",
    copyright:  "rgba(255,255,255,0.3)",
    link:       "rgba(255,255,255,0.45)",
    linkHover:  "white",
    socialBg:   "rgba(255,255,255,0.05)",
    socialFg:   "rgba(255,255,255,0.55)",
    socialHoverBg: "rgba(99,102,241,0.15)",
    socialHoverFg: "#a5b4fc",
    adminDot:   "rgba(255,255,255,0.14)",
    brandName:  "white",
  },
} as const;

export function SiteFooter({ theme = "light", note, recessed = false }: Props) {
  const palette = THEME[theme];
  const year = new Date().getFullYear();

  return (
    <footer
      className="px-4 md:px-8 pt-12 pb-8"
      style={{
        borderTop: `1px solid ${palette.border}`,
        background: recessed ? palette.mutedBg : palette.bg,
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Single grid: brand stack (logo / tagline / socials / copyright) on
            the left, link columns on the right. No separate lower strip and
            no dividing rule — copyright tucks directly under the socials
            inside the brand stack to keep the footer as one cohesive block. */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-10 md:gap-12">
          {/* Brand stack */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity w-fit">
              <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7" />
              <span className="font-semibold text-base" style={{ color: palette.brandName }}>
                Vestream
              </span>
            </Link>
            <p className="text-xs max-w-[18rem] leading-relaxed" style={{ color: palette.copyright }}>
              Track every token unlock across every major vesting protocol.
            </p>

            {/* Social row */}
            <div className="flex items-center gap-2 mt-2">
              {SOCIAL.map((s) => (
                <SocialButton key={s.label} palette={palette} {...s} />
              ))}
            </div>

            {/* Copyright — directly under the socials, no divider. The admin
                dot sits inline with the copyright so it stays discoverable
                without needing its own row. */}
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs" style={{ color: palette.copyright }}>
                © {year} Vestream. All rights reserved.
              </p>
              <Link
                href="/admin"
                className="text-xs transition-colors hover:opacity-60"
                style={{ color: palette.adminDot }}
                title="Admin"
                aria-label="Admin"
              >
                ·
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6">
            {LINK_GROUPS.map((group) => (
              <div key={group.heading} className="flex flex-col gap-3 min-w-[6.5rem]">
                <h3
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: palette.heading, letterSpacing: "0.12em" }}
                >
                  {group.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {group.links.map(({ label, href }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="text-sm transition-colors"
                        style={{ color: palette.link }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = palette.linkHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = palette.link)}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {note && (
          <p className="mt-6 text-[11px]" style={{ color: palette.copyright }}>
            {note}
          </p>
        )}
      </div>
    </footer>
  );
}

// ── Small bits ─────────────────────────────────────────────────────────────

interface SocialButtonProps {
  label: string;
  href:  string;
  svg:   React.ReactNode;
  palette: (typeof THEME)[keyof typeof THEME];
}

function SocialButton({ label, href, svg, palette }: SocialButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
      style={{ background: palette.socialBg, color: palette.socialFg }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = palette.socialHoverBg;
        e.currentTarget.style.color = palette.socialHoverFg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = palette.socialBg;
        e.currentTarget.style.color = palette.socialFg;
      }}
    >
      {svg}
    </a>
  );
}
