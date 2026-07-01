"use client";

// CancellableWatchdog
// ─────────────────────────────────────────────────────────────────────────────
// Compact "some of your vests are cancellable" warning – a small amber chip
// that sits in the Vesting Schedules table header. Hover (or keyboard-focus)
// reveals the detail: which tokens are at risk and what cancellable means.
//
// Why this exists: Sablier, Hedgey, Superfluid, Streamflow all support
// "cancellable" vests where the sender can revoke unvested tokens at any time.
// Recipients often don't realise their vest is cancellable. The table has a
// per-row "Cancellable Yes/No" column, but it's far right on a horizontally-
// scrolling table – easy to miss. This chip surfaces the same signal at the
// top of the table without the heavy full-width banner it used to be (which
// the user flagged as too prominent for what is, most days, ambient context).
//
// Behaviour:
//   - Renders only when ≥1 stream is cancellable AND not yet fully vested
//     (a fully-vested cancellable stream has nothing left to claw back).
//   - Compact chip showing the count; full message on hover/focus.
// ─────────────────────────────────────────────────────────────────────────────

import type { VestingStream } from "@/lib/vesting/normalize";

interface Props {
  streams: VestingStream[];
}

export function CancellableWatchdog({ streams }: Props) {
  // Actively cancellable = issuer can still revoke unvested tokens.
  const cancellable = streams.filter(
    (s) => s.cancelable === true && !s.isFullyVested,
  );
  if (cancellable.length === 0) return null;

  // Distinct token symbols, biggest locked position first (rough proxy).
  const symbolMap = new Map<string, bigint>();
  for (const s of cancellable) {
    const sym = s.tokenSymbol || "?";
    let locked = 0n;
    try { locked = BigInt(s.lockedAmount || "0"); } catch { /* ignore */ }
    symbolMap.set(sym, (symbolMap.get(sym) ?? 0n) + locked);
  }
  const symbols = [...symbolMap.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([sym]) => sym);
  const headlineSymbols = symbols.slice(0, 3).join(", ");
  const moreCount = symbols.length - 3;
  const symbolLine = moreCount > 0 ? `${headlineSymbols} + ${moreCount} more` : headlineSymbols;

  return (
    // `group` + `group-hover`/`group-focus-within` drives the tooltip with no
    // JS state. tabIndex makes the chip keyboard-focusable so the detail is
    // reachable without a mouse.
    <div className="relative group flex-shrink-0">
      <div
        tabIndex={0}
        role="button"
        aria-label={`${cancellable.length} cancellable vesting position${cancellable.length === 1 ? "" : "s"} – issuer can revoke unvested tokens`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-default outline-none"
        style={{
          background:  "rgba(245,158,11,0.12)",
          border:      "1px solid rgba(245,158,11,0.35)",
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-[11px] font-semibold" style={{ color: "#b45309" }}>
          {cancellable.length} cancellable
        </span>
      </div>

      {/* Tooltip – hidden until hover/focus. Right-aligned so it doesn't
          overflow the viewport on the right edge of the table header. */}
      <div
        role="tooltip"
        className="hidden group-hover:block group-focus-within:block absolute right-0 top-full mt-2 z-20"
        style={{ width: 260 }}
      >
        <div
          className="rounded-xl p-3 text-left"
          style={{
            background:   "var(--preview-card, #fff)",
            border:       "1px solid rgba(245,158,11,0.35)",
            boxShadow:    "0 8px 28px rgba(0,0,0,0.12)",
          }}
        >
          <div className="text-[12px] font-bold mb-1" style={{ color: "var(--preview-text)" }}>
            {cancellable.length} cancellable vest{cancellable.length === 1 ? "" : "s"}
          </div>
          <div className="text-[11px]" style={{ color: "var(--preview-text-2)", lineHeight: 1.45 }}>
            The issuer can revoke your unvested tokens at any time on{" "}
            <span style={{ fontWeight: 600 }}>{symbolLine}</span>. Vestream alerts you the moment a cancellation hits the chain.
          </div>
        </div>
      </div>
    </div>
  );
}
