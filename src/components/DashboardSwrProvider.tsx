"use client";

// src/components/DashboardSwrProvider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared SWR config for the entire /dashboard/* tree. Mounted once at the
// layout level so every page inside benefits from the same cache without
// each page having to import its own SWRConfig.
//
// Why the defaults below:
//
//   dedupingInterval: 60_000
//     Requests for the same key within 60s collapse into one – even
//     across page navigations. Click /dashboard/alerts → /dashboard →
//     /dashboard/alerts and the second alerts visit reuses the cached
//     payload instantly, no spinner. Background revalidates ARE still
//     triggered, just not the first-load skeleton.
//
//   revalidateOnFocus: false
//     The default behaviour (refetch every time the tab regains focus)
//     fights navigation perf – every time you cmd-tab back into the
//     app, every mounted SWR hook fires. For our data shape (vestings
//     don't change second-to-second) that's pure cost. Background
//     refresh via refreshInterval on the specific hooks that need it.
//
//   keepPreviousData: true
//     When a key changes (e.g. user pivots a filter), KEEP rendering
//     the previous result until the new one arrives. Removes the
//     "everything blank, then everything fills in" flash.
//
//   revalidateIfStale: true (default)
//     If we have stale data, render it instantly AND kick off a
//     background revalidate. This is the load-bearing default for
//     "click a tab → see data immediately, refreshed quietly."
//
// Errors and edge cases:
//   - onError logs to console; we don't show a toast at the provider
//     level because each consumer renders its own error UI shape.
//   - The fetcher defaults to a JSON GET with credentials: "include"
//     so iron-session cookies travel – this is what every existing
//     dashboard SWR call already does manually.
// ─────────────────────────────────────────────────────────────────────────────

import { SWRConfig } from "swr";
import type { ReactNode } from "react";

async function defaultFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    // Mirror what the existing per-page fetchers do – throw with the
    // status, so SWR knows to swallow the result and surface error state.
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function DashboardSwrProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher:           defaultFetcher,
        dedupingInterval:  60_000,
        revalidateOnFocus: false,
        keepPreviousData:  true,
        onError: (err) => {
          // Don't log AbortErrors – those happen when SWR cancels in-flight
          // requests during nav. Useful telemetry would be a real fetch
          // failure (HTTP 5xx, network), which carries an HTTP-prefixed message.
          if (err instanceof Error && err.message.startsWith("HTTP ")) {
            console.warn("[swr]", err.message);
          }
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
