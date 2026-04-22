"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/components/VestingDemo.tsx
//
// Interactive vesting demo widget. Drops into the /demo page.
//
// Visitors customise token symbol, amount, and duration before starting — the
// progress bar, stats grid, and push notifications all reflect their chosen
// schedule so the demo feels like "their programme".
//
// Works in both simulation mode (no env vars) and Sepolia mode — the UI is
// identical; only the server decides. In Sepolia mode the on-chain contract
// is the source of truth and custom config is ignored. Links to Etherscan
// for the claim tx + vesting contract appear automatically.
//
// The widget also lets visitors opt in to web-push notifications for each
// 25%/50%/75%/100% milestone — proving the push feature end-to-end without
// asking them to install an app. See `PushAlertCard` below.
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

// ─── Custom config ──────────────────────────────────────────────────────────
// Presets cover the 99% case (NOVA / 1000 / 15 min); free-text inputs handle
// the rest. Validation matches the server-side guards in /api/demo/start.

interface DemoConfig {
  /** 1–10 uppercase letters/digits. */
  tokenSymbol: string;
  /** Whole tokens (not base units). Server multiplies by 10^18. */
  totalAmount: string;
  /** Seconds, 60–3600. */
  durationSec: number;
}

const DEFAULT_CONFIG: DemoConfig = {
  tokenSymbol: "NOVA",
  totalAmount: "1000",
  durationSec: 15 * 60,
};

const TOKEN_PRESETS = ["NOVA", "FLUX", "VEST", "KLAR"] as const;
const AMOUNT_PRESETS: { label: string; value: string }[] = [
  { label: "1K",   value: "1000"    },
  { label: "10K",  value: "10000"   },
  { label: "100K", value: "100000"  },
  { label: "1M",   value: "1000000" },
];
const DURATION_PRESETS: { label: string; value: number }[] = [
  { label: "5 min",  value: 5  * 60 },
  { label: "15 min", value: 15 * 60 },
  { label: "1 hour", value: 60 * 60 },
];

