"use client";

// src/app/status/StatusAutoRefresh.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Tiny zero-render client island that hits router.refresh() every 60s.
//
// Pattern choice: router.refresh() (Next.js App Router) over <meta http-
// equiv="refresh">. Two reasons:
//
//   1. Preserves scroll position. The matrix is long; meta-refresh would
//      jump the user back to the top every minute, which is hostile UX
//      for ops who are reading a specific row.
//   2. No full document reload. Next streams the new server-rendered
//      output and patches the React tree – no flash of empty content.
//
// The server work behind each refresh is cheap: loadStatusData() in
// page.tsx is wrapped in unstable_cache(60s), so most refreshes return
// from the cached snapshot without a DB round-trip.
//
// Pause-when-tab-hidden: visibility change listener stops the interval
// while the tab is backgrounded, so a wallboard left open overnight
// doesn't fire ~1440 useless refreshes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 60_000;

export function StatusAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        router.refresh();
      }, REFRESH_INTERVAL_MS);
    };

    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Re-fetch immediately when the user returns to the tab – they
        // probably want to know the current state right now, not after
        // up to 60s of waiting.
        router.refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
