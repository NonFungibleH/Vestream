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
import { DashboardSidebar } from "./DashboardSidebar";

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
          {children}
        </div>
      </div>
    </ChromeContext.Provider>
  );
}
