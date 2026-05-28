// /login — QR-based desktop sign-in for the Pro-tier dashboard.
//
// Flow (matches the Phase 2 pairing endpoints):
//   1. Page mount → POST /api/auth/desktop-pair/init → mints a UUID code,
//      starts a 5-min TTL clock.
//   2. Render the code as a QR + show step-by-step instructions for the
//      user's mobile app.
//   3. Poll GET /api/auth/desktop-pair/poll?code=… every 2s.
//      - "waiting" → keep polling, update the countdown.
//      - "confirmed" → server has set our iron-session cookie. Redirect
//        to /dashboard.
//      - "expired" → start over (fetch a fresh code, re-render QR).
//
// Replaces the legacy email-OTP login. Email/password auth is no longer
// available for desktop — only Pro-tier users with the mobile app can
// reach the dashboard.

"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";

type Status = "loading" | "waiting" | "confirmed" | "expired" | "error";

const POLL_INTERVAL_MS = 2_000;
const PAIRING_TTL_MS   = 5 * 60 * 1000;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
  }, []);
  return isMobile;
}

export default function LoginPage() {
  const [status,   setStatus]   = useState<Status>("loading");
  const [code,     setCode]     = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState<number>(300);
  const isMobile = useIsMobile();

  // useRef so the interval handles survive re-renders without spawning
  // duplicate timers.
  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireTimer = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const tickTimer   = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (pollTimer.current)   clearInterval(pollTimer.current);
    if (expireTimer.current) clearTimeout(expireTimer.current);
    if (tickTimer.current)   clearInterval(tickTimer.current);
    pollTimer.current = null;
    expireTimer.current = null;
    tickTimer.current = null;
  }

  async function startPairing() {
    clearTimers();
    setStatus("loading");
    setError(null);
    setSecsLeft(300);

    try {
      const res = await fetch("/api/auth/desktop-pair/init", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "Could not start pairing");
        setStatus("error");
        return;
      }
      const body = await res.json() as { code: string; ttlSeconds: number };
      setCode(body.code);
      setStatus("waiting");

      // Hard expire after the TTL.
      expireTimer.current = setTimeout(() => {
        setStatus("expired");
        clearTimers();
      }, PAIRING_TTL_MS);

      // 1Hz countdown.
      tickTimer.current = setInterval(() => {
        setSecsLeft((s) => Math.max(0, s - 1));
      }, 1_000);

      // Polling loop. Two-state machine: stays in "waiting" until the
      // mobile app confirms (→ 200 confirmed → redirect) or the code
      // expires server-side (→ 410 → show retry button).
      pollTimer.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/auth/desktop-pair/poll?code=${body.code}`);
          if (r.status === 410) {
            setStatus("expired");
            clearTimers();
            return;
          }
          if (!r.ok) return; // transient — keep polling
          const data = await r.json() as { status: string; redirect?: string };
          if (data.status === "confirmed" && data.redirect) {
            setStatus("confirmed");
            clearTimers();
            // Tiny delay so the success state flashes for a beat —
            // reads as "done" instead of an unexplained reload.
            setTimeout(() => { window.location.href = data.redirect!; }, 600);
          }
        } catch {
          // network blip — keep polling, no need to surface
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setStatus("error");
    }
  }

  useEffect(() => {
    startPairing();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ttlLabel = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`;

  return (
    <main className="min-h-screen flex flex-col" style={{ background: "#F5F5F3" }}>
      {/* Slim nav — just logo. Login page is a focused single-column. */}
      <nav className="flex items-center justify-between px-6 md:px-8 h-16 bg-white"
        style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7" />
          <span className="font-bold" style={{ color: "#1A1D20" }}>Vestream</span>
        </Link>
        <Link href="/" className="text-sm font-medium" style={{ color: "#8B8E92" }}>
          Back to home
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-10 md:py-16">
        <div className="w-full max-w-md">
          {/* Heading */}
          <div className="text-center mb-6 md:mb-8">
            <img src="/logo-icon.svg" alt="" className="w-12 h-12 mx-auto mb-4" />
            <h1 className="text-2xl md:text-3xl font-bold mb-2"
              style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
              Sign in to dashboard
            </h1>
            <p className="text-sm md:text-base" style={{ color: "#8B8E92" }}>
              Scan the code below from the Vestream app on your phone.
            </p>
          </div>

          {/* Mobile: deep link card instead of QR (can't scan your own screen) */}
          {isMobile && code && status === "waiting" && (
            <div className="rounded-2xl p-6 mb-5 text-center"
              style={{ background: "white", border: "1px solid rgba(28,184,184,0.25)", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
                style={{ background: "rgba(28,184,184,0.1)" }}>
                📱
              </div>
              <h2 className="text-base font-bold mb-1" style={{ color: "#1A1D20" }}>
                Open in Vestream app
              </h2>
              <p className="text-sm mb-4" style={{ color: "#5C6066", lineHeight: 1.5 }}>
                Tap the button below to open the Vestream app. It will automatically confirm this session and log you in here.
              </p>
              <a
                href={`vestream://desktop-pair?code=${code}`}
                className="block w-full py-3 rounded-xl text-sm font-bold text-white text-center transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}>
                Open in Vestream →
              </a>
              <p className="text-xs mt-3" style={{ color: "#B8BABD" }}>
                Code expires in <span className="font-mono font-semibold">{`${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, "0")}`}</span>
                {" · "}
                <button onClick={startPairing} className="underline">refresh</button>
              </p>
              <p className="text-xs mt-2" style={{ color: "#B8BABD" }}>
                Waiting for confirmation… This page will redirect automatically when you open the app.
              </p>
            </div>
          )}

          {/* QR card — shown on desktop, or mobile when no code yet */}
          {(!isMobile || !code || status !== "waiting") && (
          <div
            className="rounded-2xl p-6 md:p-8 mb-5"
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.07)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
            }}
          >
            <div
              className="aspect-square w-full rounded-xl flex items-center justify-center mb-4"
              style={{ background: "#F5F5F3" }}
            >
              {status === "loading" && (
                <div className="flex flex-col items-center gap-3" style={{ color: "#8B8E92" }}>
                  <Spinner />
                  <span className="text-sm">Generating code…</span>
                </div>
              )}

              {status === "waiting" && code && (
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeSVG
                    value={`vestream://desktop-pair?code=${code}`}
                    size={224}
                    level="M"
                    fgColor="#1A1D20"
                    bgColor="#FFFFFF"
                  />
                </div>
              )}

              {status === "confirmed" && (
                <div className="flex flex-col items-center gap-3" style={{ color: "#0F8A8A" }}>
                  <CheckIcon />
                  <span className="text-sm font-semibold">Signed in — redirecting…</span>
                </div>
              )}

              {status === "expired" && (
                <div className="flex flex-col items-center gap-3 text-center px-4" style={{ color: "#8B8E92" }}>
                  <span className="text-sm font-medium" style={{ color: "#1A1D20" }}>
                    Code expired
                  </span>
                  <span className="text-xs">
                    Codes are valid for 5 minutes. Click below to get a new one.
                  </span>
                </div>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center gap-3 text-center px-4" style={{ color: "#8B8E92" }}>
                  <span className="text-sm font-medium" style={{ color: "#1A1D20" }}>
                    Couldn&apos;t generate a code
                  </span>
                  <span className="text-xs">{error ?? "Try again in a moment."}</span>
                </div>
              )}
            </div>

            {/* TTL countdown — only while waiting */}
            {status === "waiting" && (
              <div className="text-center text-xs" style={{ color: "#B8BABD" }}>
                Code expires in <span className="font-mono font-semibold">{ttlLabel}</span>
              </div>
            )}

            {/* Retry CTA — only after expiry / error */}
            {(status === "expired" || status === "error") && (
              <button
                onClick={startPairing}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "#1CB8B8" }}
              >
                Get a new code
              </button>
            )}
          </div>
          )} {/* end desktop QR card */}

          {/* Step-by-step instructions */}
          <div
            className="rounded-2xl p-5 md:p-6"
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#0F8A8A" }}>
              How it works
            </p>
            <ol className="flex flex-col gap-3 text-sm" style={{ color: "#374151" }}>
              <li className="flex items-start gap-3">
                <Step n={1} />
                <span>Open the Vestream app on your phone (iOS / Android).</span>
              </li>
              <li className="flex items-start gap-3">
                <Step n={2} />
                <span>Tap <strong>Settings → Connect Desktop</strong>.</span>
              </li>
              <li className="flex items-start gap-3">
                <Step n={3} />
                <span>Point the camera at the QR code above.</span>
              </li>
            </ol>
          </div>

          {/* "I don't have the app yet" fallback — for users who hit /login
              via search or shared link without the mobile app installed.
              Without this they were dead-ended at the QR card. The fallback
              card surfaces the two real paths (try the free scanner, or get
              the app) before the smaller "see plans" footnote. */}
          <div
            className="rounded-2xl p-5 md:p-6 mt-5"
            style={{
              background: "rgba(28,184,184,0.05)",
              border: "1px solid rgba(28,184,184,0.20)",
            }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: "#1A1D20" }}>
              Don&apos;t have the app yet?
            </p>
            <p className="text-xs mb-4" style={{ color: "#5C6066", lineHeight: 1.55 }}>
              The web dashboard is part of the Pro plan. The mobile app is how you subscribe and how you sign desktop sessions in. Try the free scanner first if you want to see what Vestream finds in your wallet — no install needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href="/find-vestings"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "white", border: "1px solid rgba(28,184,184,0.25)", color: "#0F8A8A" }}
              >
                Try the free scanner →
              </Link>
              <Link
                href="/#download"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.25)" }}
              >
                Get the app →
              </Link>
            </div>
          </div>

          {/* Pricing footnote */}
          <p className="text-center text-xs mt-5" style={{ color: "#8B8E92", lineHeight: 1.55 }}>
            Web dashboard is included with the <strong style={{ color: "#1CB8B8" }}>Pro</strong> plan ($9.99/mo or $74.99/year — 14-day trial). <Link href="/#pricing" className="font-semibold underline" style={{ color: "#1CB8B8" }}>See plans</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
      <path d="M7 12.5l3.5 3.5L17 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
      style={{
        background: "rgba(28,184,184,0.10)",
        color: "#0F8A8A",
      }}
    >
      {n}
    </span>
  );
}
