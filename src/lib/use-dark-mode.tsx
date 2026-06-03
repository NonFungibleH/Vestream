"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for dashboard night mode.
//
// Before: every dashboard page kept its own `dark` useState + its own toggle,
// each persisting the cookie differently and applying `.dark` to different
// elements. Result: toggling on one page didn't sync to others, and some
// surfaces themed while others didn't ("half dark").
//
// Now: the dashboard layout (a Server Component) reads the cookie once and
// seeds this provider. The provider:
//   - applies the `.dark` class on a single wrapper div (CSS-var + Tailwind
//     `dark:` theming for the whole tree, updated instantly on toggle), and
//   - exposes `{ dark, toggle }` so client components that need the boolean
//     for INLINE styles (gradients, charts) read one reactive value.
//
// There is exactly ONE toggle (the sidebar), which calls `toggle()`:
// instant local flip + persist cookie + router.refresh() so any
// server-rendered surface re-reads the cookie and stays consistent.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setDarkModePreference } from "@/lib/dark-mode";

interface DarkModeValue {
  dark:   boolean;
  toggle: () => void;
}

const DarkModeContext = createContext<DarkModeValue | null>(null);

export function DarkModeProvider({
  children,
  initialDark,
}: {
  children: ReactNode;
  initialDark: boolean;
}) {
  const router = useRouter();
  const [dark, setDark] = useState(initialDark);

  // Keep in sync if the server-resolved value changes (router.refresh,
  // navigation, another tab). Cheap and idempotent.
  useEffect(() => { setDark(initialDark); }, [initialDark]);

  const toggle = useCallback(() => {
    setDark((v) => {
      const next = !v;
      setDarkModePreference(next);  // persist cookie + localStorage
      router.refresh();             // re-run server layout so SSR surfaces re-theme
      return next;
    });
  }, [router]);

  return (
    <DarkModeContext.Provider value={{ dark, toggle }}>
      {/* Single `.dark` wrapper — themes the entire dashboard tree instantly
          on toggle, no flash waiting for the server round-trip. */}
      <div className={dark ? "dark" : ""}>{children}</div>
    </DarkModeContext.Provider>
  );
}

/**
 * Read the dashboard night-mode value. Returns `{ dark, toggle }`. Safe
 * outside the provider (returns a sensible default + no-op toggle) so a
 * stray usage can't crash a page.
 */
export function useDarkMode(): DarkModeValue {
  return useContext(DarkModeContext) ?? { dark: false, toggle: () => {} };
}
