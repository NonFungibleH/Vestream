"use client";

// src/components/DashboardChrome.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Outer dashboard shell: wraps every page under /dashboard/* with a
// consistent left-rail sidebar + main content area. Owns the mobile
// drawer state (sidebarOpen) and exposes a hamburger-toggle context
// so per-page headers can hook into it.
//
// Why a separate "chrome" component vs putting this directly in the
// layout: layout.tsx is a Server Component (it needs `cookies()` for
// the currency cookie + `getRates()` for SSR rate hydration). Mobile
// drawer state is client-only. The boundary lives here.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardFooter } from "./DashboardFooter";

// ─── Mobile bottom navigation bar ────────────────────────────────────────────
// Shown only on small screens (md:hidden). Mirrors the 5 most-used nav items.
// The sidebar handles desktop; this bar handles mobile.

function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();

  const items = [
    {
      label: "Home",
      href: "/dashboard",
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      ),
    },
    {
      label: "Index",
      href: "/dashboard/explorer",
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
        </svg>
      ),
    },
    {
      label: "Scanner",
      href: "/dashboard/discover",
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      ),
    },
    {
      label: "Income",
      href: "/dashboard/income-statement",
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
      ),
    },
    {
      label: "Tax",
      href: "/dashboard/exports",
      icon: (
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
    },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
      style={{
        background: "var(--preview-card)",
        borderTop: "1px solid var(--preview-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {items.map((item) => {
        const isActive = item.href === "/dashboard"
          ? pathname === "/dashboard"
          : pathname.startsWith(item.href);
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors"
            style={{ color: isActive ? "#1CB8B8" : "var(--preview-text-3)" }}
          >
            <span className={isActive ? "opacity-100" : "opacity-60"}>{item.icon}</span>
            <span className="text-[9px] font-semibold tracking-wide">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

interface ChromeContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (next: boolean) => void;
  toggleSidebar: () => void;
}

const ChromeContext = createContext<ChromeContextValue | null>(null);

/**
 * Use inside any /dashboard/* page to control the mobile sidebar drawer.
 * Page headers typically render a hamburger button below md that calls
 * `toggleSidebar()`. Returns a no-op context outside the chrome (e.g.
 * if a dashboard component is reused on a non-dashboard page).
 */
export function useDashboardChrome(): ChromeContextValue {
  const ctx = useContext(ChromeContext);
  if (!ctx) {
    return { sidebarOpen: false, setSidebarOpen: () => {}, toggleSidebar: () => {} };
  }
  return ctx;
}

interface DashboardChromeProps {
  children: ReactNode;
  /** User's tier — passed through from layout server-side fetch. */
  tier?: string;
}

export function DashboardChrome({ children, tier }: DashboardChromeProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const value: ChromeContextValue = {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar: () => setSidebarOpen((v) => !v),
  };

  return (
    <ChromeContext.Provider value={value}>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--preview-bg)" }}>
        {/* Mobile sidebar overlay — backdrop click closes the drawer */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            style={{ background: "rgba(0,0,0,0.5)" }}
          />
        )}

        <DashboardSidebar
          tier={tier}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Extra bottom padding on mobile so content isn't hidden behind the bottom nav */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden pb-[60px] md:pb-0">
            {children}
          </div>
          {/* Slim dashboard-wide footer (desktop only — mobile uses MobileNav).
              Pinned below the scrollable content; themes via --preview vars. */}
          <DashboardFooter />
        </div>
      </div>

      {/* Mobile bottom nav — visible on small screens, hidden on md+ where the sidebar handles nav */}
      <MobileNav />
    </ChromeContext.Provider>
  );
}
