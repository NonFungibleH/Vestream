"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/components/InteractiveDemo.tsx
//
// Three-step interactive walkthrough that mimics the full Vestream product flow:
//   1. Find   — animated scan across the 7 supported protocols
//   2. Alert  — mock phone frame with dashboard + push notification
//   3. Claim  — mock Sablier-style protocol UI, claim button, tx success
//
// Purely client-side (no API). The user advances steps themselves, with tight
// auto-animations inside each step. ~60–90 seconds end-to-end, not 15 minutes.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO_WALLET = "0x3f5CE3d2Fa4B9d8E7f5a6B2c1d8E7f5a6B2c18b2e";
const DEMO_WALLET_SHORT = "0x3f5C...8b2e";

// 7 protocols scanned in parallel; only 1 has a match in our fake result set
const PROTOCOLS = [
  { id: "sablier",      name: "Sablier",       hit: true,  count: 1 },
  { id: "hedgey",       name: "Hedgey",        hit: false, count: 0 },
  { id: "uncx",         name: "UNCX",          hit: false, count: 0 },
  { id: "unvest",       name: "Unvest",        hit: false, count: 0 },
  { id: "team-finance", name: "Team Finance",  hit: false, count: 0 },
  { id: "superfluid",   name: "Superfluid",    hit: false, count: 0 },
  { id: "pinksale",     name: "PinkSale",      hit: false, count: 0 },
] as const;

// The single fake stream surfaced across all three steps
const STREAM = {
  protocol:    "Sablier",
  token:       "NOVA",
  chain:       "Ethereum",
  totalAmount: 12_000,
  claimable:   4_200,
  vested:      7_800,
  percent:     65,
  unlockInHrs: 24,
};

type Step = "scan" | "alert" | "claim";
type ScanPhase = "idle" | "pinging" | "done";
type AlertPhase = "list" | "pushed" | "detail";
type ClaimPhase = "idle" | "wallet" | "pending" | "success";