function formatAmountPreview(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
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
  const [state, setState]    = useState<DemoVestingState | null>(null);
  const [loading, setLoad]   = useState(false);
  const [error, setError]    = useState<string | null>(null);
  const [claiming, setClaim] = useState(false);
  const [config, setConfig]  = useState<DemoConfig>(DEFAULT_CONFIG);
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
      // Client-side mirror of server validation — surface errors early.
      const sym = config.tokenSymbol.trim().toUpperCase();
      if (!/^[A-Z0-9]{1,10}$/.test(sym)) {
        throw new Error("Token symbol must be 1–10 letters or digits.");
      }
      const amountNum = Math.floor(Number(config.totalAmount));
      if (!Number.isFinite(amountNum) || amountNum < 1 || amountNum > 1_000_000_000) {
        throw new Error("Amount must be between 1 and 1,000,000,000.");
      }
      if (!Number.isInteger(config.durationSec) || config.durationSec < 60 || config.durationSec > 3600) {
        throw new Error("Duration must be 60–3600 seconds.");
      }

      // Convert whole tokens → 18-decimal base units.
      const totalBase = (BigInt(amountNum) * 10n ** 18n).toString();

      const res  = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenSymbol: sym,
          totalAmount: totalBase,
          durationSec: config.durationSec,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to start demo");
      setState(body.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start demo");
    } finally {
      setLoad(false);
    }
  }, [config]);

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
            {isActive
              ? `Your ${state!.tokenSymbol} vesting is live`
              : "Design your vesting schedule"}
          </h3>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {isActive
              ? "Linear unlock in real time. Claim anytime — gas-free."
              : "Name the token, pick the amount and duration, and watch it vest."}
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

      {/* Not started yet — show config form */}
      {!isActive && (
        <DemoConfigForm
          config={config}
          setConfig={setConfig}
          onStart={startDemo}
          loading={loading}
        />
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

          {/* Push alert opt-in — shown once an active demo is running */}
          <PushAlertCard sessionId={state.sessionId} />

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

// ─── Config form ─────────────────────────────────────────────────────────────
//
// Rendered before the demo starts. Lets the visitor pick token / amount /
// duration via presets + free-text inputs. Validation mirrors the server-side
// guards so the Start button is only enabled for a valid combo.

function DemoConfigForm({
  config,
  setConfig,
  onStart,
  loading,
}: {
  config: DemoConfig;
  setConfig: (c: DemoConfig) => void;
  onStart: () => void;
  loading: boolean;
}) {
  const symTrimmed   = config.tokenSymbol.trim().toUpperCase();
  const symError     = !/^[A-Z0-9]{1,10}$/.test(symTrimmed);
  const amountNum    = Number(config.totalAmount);
  const amountError  = !Number.isFinite(amountNum) || amountNum < 1 || amountNum > 1_000_000_000;
  const durationOk   = Number.isInteger(config.durationSec) && config.durationSec >= 60 && config.durationSec <= 3600;
  const canStart     = !symError && !amountError && durationOk;

  const durationLabel = (() => {
    const m = Math.round(config.durationSec / 60);
    return m === 60 ? "1 hour" : m >= 60 ? `${(m / 60).toFixed(1)} hours` : `${m} min`;
  })();

  return (
    <div className="py-4">
      {/* Live preview pill — tells the visitor exactly what they'll see */}
      <div className="mb-6 flex items-center justify-center">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
          style={{
            background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.06))",
            border: "1px solid rgba(37,99,235,0.2)",
            color: "#1e40af",
          }}
        >
          <span style={{ color: "#64748b" }}>Preview:</span>
          <span className="font-mono" style={{ color: "#0f172a" }}>
            {formatAmountPreview(config.totalAmount)} {symTrimmed || "—"}
          </span>
          <span style={{ color: "#94a3b8" }}>over</span>
          <span className="font-mono" style={{ color: "#0f172a" }}>{durationLabel}</span>
        </div>
      </div>

      <div className="space-y-6 max-w-md mx-auto">
        {/* Token symbol */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748b" }}>
            Token symbol
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {TOKEN_PRESETS.map((t) => {
              const active = symTrimmed === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setConfig({ ...config, tokenSymbol: t })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors"
                  style={{
                    background: active ? "rgba(37,99,235,0.1)" : "rgba(0,0,0,0.03)",
                    color:      active ? "#2563eb" : "#64748b",
                    border: active
                      ? "1px solid rgba(37,99,235,0.3)"
                      : "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={config.tokenSymbol}
            onChange={(e) =>
              setConfig({
                ...config,
                tokenSymbol: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
              })
            }
            maxLength={10}
            placeholder="NOVA"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.1)", color: "#0f172a" }}
          />
          {symError && (
            <p className="text-xs mt-1" style={{ color: "#dc2626" }}>
              1–10 uppercase letters or digits.
            </p>
          )}
        </div>

        {/* Total amount */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748b" }}>
            Total amount
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {AMOUNT_PRESETS.map((p) => {
              const active = config.totalAmount === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setConfig({ ...config, totalAmount: p.value })}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: active ? "rgba(37,99,235,0.1)" : "rgba(0,0,0,0.03)",
                    color:      active ? "#2563eb" : "#64748b",
                    border: active
                      ? "1px solid rgba(37,99,235,0.3)"
                      : "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1_000_000_000}
              step={1}
              value={config.totalAmount}
              onChange={(e) => setConfig({ ...config, totalAmount: e.target.value })}
              className="w-full px-3 py-2 pr-20 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{ background: "white", border: "1px solid rgba(0,0,0,0.1)", color: "#0f172a" }}
            />
            <div
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold"
              style={{ color: "#94a3b8" }}
            >
              {symTrimmed || "—"}
            </div>
          </div>
          {amountError && (
            <p className="text-xs mt-1" style={{ color: "#dc2626" }}>
              Between 1 and 1,000,000,000.
            </p>
          )}
        </div>

        {/* Duration */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#64748b" }}>
            Vesting duration
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_PRESETS.map((p) => {
              const active = config.durationSec === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setConfig({ ...config, durationSec: p.value })}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: active ? "rgba(37,99,235,0.1)" : "rgba(0,0,0,0.03)",
                    color:      active ? "#2563eb" : "#64748b",
                    border: active
                      ? "1px solid rgba(37,99,235,0.3)"
                      : "1px solid rgba(0,0,0,0.05)",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: "#94a3b8" }}>
            You&rsquo;ll get a push at 25%, 50%, 75% and 100% of this window.
          </p>
        </div>

        <button
          onClick={onStart}
          disabled={loading || !canStart}
          className="w-full text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-150 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            color: "white",
            boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
          }}
        >
          {loading ? "Starting…" : `Start my ${symTrimmed || "vesting"} schedule →`}
        </button>
        <p className="text-xs text-center" style={{ color: "#94a3b8" }}>
          No wallet or signup. Your session lives in a cookie.
        </p>
      </div>
    </div>
  );
}

// ─── Push alerts ─────────────────────────────────────────────────────────────
//
// Anonymous web-push subscription scoped to the current demo session cookie.
// On click:
//   1. Register /sw.js service worker (idempotent — browser dedupes)
//   2. Request `Notification` permission
//   3. Subscribe via pushManager with our VAPID public key
//   4. POST the subscription to /api/demo/push/subscribe along with the
//      demo session id — the server mirrors the demo timeline so the cron
//      can fire 25/50/75/100% milestone pushes even after the tab closes.
//
// iOS caveat: Apple only delivers web push to PWAs that have been added to
// the Home Screen (16.4+). We surface that caveat inline so iOS users know
// what to do.

type PushStatus = "idle" | "unsupported" | "requesting" | "subscribing" | "subscribed" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = typeof atob === "function" ? atob(b64) : "";
  // Allocate a plain ArrayBuffer so the resulting view satisfies
  // ArrayBufferView<ArrayBuffer> (required by PushManager.subscribe in TS 5.7+).
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function isIOSSafariWebkit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPhone/iPad/iPod — iPad on iPadOS 13+ reports as Mac, so also check touch
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  return iOS;
}

function PushAlertCard({ sessionId }: { sessionId: string | null }) {
  const [status, setStatus] = useState<PushStatus>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Detect capability + already-subscribed state on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSw   = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNote = "Notification" in window;
    if (!hasSw || !hasPush || !hasNote) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    // Best-effort check: is there already an active subscription?
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      if (!reg) return;
      const existing = await reg.pushManager.getSubscription();
      if (existing && Notification.permission === "granted") setStatus("subscribed");
    }).catch(() => { /* noop */ });
  }, []);

  const subscribe = useCallback(async () => {
    setErrMsg(null);

    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) {
      setStatus("error");
      setErrMsg("Push is not configured on this deployment.");
      return;
    }
    if (!sessionId) {
      setStatus("error");
      setErrMsg("Start the demo before subscribing to alerts.");
      return;
    }

    try {
      setStatus("requesting");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "idle");
        return;
      }

      setStatus("subscribing");
      const reg = await navigator.serviceWorker.register("/sw.js");
      // Wait for activation so pushManager is usable
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      }

      const res = await fetch("/api/demo/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);

      setStatus("subscribed");
    } catch (e) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Could not enable push.");
    }
  }, [sessionId]);

  // ── Render branches ───────────────────────────────────────────────────────
  if (status === "unsupported") {
    return (
      <div className="mt-5 pt-4 text-xs" style={{ borderTop: "1px solid rgba(0,0,0,0.06)", color: "#94a3b8" }}>
        Push alerts aren&rsquo;t supported in this browser. Try Chrome, Edge, or iOS Safari (after adding to Home Screen).
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div
        className="mt-5 rounded-xl p-4 flex items-start gap-3"
        style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.22)" }}
      >
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(16,185,129,0.12)", color: "#059669" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#065f46" }}>
            Push alerts enabled on this device
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#047857" }}>
            You&rsquo;ll get a notification at each milestone: 25%, 50%, 75%, 100%.
          </div>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div
        className="mt-5 rounded-xl p-4"
        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.22)", color: "#92400e" }}
      >
        <div className="text-sm font-semibold mb-1">Notifications blocked</div>
        <div className="text-xs">
          Your browser is blocking notifications for this site. Enable them in your site settings, then refresh to opt in.
        </div>
      </div>
    );
  }

  const busy = status === "requesting" || status === "subscribing";

  return (
    <div
      className="mt-5 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.2)" }}
    >
      <div className="min-w-0 flex items-start gap-3">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(37,99,235,0.12)", color: "#2563eb" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: "#0f172a" }}>
            Get a real push alert at every milestone
          </div>
          <div className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            One-tap opt-in — no account, no email. You&rsquo;ll feel the pings land at 25%, 50%, 75% and 100%.
            {isIOSSafariWebkit() && (
              <span className="block mt-1" style={{ color: "#d97706" }}>
                iPhone: add Vestream to your Home Screen first (Share → Add to Home Screen) for push.
              </span>
            )}
          </div>
          {errMsg && (
            <div className="text-xs mt-1" style={{ color: "#b91c1c" }}>{errMsg}</div>
          )}
        </div>
      </div>

      <button
        onClick={subscribe}
        disabled={busy || !sessionId}
        className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "linear-gradient(135deg, #2563eb, #7c3aed)",
          color: "white",
          boxShadow: "0 4px 14px rgba(37,99,235,0.25)",
        }}
      >
        {busy ? "Enabling…" : "🔔 Enable alerts"}
      </button>
    </div>
  );
}
