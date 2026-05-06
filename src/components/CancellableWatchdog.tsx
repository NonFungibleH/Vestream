"use client";

// CancellableWatchdog
// ─────────────────────────────────────────────────────────────────────────────
// Surfaces an aggregate warning at the top of the dashboard whenever the
// user has one or more vesting streams that the issuer can cancel.
//
// Why this exists: Sablier, Hedgey, Superfluid, Streamflow, and Team Finance
// all support "cancellable" vests where the sender can revoke unvested tokens
// at any time. Recipients often don't know their vest is cancellable until
// it gets cancelled. The dashboard already shows a column-level "Cancellable
// Yes/No" badge, but that's column 10 of a horizontally-scrolling table —
// invisible on mobile and easy to miss on desktop. This component pushes
// the same information to the top of the page where it can't be missed.
//
// Behaviour:
//   - Renders only when ≥1 stream has `cancelable === true`
//   - Lists the affected token symbols inline ("NOVA, FLUX, VEST")
//   - Linkable to the row in the table for inspection
//   - Dismissible — but only for the current session (sessionStorage),
//     since this is a real risk and we don't want users to dismiss-forever
//     and miss a cancellation later when their list of cancellable streams
//     changes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import type { VestingStream } from "@/lib/vesting/normalize";

const STORAGE_KEY = "vestream-cancellable-watchdog-dismissed";

interface Props {
  streams: VestingStream[];
}

export function CancellableWatchdog({ streams }: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch { /* sessionStorage disabled — keep visible */ }
  }, []);

  // Filter to actively cancellable streams that aren't fully vested yet
  // (a fully-vested cancellable stream can't actually have its unvested
  //  portion clawed back — there's nothing left to cancel).
  const cancellable = streams.filter(
    (s) => s.cancelable === true && !s.isFullyVested,
  );

  if (cancellable.length === 0 || dismissed) return null;

  // Distinct token symbols, sorted by total locked amount (rough proxy for
  // user-perceived "biggest at-risk position first").
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

  function dismiss() {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      style={{
        background:    "linear-gradient(135deg, rgba(245,158,11,0.10), rgba(179,50,46,0.04))",
        border:        "1px solid rgba(245,158,11,0.35)",
        borderRadius:  14,
        padding:       "12px 16px",
        marginBottom:  16,
        display:       "flex",
        alignItems:    "center",
        gap:           12,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 32, height: 32, borderRadius: 10,
          background: "rgba(245,158,11,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--preview-text)", lineHeight: 1.3, marginBottom: 2 }}>
          {cancellable.length} cancellable vest{cancellable.length === 1 ? "" : "s"} in your portfolio
        </div>
        <div style={{ fontSize: 11, color: "var(--preview-text-2)", lineHeight: 1.4 }}>
          The issuer can revoke your unvested tokens at any time on{" "}
          <span style={{ fontWeight: 600 }}>{symbolLine}</span>. TokenVest alerts you the moment a cancellation hits the chain.
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss for this session"
        style={{
          width: 26, height: 26, borderRadius: 8,
          border: "none", background: "rgba(0,0,0,0.04)", cursor: "pointer",
          color: "var(--preview-text-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, padding: 0,
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
