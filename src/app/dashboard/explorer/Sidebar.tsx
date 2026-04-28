// Server-component sidebar for the explorer. Mirrors the discover-page
// sidebar shape (logo + nav + tier badge) so the dashboard product feels
// consistent across surfaces. Discover uses a client component because it
// also drives router.push; this one only links, so it stays server-only.

import Link from "next/link";
import type { Tier } from "@/lib/auth/tier";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard",          icon: "grid"     },
  { label: "Explorer",  href: "/dashboard/explorer", icon: "search"   },
  { label: "Discover",  href: "/dashboard/discover", icon: "scan"     },
  { label: "Settings",  href: "/settings",           icon: "settings" },
] as const;

export function ExplorerSidebar({ tier }: { tier: Tier | null }) {
  return (
    <aside
      className="w-56 flex-shrink-0 hidden lg:flex flex-col"
      style={{
        height:       "100vh",
        background:   "var(--preview-card)",
        borderRight:  "1px solid var(--preview-border)",
        position:     "sticky",
        top:          0,
      }}
    >
      <Link
        href="/"
        className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ borderBottom: "1px solid var(--preview-border)" }}
      >
        <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7 flex-shrink-0" />
        <div>
          <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>
            Vestream
          </span>
          <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>
            Track every token unlock
          </p>
        </div>
      </Link>

      <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
        {NAV_ITEMS.map((item) => {
          // Server component — no usePathname available. Explorer rendered
          // here, so Explorer is the always-active item. Sub-routes (e.g.
          // /dashboard/explorer/[chainId]/[tokenAddress]) fall through to a
          // separate page that renders this same sidebar, so it remains
          // active everywhere it's mounted.
          const active = item.href === "/dashboard/explorer";
          return (
            <Link
              key={item.href}
              href={item.href}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={
                active
                  ? { background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(15,138,138,0.08))", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.15)" }
                  : { color: "var(--preview-text-2)", border: "1px solid transparent" }
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Tier badge */}
      <div
        className="px-3 pb-3 flex-shrink-0 space-y-2"
        style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}
      >
        {tier === "free" || tier == null ? (
          <div
            className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>
                {tier === "free" ? "Free Plan" : "Sign in"}
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}
              >
                {tier === "free" ? "FREE" : "GUEST"}
              </span>
            </div>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              Pro lifts caps, multi-filter, CSV export, alerts.
            </p>
            <Link
              href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "#1CB8B8" }}
            >
              Upgrade to Pro →
            </Link>
          </div>
        ) : tier === "pro" ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}
          >
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>PRO</span>
            <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Pro Plan</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(28,184,184,0.10))", border: "1px solid rgba(28,184,184,0.25)" }}
          >
            <span className="text-[10px]">✦</span>
            <div>
              <p className="text-[10px] font-bold" style={{ color: "#1CB8B8" }}>Fund Plan</p>
              <p className="text-[8px]" style={{ color: "var(--preview-text-3)" }}>Unlimited · all features</p>
            </div>
          </div>
        )}
        <p className="text-[8px] text-center" style={{ color: "var(--preview-text-3)" }}>
          Read-only · No funds access
        </p>
      </div>
    </aside>
  );
}

function Icon({ name }: { name: "grid" | "search" | "scan" | "settings" }) {
  const common = {
    width:  16,
    height: 16,
    viewBox: "0 0 24 24",
    fill:   "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    );
  }
  if (name === "scan") {
    return (
      <svg {...common}>
        <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
        <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
        <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
        <line x1="7" y1="12" x2="17" y2="12"/>
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
