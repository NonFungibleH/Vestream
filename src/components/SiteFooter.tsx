// src/components/SiteFooter.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared footer for every public page. Ensures the same set of links and
// visual style across light / navy / dark themed pages — so the footer never
// drifts page-to-page as it has historically.
//
// Themes match SiteNav exactly:
//   - "light" → white B2C pages (homepage, pricing, /unlocks, /demo, etc.)
//   - "navy"  → /developer
//   - "dark"  → /ai
//
// Links are identical across all themes. A tiny "·" admin escape-hatch lives
// in the light footer only — it's faint enough not to draw attention but
// available if you ever need to find your way back to /admin.
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

const LINKS = [
  { label: "Protocols",       href: "/unlocks"       },
  { label: "Demo",            href: "/demo"          },
  { label: "Developer API",   href: "/developer"     },
  { label: "AI Agents",       href: "/ai"            },
  { label: "Pricing",         href: "/pricing"       },
  { label: "Resources",       href: "/resources"     },
  { label: "Privacy Policy",  href: "/privacy"       },
  { label: "Terms of Service", href: "/terms"        },
] as const;

const THEME = {
  light: {
    border:   "rgba(0,0,0,0.07)",
    bg:       "transparent",
    mutedBg:  "#f8fafc",
    text:     "#94a3b8",
    link:     "#64748b",
    adminDot: "rgba(148,163,184,0.3)",
  },
  navy: {
    border:   "rgba(255,255,255,0.06)",
    bg:       "transparent",
    mutedBg:  "#0a1628",
    text:     "#4b5563",
    link:     "#64748b",
    adminDot: "rgba(255,255,255,0.14)",
  },
  dark: {
    border:   "rgba(255,255,255,0.06)",
    bg:       "transparent",
    mutedBg:  "#0d0f14",
    text:     "rgba(255,255,255,0.3)",
    link:     "rgba(255,255,255,0.45)",
    adminDot: "rgba(255,255,255,0.14)",
  },
} as const;

export function SiteFooter({ theme = "light", note, recessed = false }: Props) {
  const palette = THEME[theme];
  const year = new Date().getFullYear();

  return (
    <footer
      className="px-4 md:px-8 py-8"
      style={{
        borderTop: `1px solid ${palette.border}`,
        background: recessed ? palette.mutedBg : palette.bg,
      }}
    >
      <div className="max-w-5xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 hover:opacity-70 transition-opacity">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
            >
              <span className="text-white font-bold text-xs">V</span>
            </div>
            <span
              className="font-semibold text-sm"
              style={{ color: theme === "light" ? "#0f172a" : "white" }}
            >
              Vestream
            </span>
          </Link>
          <p className="text-xs hidden sm:inline" style={{ color: palette.text }}>
            © {year} Vestream
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:gap-x-5">
          {LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: palette.link }}
            >
              {label}
            </Link>
          ))}
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

      {note && (
        <p className="max-w-5xl mx-auto mt-4 text-[11px]" style={{ color: palette.text }}>
          {note}
        </p>
      )}

      <p className="max-w-5xl mx-auto mt-3 text-xs sm:hidden" style={{ color: palette.text }}>
        © {year} Vestream. All rights reserved.
      </p>
    </footer>
  );
}
