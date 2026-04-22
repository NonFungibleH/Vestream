"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/components/VestingDemo.tsx
//
// Interactive 15-minute vesting demo widget. Drops into the /demo page.
// Works in both simulation mode (no env vars) and Sepolia mode — the UI is
// identical; only the server decides. In Sepolia mode, links to Etherscan
// for the claim tx + vesting contract appear automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef } from "react";

interface DemoVestingState {
  sessionId:      string | null;
  mode:           "simulation" | "sepolia";
  active:         boolean;
  startMs:        number | null;
  endMs:          number | null;
  remainingSec:   number;
  progress:       number;
  tokenSymbol:    string;
  tokenDecimals:  number;
  total:          string;
  vested:         string;
  claimableNow:   string;
  withdrawn:      string;
  locked:         string;
  vestingAddress: string | null;
  lastClaimTx:    string | null;
  explorerUrl:    string | null;
}

// Format a stringified bigint as a decimal, 2 dp.
function fmtAmount(raw: string | bigint, decimals: number): string {
  const bn = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = bn / base;
  const frac  = bn % base;
  const fracStr = (frac * 100n / base).toString().padStart(2, "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${wholeStr}.${fracStr}`;
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export function VestingDemo() {
  const [state, setState]   = useState<DemoVestingState | null>(null);
  const [loading, setLoad]  = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [claiming, setClaim] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── API wrappers ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res  = await fetch("/api/demo/status", { cache: "no-store" });
      const body = await res.json();
      if (body.ok) setState(body.state);
    } catch {
      // Silent poll failures are fine — next tick will recover
    }
  }, []);

  const startDemo = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      const res  = await fetch("/api/demo/start", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to start demo");
      setState(body.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start demo");
    } finally {
      setLoad(false);
    }
  }, []);

  const claim = useCallback(async () => {
    setClaim(true);
    setError(null);
    try {
      const res  = await fetch("/api/demo/claim", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Claim failed");
      setState(body.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaim(false);
    }
  }, []);

  const reset = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      setState(null);
      await fetchStatus();
    } finally {
      setLoad(false);
    }
  }, [fetchStatus]);

  // Initial load
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Poll every 2s while active
  useEffect(() => {
    if (!state?.active) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatus, 2_000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [state?.active, fetchStatus]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const isActive = !!state?.active;
  const isDone   = isActive && state!.remainingSec <= 0;
  const claimable = state ? BigInt(state.claimableNow) : 0n;

  return (
    <div
      className="rounded-3xl p-6 md:p-8"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 10px 40px rgba(37,99,235,0.08)",
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{
              background: "rgba(37,99,235,0.08)",
              color: "#2563eb",
              border: "1px solid rgba(37,99,235,0.18)",
            }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#2563eb" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#2563eb" }} />
            </span>
            Live · {state?.mode === "sepolia" ? "Sepolia on-chain" : "Simulated"}
          </div>
          <h3 className="text-xl md:text-2xl font-bold" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            15-minute vesting demo
          </h3>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            1,000 {state?.tokenSymbol || "DEMO"} unlock linearly. Claim anytime — gas-free.
          </p>
        </div>

        {isActive && (
          <button
            onClick={reset}
            disabled={loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              color: "#64748b",
              background: "rgba(0,0,0,0.03)",
              border: "1px solid rgba(0,0,0,0.07)",
            }}
          >
            Reset demo
          </button>
        )}
      </div>

      {/* Not started yet */}
      {!isActive && (
        <div className="text-center py-10">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(124,58,237,0.1))" }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
          <button
            onClick={startDemo}
            disabled={loading}
            className="text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-150 hover:opacity-90 disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            {loading ? "Starting…" : "Start the demo →"}
          </button>
          <p className="text-xs mt-4" style={{ color: "#94a3b8" }}>
            No wallet or signup required. Your session lives in a cookie.
          </p>
        </div>
      )}

      {/* Active demo */}
      {state && isActive && (
        <>
          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs mb-2" style={{ color: "#64748b" }}>
              <span className="font-medium">{isDone ? "Fully vested" : `${fmtDuration(state.remainingSec)} until fully vested`}</span>
              <span className="font-mono">{Math.round(state.progress * 100)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
              <div
                className="h-full rounded-full transition-all duration-300 ease-linear"
                style={{
                  width: `${Math.max(1, state.progress * 100)}%`,
                  background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat
              label="Total"
              value={`${fmtAmount(state.total, state.tokenDecimals)} ${state.tokenSymbol}`}
              tint="#64748b"
            />
            <Stat
              label="Vested"
              value={`${fmtAmount(state.vested, state.tokenDecimals)} ${state.tokenSymbol}`}
              tint="#2563eb"
            />
            <Stat
              label="Claimed"
              value={`${fmtAmount(state.withdrawn, state.tokenDecimals)} ${state.tokenSymbol}`}
              tint="#10b981"
            />
            <Stat
              label="Locked"
              value={`${fmtAmount(state.locked, state.tokenDecimals)} ${state.tokenSymbol}`}
              tint="#94a3b8"
            />
          </div>

          {/* Claim button + claimable badge */}
          <div className="flex items-center justify-between flex-wrap gap-4 pt-4" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#94a3b8" }}>
                Available to claim now
              </div>
              <div className="text-2xl font-bold font-mono" style={{ color: "#0f172a" }}>
                {fmtAmount(state.claimableNow, state.tokenDecimals)} {state.tokenSymbol}
              </div>
            </div>

            <button
              onClick={claim}
              disabled={claiming || claimable === 0n}
              className="text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-150 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: claimable === 0n
                  ? "rgba(0,0,0,0.05)"
                  : "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: claimable === 0n ? "#94a3b8" : "white",
                boxShadow: claimable === 0n ? "none" : "0 4px 20px rgba(37,99,235,0.3)",
              }}
            >
              {claiming ? "Claiming…" : claimable === 0n ? "Nothing to claim yet" : `Claim ${state.tokenSymbol}`}
            </button>
          </div>

          {/* Etherscan links (Sepolia only) */}
          {(state.explorerUrl || state.lastClaimTx) && (
            <div className="mt-5 pt-4 flex flex-wrap gap-4 text-xs" style={{ borderTop: "1px solid rgba(0,0,0,0.06)", color: "#64748b" }}>
              {state.explorerUrl && (
                <a href={state.explorerUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#2563eb" }}>
                  View contract on Etherscan ↗
                </a>
              )}
              {state.lastClaimTx && (
                <a
                  href={`https://sepolia.etherscan.io/tx/${state.lastClaimTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline font-mono"
                  style={{ color: "#10b981" }}
                >
                  Latest claim tx: {state.lastClaimTx.slice(0, 10)}…
                </a>
              )}
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div
          className="mt-4 px-4 py-3 rounded-xl text-sm"
          style={{ background: "rgba(220,38,38,0.06)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.18)" }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.05)" }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "#94a3b8" }}>
        {label}
      </div>
      <div className="text-sm font-mono font-semibold truncate" style={{ color: tint }}>
        {value}
      </div>
    </div>
  );
}
