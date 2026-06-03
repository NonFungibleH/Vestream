"use client";

// src/components/DashboardSidebar.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unified left-rail navigation for every page under /dashboard/*.
//
// Lives at the LAYOUT level (mounted by `src/app/dashboard/layout.tsx`) so
// every sub-route — /dashboard, /dashboard/explorer, /dashboard/discover,
// /dashboard/watchlist, /dashboard/income-statement, /dashboard/exports —
// renders the same nav, in the same order, with the same active-state
// highlighting.
//
// What this component does NOT include:
//   - Wallet management (add / remove tracked wallets). That UI is
//     dashboard-page-specific and renders inside /dashboard/page.tsx's
//     main content area, not the layout sidebar.
//   - Feedback button. Same reasoning — surface-specific.
//
// Mobile behaviour: collapsed by default below md breakpoint, toggled
// via a hamburger button in the page header (each page renders its own
// header; hamburger calls `onToggle` which the layout-level
// DashboardChrome owns).
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

// ─── Icons (match the existing dashboard set; kept inline to avoid adding
// an icon library) ──────────────────────────────────────────────────────────

function IconGrid()    { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function IconCompass() { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>; }
function IconSearch()  { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function IconBookmark(){ return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>; }
function IconExport()  { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
function IconBars()    { return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/></svg>; }
function IconSettings(){ return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

// ─── Nav items ──────────────────────────────────────────────────────────────

// "activePaths" lets one nav item highlight for multiple routes — used for
// the merged "Tax" item which covers both /exports and /income-statement.
const NAV_ITEMS: Array<{
  icon: React.ReactNode;
  label: string;
  href: string;
  /** Additional path prefixes that should also trigger the active state. */
  activePaths?: string[];
}> = [
  { icon: <IconGrid />,     label: "Dashboard",       href: "/dashboard"                    },
  { icon: <IconCompass />,  label: "Vesting Index",   href: "/dashboard/explorer"           },
  { icon: <IconSearch />,   label: "Wallet Scanner",  href: "/dashboard/discover"           },
  { icon: <IconBookmark />, label: "Token Watchlist", href: "/dashboard/watchlist"          },
  { icon: <IconBars />,     label: "Income",          href: "/dashboard/income-statement"   },
  {
    icon:        <IconExport />,
    label:       "Tax Reports",
    href:        "/dashboard/exports",
  },
  { icon: <IconSettings />, label: "Settings",        href: "/settings"                     },
];

interface DashboardSidebarProps {
  /** Kept for back-compat with callers that still pass it. The sidebar
   *  no longer branches on tier — the dashboard is Pro-only via
   *  middleware so this prop is unused inside. Safe to drop from
   *  callers in a future cleanup. */
  tier?:    string;
  isOpen:   boolean;
  onClose:  () => void;
}

export function DashboardSidebar({ isOpen, onClose }: DashboardSidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  // Theme is controlled by the header toggle + the layout's cookie-driven
  // `.dark` wrapper. The logo swap below uses Tailwind `dark:` variants which
  // key off that ancestor class, so the sidebar needs no local dark state.

  const handleNav = useCallback((href: string) => {
    router.push(href);
    onClose(); // close mobile drawer on navigation
  }, [router, onClose]);

  return (
    <aside
      className={`fixed md:relative z-50 md:z-auto w-56 flex-shrink-0 h-full md:h-screen flex flex-col transition-transform duration-200 ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      style={{ background: "var(--preview-card)", borderRight: "1px solid var(--preview-border)" }}>

      {/* Logo. Two <img> tags swapped via Tailwind's `dark:` variant — same
          pattern the rest of the dashboard uses. The /dashboard root sets
          `.dark` based on the user's theme preference. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <Link href="/dashboard" className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ borderBottom: "1px solid var(--preview-border)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.svg"      alt="Vestream" className="w-7 h-7 flex-shrink-0 block dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon-dark.svg" alt=""         aria-hidden="true" className="w-7 h-7 flex-shrink-0 hidden dark:block" />
        <div>
          <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>Vestream</span>
          <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>Track every token unlock</p>
        </div>
      </Link>

      {/* Nav. Active state computed from pathname — Dashboard matches exact
          path; everything else uses startsWith so sub-routes (e.g.
          /dashboard/explorer/[token]) keep the parent highlighted.
          Free-tier badge logic was removed because dashboard middleware
          gates the entire `/dashboard/*` tree on the Pro iron-session
          cookie — free-tier users never reach this component. */}
      <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href) ||
              (item.activePaths ?? []).some((p) => pathname.startsWith(p));
          return (
            <button key={item.label}
              onClick={() => handleNav(item.href)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={isActive
                ? { background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(15,138,138,0.08))", color: "#1CB8B8", border: "1px solid rgba(59,130,246,0.15)" }
                : { color: "var(--preview-text-2)", border: "1px solid transparent" }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "var(--preview-muted)"; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "transparent"; } }}
            >
              <span className="opacity-80 flex-shrink-0">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer — Pro tier badge. The dashboard is Pro-only (middleware
          gates `/dashboard/*` on the iron-session cookie set by QR pair),
          so the only tier that can ever reach this sidebar is "pro".
          Removed the dead `tier === "free"` upgrade-prompt branch +
          the legacy "Enterprise" label (Enterprise was dropped from
          the homepage May 5 2026). */}
      <div className="px-3 pb-3 flex-shrink-0 space-y-2" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}>
        <div className="px-3 py-2 rounded-xl"
          style={{ background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.20)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text)" }}>Pro</span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "#1CB8B8", color: "white" }}>ACTIVE</span>
          </div>
        </div>

        {/* Dark/light toggle removed 2026-06 — it used a stale localStorage
            format ("true"/"false" vs the shared lib's "1"/"0") and wrote
            `.dark` to <html> while the layout themes off a cookie on its own
            wrapper, so the two fought and it "did nothing". The single theme
            control now lives in the header (see dashboard/page.tsx toggleDark
            → router.refresh()), which re-themes the whole tree consistently. */}
      </div>
    </aside>
  );
}
