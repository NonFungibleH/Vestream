// src/components/DashboardFooter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Slim, dashboard-wide footer pinned to the bottom of the content column.
// Shows legal links (Privacy, Terms), social icons, and copyright.
//
// Themed entirely via the `--preview-*` CSS variables that the dashboard
// layout's `.dark` wrapper drives, so it follows the header dark-mode toggle
// with no local state. Hidden on mobile (md:flex) where the bottom nav owns
// the bottom edge.
//
// Socials mirror the marketing SiteFooter — single source of handles would be
// nicer, but SiteFooter is "use client" with its own theming; duplicating the
// three hrefs here is cheaper than coupling the two footers.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

const SOCIALS = [
  {
    label: "X",
    href:  "https://x.com/Vestream_",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="15" height="15">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "Telegram",
    href:  "https://t.me/vestream",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="15" height="15">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href:  "https://www.linkedin.com/company/vestream",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="15" height="15">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.852 3.37-1.852 3.601 0 4.267 2.37 4.267 5.455v6.288zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
] as const;

export function DashboardFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="hidden md:flex items-center justify-between gap-4 px-6 py-2.5 flex-shrink-0"
      style={{
        borderTop:  "1px solid var(--preview-border-2)",
        background: "var(--preview-bg)",
        color:      "var(--preview-text-3)",
        fontSize:   12,
      }}
    >
      <div className="flex items-center gap-4">
        <span>© {year} Vestream</span>
        <Link href="/privacy" className="hover:underline" style={{ color: "var(--preview-text-3)" }}>
          Privacy
        </Link>
        <Link href="/terms" className="hover:underline" style={{ color: "var(--preview-text-3)" }}>
          Terms
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {SOCIALS.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            className="transition-opacity hover:opacity-70"
            style={{ color: "var(--preview-text-3)" }}
          >
            {s.svg}
          </a>
        ))}
      </div>
    </footer>
  );
}
