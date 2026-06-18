"use client";

// Thin top-of-viewport progress bar for in-app navigations. The dashboard is
// force-dynamic, so every filter/sort/page click is a server round-trip — and
// Next's loading.tsx only shows on FULL loads, not soft same-route navigations
// (changing ?page=/?sort= etc.). Without feedback those clicks feel "frozen"
// even when the query is ~40ms. This bar starts on any in-app link click and
// completes when the URL settles, so interactions FEEL instant.
//
// Dependency-free: a capture-phase click listener detects same-origin <a>
// navigations (covers every <Link> — pills, sort headers, pagination, lenses,
// tabs); a pathname+search effect finishes the bar when navigation lands.

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const key = `${pathname}?${search}`;
  const [phase, setPhase] = useState<"idle" | "active" | "done">("idle");
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // URL settled → finish, then fade out.
  useEffect(() => {
    setPhase((p) => (p === "active" ? "done" : p));
    settleTimer.current = setTimeout(() => setPhase("idle"), 250);
    return () => clearTimeout(settleTimer.current);
  }, [key]);

  // Start on any same-origin link click (not new-tab / modified clicks).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || a.target === "_blank") return;
      try {
        const url = new URL(a.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname + url.search === location.pathname + location.search) return; // same URL → no nav
        setPhase("active");
      } catch { /* ignore */ }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (phase === "idle") return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed", top: 0, left: 0, height: 2, zIndex: 100,
        width: phase === "done" ? "100%" : "92%",
        background: "#0F8A8A",
        boxShadow: "0 0 8px rgba(15,138,138,0.6)",
        opacity: phase === "done" ? 0 : 1,
        transition: phase === "done"
          ? "width 0.15s ease, opacity 0.25s ease 0.15s"
          : "width 8s cubic-bezier(0.1, 0.7, 0.1, 1)",
      }}
    />
  );
}