// ── Component ────────────────────────────────────────────────────────────────
export function InteractiveDemo() {
  const [step, setStep] = useState<Step>("scan");

  // Scan sub-state
  const [scanPhase, setScanPhase]   = useState<ScanPhase>("idle");
  const [scanCursor, setScanCursor] = useState(-1); // -1 = not started, 7 = finished
  const scanTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Alert sub-state
  const [alertPhase, setAlertPhase] = useState<AlertPhase>("list");
  const alertTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Claim sub-state
  const [claimPhase, setClaimPhase] = useState<ClaimPhase>("idle");

  // Helpers
  const clearTimers = (ref: React.MutableRefObject<ReturnType<typeof setTimeout>[]>) => {
    ref.current.forEach(clearTimeout);
    ref.current = [];
  };

  // ── Scan animation ──────────────────────────────────────────────────────────
  const runScan = useCallback(() => {
    setScanPhase("pinging");
    setScanCursor(-1);
    clearTimers(scanTimers);

    // Stagger each protocol ping ~320ms apart
    PROTOCOLS.forEach((_, i) => {
      const t = setTimeout(() => setScanCursor(i), 120 + i * 320);
      scanTimers.current.push(t);
    });
    const doneT = setTimeout(() => {
      setScanCursor(PROTOCOLS.length);
      setScanPhase("done");
    }, 120 + PROTOCOLS.length * 320 + 100);
    scanTimers.current.push(doneT);
  }, []);

  // ── Alert animation (push notification slide-in) ───────────────────────────
  useEffect(() => {
    if (step !== "alert") return;
    setAlertPhase("list");
    clearTimers(alertTimers);
    const pushT = setTimeout(() => setAlertPhase("pushed"), 1400);
    alertTimers.current.push(pushT);
    return () => clearTimers(alertTimers);
  }, [step]);

  // Cleanup all timers on unmount
  useEffect(() => () => { clearTimers(scanTimers); clearTimers(alertTimers); }, []);

  // Simulated wallet-confirm → pending → success
  const onConfirmTx = () => {
    setClaimPhase("pending");
    setTimeout(() => setClaimPhase("success"), 1800);
  };

  // Reset demo to start
  const resetDemo = () => {
    clearTimers(scanTimers);
    clearTimers(alertTimers);
    setScanPhase("idle");
    setScanCursor(-1);
    setAlertPhase("list");
    setClaimPhase("idle");
    setStep("scan");
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 10px 40px rgba(37,99,235,0.08)",
      }}
    >
      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* Step content */}
      <div className="p-6 md:p-8 min-h-[440px]">
        {step === "scan" && (
          <ScanStep
            phase={scanPhase}
            cursor={scanCursor}
            onStart={runScan}
            onNext={() => setStep("alert")}
          />
        )}
        {step === "alert" && (
          <AlertStep
            phase={alertPhase}
            onTapNotification={() => setAlertPhase("detail")}
            onNext={() => setStep("claim")}
          />
        )}
        {step === "claim" && (
          <ClaimStep
            phase={claimPhase}
            onStartClaim={() => setClaimPhase("wallet")}
            onConfirmTx={onConfirmTx}
            onReset={resetDemo}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step indicator ─────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "scan",  label: "1. Find" },
    { id: "alert", label: "2. Get alerted" },
    { id: "claim", label: "3. Claim" },
  ];
  const currentIndex = steps.findIndex((s) => s.id === step);

  return (
    <div
      className="flex items-center justify-between px-6 md:px-8 py-4 gap-2"
      style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", background: "rgba(248,250,252,0.5)" }}
    >
      {steps.map((s, i) => {
        const isActive   = i === currentIndex;
        const isComplete = i < currentIndex;
        return (
          <div key={s.id} className="flex items-center gap-2 flex-1">
            <div
              className="flex items-center gap-2 transition-colors"
              style={{ color: isActive ? "#2563eb" : isComplete ? "#10b981" : "#94a3b8" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, #2563eb, #7c3aed)"
                    : isComplete
                    ? "#10b981"
                    : "rgba(148,163,184,0.15)",
                  color: (isActive || isComplete) ? "white" : "#94a3b8",
                  boxShadow: isActive ? "0 0 0 4px rgba(37,99,235,0.15)" : "none",
                }}
              >
                {isComplete ? "✓" : i + 1}
              </div>
              <span className="text-xs md:text-sm font-semibold whitespace-nowrap">
                {s.label.replace(/^\d+\.\s/, "")}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-1"
                style={{ background: isComplete ? "#10b981" : "rgba(148,163,184,0.2)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Scan ──────────────────────────────────────────────────────────
function ScanStep({
  phase, cursor, onStart, onNext,
}: {
  phase: ScanPhase;
  cursor: number;
  onStart: () => void;
  onNext:  () => void;
}) {
  const foundCount = PROTOCOLS.filter((p) => p.hit && PROTOCOLS.indexOf(p) < cursor).reduce((s, p) => s + p.count, 0);

  return (
    <div>
      {/* Wallet header */}
      <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.05)" }}>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <rect x="2" y="6" width="20" height="14" rx="2"/>
            <path d="M2 10h20"/>
          </svg>
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>
            Scanning wallet
          </div>
          <div className="text-sm font-mono font-semibold" style={{ color: "#0f172a" }}>
            {DEMO_WALLET_SHORT}
          </div>
        </div>
        {phase === "done" && (
          <div className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}>
            {foundCount} {foundCount === 1 ? "stream" : "streams"} found
          </div>
        )}
      </div>

      {/* Intro / Protocols list */}
      {phase === "idle" && (
        <div className="text-center py-12">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(124,58,237,0.1))" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
          </div>
          <h3 className="text-lg md:text-xl font-bold mb-2" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            Scan a wallet across every vesting protocol
          </h3>
          <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "#64748b", lineHeight: 1.55 }}>
            We&rsquo;ll ping Sablier, Hedgey, UNCX, Unvest, Team&nbsp;Finance, Superfluid and PinkSale in parallel &mdash; across Ethereum, BNB, Polygon and Base.
          </p>
          <button
            onClick={onStart}
            className="text-sm font-semibold px-6 py-3 rounded-xl transition-all duration-150 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            Start the scan →
          </button>
        </div>
      )}

      {phase !== "idle" && (
        <div>
          <ul className="space-y-1.5 mb-6">
            {PROTOCOLS.map((p, i) => {
              const isPinging = i === cursor;
              const isDone    = i < cursor;
              const isQueued  = i > cursor;
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-colors"
                  style={{
                    background: isPinging ? "rgba(37,99,235,0.05)" : "transparent",
                    border: "1px solid " + (isPinging ? "rgba(37,99,235,0.2)" : "transparent"),
                  }}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isQueued && <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#cbd5e1" }} />}
                    {isPinging && (
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                    )}
                    {isDone && p.hit && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    {isDone && !p.hit && (
                      <span className="text-[11px] font-semibold" style={{ color: "#cbd5e1" }}>—</span>
                    )}
                  </div>

                  <span
                    className="font-medium flex-1"
                    style={{ color: isPinging ? "#0f172a" : isDone ? (p.hit ? "#0f172a" : "#94a3b8") : "#cbd5e1" }}
                  >
                    {p.name}
                  </span>

                  <span className="text-xs" style={{
                    color: isPinging ? "#2563eb" : isDone ? (p.hit ? "#059669" : "#94a3b8") : "#cbd5e1",
                    fontWeight: isDone && p.hit ? 600 : 400,
                  }}>
                    {isPinging && "Checking…"}
                    {isDone && p.hit   && `${p.count} stream${p.count === 1 ? "" : "s"} found`}
                    {isDone && !p.hit  && "No streams"}
                    {isQueued && "Queued"}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Found-stream card + Next */}
          {phase === "done" && (
            <div>
              <div
                className="rounded-xl p-4 mb-5 flex items-center gap-4"
                style={{
                  background: "linear-gradient(135deg, rgba(37,99,235,0.05), rgba(124,58,237,0.05))",
                  border: "1px solid rgba(37,99,235,0.15)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-white text-[11px]"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                >
                  NOVA
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs mb-0.5" style={{ color: "#64748b" }}>
                    Sablier · Ethereum
                  </div>
                  <div className="text-sm font-semibold truncate" style={{ color: "#0f172a" }}>
                    {STREAM.totalAmount.toLocaleString()} NOVA · {STREAM.percent}% vested
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>
                    Claimable
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: "#059669" }}>
                    {STREAM.claimable.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs" style={{ color: "#64748b" }}>
                  Scan took <span className="font-semibold">2.3s</span>. In the real product, this triggers a push alert.
                </p>
                <button
                  onClick={onNext}
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 hover:opacity-90 whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                    color: "white",
                    boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
                  }}
                >
                  See it in the app →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Alert (mock phone) ─────────────────────────────────────────────
function AlertStep({
  phase, onTapNotification, onNext,
}: {
  phase: AlertPhase;
  onTapNotification: () => void;
  onNext: () => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8 items-center">
      {/* Copy column */}
      <div className="md:col-span-2 order-2 md:order-1">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-3"
          style={{ background: "rgba(16,185,129,0.1)", color: "#059669" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#10b981" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#10b981" }} />
          </span>
          Live monitoring
        </div>
        <h3 className="text-lg md:text-xl font-bold mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
          Get alerted the moment your tokens unlock
        </h3>
        <p className="text-sm mb-5" style={{ color: "#64748b", lineHeight: 1.55 }}>
          Vestream watches every stream 24/7. When tokens vest, you get an instant push alert &mdash; before your wallet app even knows.
        </p>

        <ul className="space-y-2.5 text-sm mb-5" style={{ color: "#475569" }}>
          <Bullet>Instant push notifications</Bullet>
          <Bullet>Email alerts for every unlock</Bullet>
          <Bullet>Lock-screen widget for the next event</Bullet>
        </ul>

        {phase === "detail" && (
          <button
            onClick={onNext}
            className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all duration-150 hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
            }}
          >
            Claim your tokens →
          </button>
        )}
        {phase !== "detail" && (
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            {phase === "list" ? "Waiting for an unlock event…" : "Tap the notification →"}
          </p>
        )}
      </div>

      {/* Phone frame column */}
      <div className="md:col-span-3 order-1 md:order-2 flex justify-center">
        <PhoneFrame>
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 py-3 text-[11px] font-semibold" style={{ color: "#0f172a" }}>
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <svg width="14" height="10" viewBox="0 0 14 10" fill="#0f172a"><rect x="0" y="4" width="2" height="6" rx="0.5"/><rect x="4" y="2" width="2" height="8" rx="0.5"/><rect x="8" y="0" width="2" height="10" rx="0.5"/></svg>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="#0f172a" strokeWidth="1.5"><rect x="1" y="1" width="10" height="8" rx="1.5"/><rect x="3" y="3" width="6" height="4" fill="#0f172a"/><rect x="12" y="3" width="1.5" height="4" rx="0.5" fill="#0f172a"/></svg>
            </span>
          </div>

          {/* App header */}
          <div className="px-5 pt-2 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>
                  Portfolio
                </div>
                <div className="text-lg font-bold font-mono" style={{ color: "#0f172a" }}>
                  $8,412.50
                </div>
              </div>
              <div className="w-8 h-8 rounded-full" style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }} />
            </div>
          </div>

          {/* Stream card (mobile) */}
          <div className="mx-4">
            <button
              onClick={phase === "pushed" ? onTapNotification : undefined}
              disabled={phase !== "pushed"}
              className="w-full text-left rounded-2xl p-4 transition-all"
              style={{
                background: "white",
                border: "1px solid rgba(0,0,0,0.07)",
                boxShadow: phase === "detail" ? "0 0 0 2px #2563eb" : "0 1px 3px rgba(0,0,0,0.04)",
                cursor: phase === "pushed" ? "pointer" : "default",
              }}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
                >
                  NOVA
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold" style={{ color: "#0f172a" }}>NOVA</div>
                  <div className="text-[10px]" style={{ color: "#94a3b8" }}>Sablier · Ethereum</div>
                </div>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: "#d97706" }}>
                  24h
                </span>
              </div>
              <div className="h-1.5 rounded-full mb-1.5" style={{ background: "rgba(0,0,0,0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${STREAM.percent}%`, background: "linear-gradient(90deg, #2563eb, #7c3aed)" }}
                />
              </div>
              <div className="flex justify-between text-[10px]">
                <span style={{ color: "#64748b" }}>{STREAM.percent}% vested</span>
                <span className="font-semibold" style={{ color: "#059669" }}>
                  {STREAM.claimable.toLocaleString()} claimable
                </span>
              </div>
            </button>

            {phase === "detail" && (
              <div
                className="mt-3 rounded-2xl p-3 text-center"
                style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.15)" }}
              >
                <div className="text-[10px] mb-1" style={{ color: "#64748b" }}>Next unlock</div>
                <div className="text-xs font-bold" style={{ color: "#0f172a" }}>
                  4,200 NOVA &middot; in 24 hours
                </div>
              </div>
            )}
          </div>

          {/* Push notification overlay */}
          {phase === "pushed" && (
            <PushNotification onTap={onTapNotification} />
          )}
        </PhoneFrame>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span>{children}</span>
    </li>
  );
}

// ─── Phone frame wrapper ────────────────────────────────────────────────────
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[40px] p-2"
      style={{
        width: 280,
        background: "#1e293b",
        boxShadow: "0 20px 50px rgba(15,23,42,0.25), inset 0 0 0 1px rgba(255,255,255,0.1)",
      }}
    >
      <div
        className="relative rounded-[32px] overflow-hidden"
        style={{
          height: 480,
          background: "#f8fafc",
        }}
      >
        {/* Notch */}
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10"
          style={{ top: 8, width: 90, height: 22, borderRadius: 12, background: "#0f172a" }}
        />
        {children}
      </div>
    </div>
  );
}

function PushNotification({ onTap }: { onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="absolute left-2 right-2 rounded-2xl p-3 text-left transition-transform"
      style={{
        top: 40,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 10px 40px rgba(15,23,42,0.25), 0 0 0 1px rgba(0,0,0,0.04)",
        animation: "slideInFromTop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[11px] font-semibold" style={{ color: "#0f172a" }}>Vestream</span>
            <span className="text-[9px]" style={{ color: "#94a3b8" }}>now</span>
          </div>
          <div className="text-[10.5px] font-semibold mb-0.5" style={{ color: "#0f172a" }}>
            Unlock in 24 hours
          </div>
          <div className="text-[10px]" style={{ color: "#475569", lineHeight: 1.3 }}>
            4,200 NOVA on Sablier will be ready to claim tomorrow.
          </div>
        </div>
      </div>
      <style>{`
        @keyframes slideInFromTop {
          from { transform: translateY(-120%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
      `}</style>
    </button>
  );
}

// ─── Step 3: Claim (mock Sablier UI) ────────────────────────────────────────
function ClaimStep({
  phase, onStartClaim, onConfirmTx, onReset,
}: {
  phase: ClaimPhase;
  onStartClaim: () => void;
  onConfirmTx: () => void;
  onReset: () => void;
}) {
  if (phase === "success") {
    return (
      <div className="text-center py-10">
        <div
          className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: "rgba(16,185,129,0.12)" }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h3 className="text-xl md:text-2xl font-bold mb-2" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
          {STREAM.claimable.toLocaleString()} NOVA claimed
        </h3>
        <p className="text-sm mb-5" style={{ color: "#64748b" }}>
          Transaction confirmed on Ethereum. In the real product, Vestream tracks the claim and updates your portfolio instantly.
        </p>

        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl mb-8 font-mono text-xs"
          style={{ background: "#f8fafc", color: "#64748b", border: "1px solid rgba(0,0,0,0.05)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Tx: 0x8f3a…c42e
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/early-access"
            className="text-sm font-semibold px-6 py-3 rounded-xl transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
            }}
          >
            Get Vestream →
          </Link>
          <button
            onClick={onReset}
            className="text-sm font-medium px-5 py-3 rounded-xl transition-colors"
            style={{ background: "rgba(0,0,0,0.04)", color: "#475569", border: "1px solid rgba(0,0,0,0.06)" }}
          >
            Replay demo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
      {/* Copy */}
      <div className="md:col-span-2 order-2 md:order-1">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold mb-3"
          style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}
        >
          Deep-link to protocol
        </div>
        <h3 className="text-lg md:text-xl font-bold mb-3" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
          One tap to claim on the source protocol
        </h3>
        <p className="text-sm mb-4" style={{ color: "#64748b", lineHeight: 1.55 }}>
          Vestream never touches your tokens &mdash; claims happen on the protocol&rsquo;s own contract. We just surface the stream and open the claim flow for you.
        </p>
        <p className="text-xs" style={{ color: "#94a3b8" }}>
          {phase === "idle"    && "Try it →"}
          {phase === "wallet"  && "Approve the transaction in your wallet →"}
          {phase === "pending" && "Waiting for confirmation on Ethereum…"}
        </p>
      </div>

      {/* Mock Sablier UI */}
      <div className="md:col-span-3 order-1 md:order-2">
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "#0d1117",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 10px 40px rgba(15,23,42,0.2)",
          }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ background: "#1c2128", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#f85149" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#e3b341" }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#3fb950" }} />
            <div
              className="flex-1 mx-3 px-3 py-1 rounded text-[10px] font-mono"
              style={{ background: "#0d1117", color: "#8b949e", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              app.sablier.com/stream/1-1-12345
            </div>
          </div>

          {/* Sablier-style content */}
          <div className="p-5">
            {/* Stream header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
              >
                NOVA
              </div>
              <div>
                <div className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>
                  Sablier Lockup Linear
                </div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Stream #12345 &middot; Ethereum
                </div>
              </div>
            </div>

            {/* Numbers */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <SablierStat label="Total"     value={`${STREAM.totalAmount.toLocaleString()}`} />
              <SablierStat label="Vested"    value={`${STREAM.vested.toLocaleString()}`} />
              <SablierStat label="Claimable" value={`${STREAM.claimable.toLocaleString()}`} tint="#f59e0b" />
            </div>

            {/* Progress */}
            <div className="mb-5">
              <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${STREAM.percent}%`, background: "linear-gradient(90deg, #f59e0b, #ef4444)" }}
                />
              </div>
              <div className="flex justify-between text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                <span>{STREAM.percent}% vested</span>
                <span>100%</span>
              </div>
            </div>

            {/* Claim button / progress */}
            {phase === "idle" && (
              <button
                onClick={onStartClaim}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(245,158,11,0.25)",
                }}
              >
                Claim {STREAM.claimable.toLocaleString()} NOVA
              </button>
            )}
            {phase === "pending" && (
              <div
                className="flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}
              >
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Confirming transaction…
              </div>
            )}
            {phase === "wallet" && (
              <div className="py-3 rounded-xl text-center text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.1)" }}>
                Approve in your wallet (see popup →)
              </div>
            )}
          </div>
        </div>

        {/* Wallet confirmation popup */}
        {phase === "wallet" && (
          <div className="mt-4 flex justify-end">
            <WalletPopup onConfirm={onConfirmTx} />
          </div>
        )}
      </div>
    </div>
  );
}

function SablierStat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
      <div className="text-xs font-mono font-semibold" style={{ color: tint ?? "rgba(255,255,255,0.95)" }}>
        {value}
      </div>
    </div>
  );
}

function WalletPopup({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div
      className="rounded-2xl p-4 w-72"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
        animation: "popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #f97316, #eab308)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L4 7l8 5 8-5-8-5zM4 17l8 5 8-5M4 12l8 5 8-5"/></svg>
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: "#0f172a" }}>MetaMask</div>
          <div className="text-[10px]" style={{ color: "#94a3b8" }}>Ethereum mainnet</div>
        </div>
      </div>

      <div className="text-xs font-semibold mb-2" style={{ color: "#0f172a" }}>Confirm transaction</div>
      <div className="space-y-1 text-[10.5px] mb-4 font-mono" style={{ color: "#64748b" }}>
        <div className="flex justify-between"><span>Method</span><span style={{ color: "#0f172a" }}>withdraw()</span></div>
        <div className="flex justify-between"><span>Contract</span><span style={{ color: "#0f172a" }}>Sablier</span></div>
        <div className="flex justify-between"><span>Gas fee</span><span style={{ color: "#0f172a" }}>~$1.80</span></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className="py-2 text-xs font-semibold rounded-lg" style={{ background: "rgba(0,0,0,0.04)", color: "#64748b" }}>
          Reject
        </button>
        <button
          onClick={onConfirm}
          className="py-2 text-xs font-semibold rounded-lg transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}
        >
          Confirm
        </button>
      </div>
      <style>{`
        @keyframes popIn {
          from { transform: scale(0.92); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
