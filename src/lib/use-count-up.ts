"use client";

// src/lib/use-count-up.ts
// ─────────────────────────────────────────────────────────────────────────────
// Animate a number from its previous value to a new target (easeOutCubic).
// Used on dashboard headline figures so big USD/claim/token totals count up
// on first paint instead of snapping from "…"/0. Client-only (rAF based).
//
//   const animated = useCountUp(totalUsd);
//   <span>{formatUsd(animated)}</span>
//
// First mount animates 0 → target; later target changes animate from the
// last shown value. Respects prefers-reduced-motion (jumps straight to the
// target). Pass durationMs to tune.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, durationMs = 750): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(target) ? target : 0;

    // Reduced-motion or no-op → jump.
    const reduce = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || from === to) {
      fromRef.current = to;
      setVal(to);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return val;
}
