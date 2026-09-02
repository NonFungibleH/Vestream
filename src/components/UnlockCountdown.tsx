"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Live countdown to a token's next unlock.
//
// Every competitor surface (CoinGecko, Tokenomist, DropsTab) puts a ticking
// clock on the next unlock, and it's the single cheapest way to make a
// schedule feel live rather than archival. Server-rendered pages can't tick,
// so this is a tiny client island.
//
// Renders nothing until mounted, so the server HTML and the first client paint
// agree (a server-rendered "2d 04h" would be wrong by the time it painted, and
// React would flag the mismatch). The surrounding server component keeps the
// absolute date visible, so the page is still complete with JS disabled and
// crawlers still get a real date.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

function parts(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3_600),
    m: Math.floor((s % 3_600) / 60),
    s: s % 60,
  };
}

export function UnlockCountdown({
  unlockTimeSec,
  color = "#0F8A8A",
  compact = false,
}: {
  /** Unix seconds of the next unlock. */
  unlockTimeSec: number;
  color?: string;
  /**
   * Inline single-line form ("2d 14h 30m"), for dense contexts like the
   * /unlocks table where the four stacked D/H/M/S cells would blow the row
   * height out. Drops to "14h 30m 12s" inside a day so the seconds are
   * visible exactly when they are worth watching.
   */
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now == null) return null;                       // pre-mount: server markup stands

  const msLeft = unlockTimeSec * 1000 - now;
  if (msLeft <= 0) {
    return (
      <span className="text-xs font-semibold whitespace-nowrap" style={{ color }}>
        Unlocking now
      </span>
    );
  }

  const { d, h, m, s } = parts(msLeft);

  if (compact) {
    const text = d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s`;
    return (
      <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color }}>
        {text}
      </span>
    );
  }

  const cells: [number, string][] = [[d, "D"], [h, "H"], [m, "M"], [s, "S"]];

  return (
    <div className="inline-flex items-center gap-1.5" aria-label={`Next unlock in ${d} days ${h} hours ${m} minutes`}>
      {cells.map(([v, unit]) => (
        <span
          key={unit}
          className="inline-flex flex-col items-center px-2 py-1 rounded-lg tabular-nums"
          style={{ background: `${color}14`, border: `1px solid ${color}2b`, minWidth: 38 }}
        >
          <span className="text-sm font-bold leading-none" style={{ color }}>
            {String(v).padStart(2, "0")}
          </span>
          <span className="text-[9px] font-semibold mt-0.5" style={{ color: "#8B8E92" }}>{unit}</span>
        </span>
      ))}
    </div>
  );
}
