// src/components/SiteFooter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Vestream footer — per brand brief v1.0 §09 (Page structure → Footer).
//
//   Ink background. Lockup-on-dark top-left. Three columns of links in mono
//   uppercase. Legal text in muted-on-dark below.
//
// Layout: lockup + tagline + socials + copyright on the left; four mono-
// labelled link columns on the right. No card shadows; only the page-edge
// hairline between the marketing area and the footer.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

interface Props {
  /** Kept for back-compat with existing pages calling theme="navy"|"dark"; ignored. */
  theme?: "light" | "navy" | "dark";
  /** Optional extra copy line (e.g. "Results may take 10s"). */
  note?:  string;
  /** Kept for back-compat with previous prop; ignored. */
  recessed?: boolean;
}

const LINK_GROUPS = [
  {
    heading: "Platform",
    links: [
      { label: "Find vestings", href: "/find-vestings" },
      { label: "Protocols",     href: "/protocols"     },
      { label: "Pricing",       href: "/pricing"       },
      { label: "Resources",     href: "/resources"     },
      { label: "FAQ",           href: "/faq"           },
      { label: "Contact",       href: "/contact"       },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "Developer API", href: "/developer" },
      { label: "AI Agents",     href: "/ai"        },
      { label: "API docs",      href: "/api-docs"  },
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
      { label: "Privacy",  href: "/privacy" },
      { label: "Terms",    href: "/terms"   },
    ],
  },
] as const;

const SOCIAL = [
  {
    label: "X",
    href:  "https://x.com/vestream",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href:  "https://linkedin.com/company/vestream",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="14" height="14">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
] as const;

export function SiteFooter({ note }: Props) {
  const year = new Date().getFullYear();

  return (
    <footer
      className="px-4 md:px-8 pt-16 pb-10"
      style={{
        background: "var(--ink)",
        color:      "var(--paper)",
      }}
    >
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_2fr] gap-10 md:gap-16">
          {/* Brand stack */}
          <div className="flex flex-col gap-5">
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity w-fit" aria-label="Vestream — home">
              <img src="/logo-dark.svg" alt="Vestream" style={{ height: 28, width: "auto" }} />
            </Link>
            <p className="text-sm max-w-[22rem] leading-relaxed" style={{ color: "var(--grey-2)" }}>
              Token streams that never miss a cliff. For issuers, recipients, and auditors.
            </p>

            {/* Social row */}
            <div className="flex items-center gap-3 mt-1">
              {SOCIAL.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={s.label}
                  className="w-8 h-8 flex items-center justify-center rounded-[3px] transition-colors hover:text-[var(--teal)]"
                  style={{
                    background: "var(--ink-2)",
                    color:      "var(--grey-2)",
                  }}
                >
                  {s.svg}
                </a>
              ))}
            </div>

            {/* Copyright + admin escape */}
            <div className="flex items-center gap-2 mt-3">
              <p className="text-xs" style={{ color: "var(--grey-1)" }}>
                © {year} Vestream. All rights reserved.
              </p>
              <Link
                href="/admin"
                className="text-xs hover:opacity-100 transition-opacity"
                style={{ color: "var(--ink-2)", opacity: 0.7 }}
                title="Admin"
                aria-label="Admin"
              >
                ·
              </Link>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-8">
            {LINK_GROUPS.map((group) => (
              <div key={group.heading} className="flex flex-col gap-3.5">
                <h3
                  className="text-[11px] font-medium"
                  style={{
                    fontFamily:    "var(--font-mono)",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color:         "var(--grey-2)",
                  }}
                >
                  {group.heading}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {group.links.map(({ label, href }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="text-sm transition-colors hover:text-[var(--teal)]"
                        style={{ color: "var(--paper)" }}
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
          <>
            <hr className="my-8" style={{ borderColor: "var(--ink-2)", borderWidth: 0, borderTopWidth: 1 }} />
            <p className="text-[11px]" style={{ color: "var(--grey-1)" }}>
              {note}
            </p>
          </>
        )}
      </div>
    </footer>
  );
}
