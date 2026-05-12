"use client";

// src/app/developer/account/BillingPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Tier-aware billing CTA:
//
//   - Free key  → "Upgrade to Pro" button + monthly/annual selector. Click
//                 hits /api/billing/checkout and browser-redirects to the
//                 Stripe-hosted Checkout page.
//   - Pro key   → "Manage subscription" button. Click hits
//                 /api/billing/portal and browser-redirects to the Stripe
//                 Customer Portal where the user can update payment
//                 method, view invoices, cancel.
//
// Reads `?upgrade=success` and `?upgrade=cancelled` query params (set by
// the Checkout success_url / cancel_url) to flash a one-shot status
// message on return — no toast library, no client routing magic.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface Props {
  tier: string;
  /** Server-side: are all four Stripe env vars set? When false, we hide
   *  the live Checkout flow and show a "coming soon" card instead so the
   *  user gets clear messaging during the period where Stripe account
   *  verification is still pending. */
  billingReady: boolean;
}

export function BillingPanel({ tier, billingReady }: Props) {
  const params = useSearchParams();
  const [plan,    setPlan]    = useState<"monthly" | "annual">("monthly");
  const [status,  setStatus]  = useState<"idle" | "loading" | "error">("idle");
  const [error,   setError]   = useState("");
  const [flash,   setFlash]   = useState<"success" | "cancelled" | null>(null);

  // Flash success/cancel messages on return from Stripe.
  useEffect(() => {
    const upgrade = params.get("upgrade");
    if (upgrade === "success" || upgrade === "cancelled") {
      setFlash(upgrade);
    }
  }, [params]);

  async function startCheckout() {
    setStatus("loading");
    setError("");
    try {
      const r = await fetch(`/api/billing/checkout?plan=${plan}`, { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data.url) {
        setError(data.error ?? "Couldn't start checkout.");
        setStatus("error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  async function openPortal() {
    setStatus("loading");
    setError("");
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data.url) {
        setError(data.error ?? "Couldn't open portal.");
        setStatus("error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  // ── Pro key: manage subscription ───────────────────────────────────────
  if (tier === "pro" || tier === "fund") {
    return (
      <div className="rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.04))",
                 border:    "1px solid rgba(28,184,184,0.25)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}>
            {tier === "fund" ? "Fund" : "Pro"}
          </span>
          <p className="text-sm font-bold" style={{ color: "white" }}>You&rsquo;re on Pro</p>
        </div>
        <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          120 req/min burst · 5,000 req/day · webhook subscriptions enabled. Manage payment method,
          view invoices, or cancel via the Stripe portal.
        </p>
        {error && <ErrorBox message={error} />}
        <button
          onClick={openPortal}
          type="button"
          disabled={status === "loading"}
          className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }}
        >
          {status === "loading" ? "Opening portal…" : "Manage subscription →"}
        </button>
      </div>
    );
  }

  // ── Free tier — Stripe still being verified (early-access waitlist) ──
  // Until all four STRIPE_* env vars land in production, we show a "coming
  // soon" card with a contact path so users know online card payments
  // aren't broken — they're just not live yet. Pro tier in the meantime
  // is granted manually for early-access users (we flip the apiKeys.tier
  // column directly).
  if (!billingReady) {
    return (
      <div className="rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, #122040, #0a1628)",
                 border:    "1px solid rgba(255,255,255,0.10)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}>
            Coming soon
          </span>
        </div>
        <h3 className="text-lg font-bold mb-1.5" style={{ color: "white" }}>
          Pro tier · online payments coming soon
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
          We&rsquo;re finishing payment-processor verification with our provider. In the meantime,
          if you need Pro limits — <strong style={{ color: "white" }}>5,000 requests/day plus webhook
          subscriptions</strong> — drop us an email and we&rsquo;ll provision it manually for early-access users.
        </p>
        <div className="rounded-xl p-4 mb-4"
          style={{ background: "rgba(28,184,184,0.06)", border: "1px solid rgba(28,184,184,0.18)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#1CB8B8" }}>
            What you get on Pro
          </p>
          <ul className="text-xs space-y-1" style={{ color: "rgba(255,255,255,0.65)" }}>
            <li>• 120 req/min burst (4× the free tier)</li>
            <li>• 5,000 req/day (33× the free tier)</li>
            <li>• Webhook subscriptions — push alerts on matching unlocks</li>
            <li>• Higher monthly quota and priority support</li>
          </ul>
        </div>
        <a
          href="mailto:team@vestream.io?subject=TokenVest%20Pro%20-%20early%20access"
          className="block w-full text-center text-sm font-bold py-3 rounded-xl transition-all hover:opacity-90"
          style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}
        >
          Reach out for early-access Pro →
        </a>
        <p className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
          We&rsquo;ll notify you the moment self-serve Stripe checkout goes live.
        </p>
      </div>
    );
  }

  // ── Free key: live upgrade CTA ────────────────────────────────────────
  return (
    <div className="rounded-2xl p-6"
      style={{ background: "linear-gradient(135deg, #122040, #0a1628)",
               border:    "1px solid rgba(28,184,184,0.30)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1CB8B8" }}>
          Upgrade
        </span>
      </div>
      <h3 className="text-lg font-bold mb-1.5" style={{ color: "white" }}>
        Move to Pro for production traffic
      </h3>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
        Pro lifts your cap to <strong style={{ color: "white" }}>5,000 requests/day</strong> and unlocks{" "}
        <strong style={{ color: "white" }}>webhook subscriptions</strong> — server-to-server alerts the
        moment a matching unlock fires. 14-day free trial, cancel any time.
      </p>

      {flash === "success" && (
        <div className="mb-4 px-3 py-2.5 rounded-lg flex items-center gap-2"
          style={{ background: "rgba(45,179,106,0.10)", border: "1px solid rgba(45,179,106,0.25)" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2DB36A" strokeWidth={2.4}>
            <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.85)" }}>
            Payment confirmed. Your tier should refresh momentarily — reload this page if you don&rsquo;t see Pro yet.
          </p>
        </div>
      )}
      {flash === "cancelled" && (
        <div className="mb-4 px-3 py-2.5 rounded-lg"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            Checkout cancelled. You&rsquo;re still on the free tier — start again any time.
          </p>
        </div>
      )}

      {/* Plan picker */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <PlanButton
          active={plan === "monthly"}
          onClick={() => setPlan("monthly")}
          label="Monthly"
          price="$9.99"
          per="/mo"
        />
        <PlanButton
          active={plan === "annual"}
          onClick={() => setPlan("annual")}
          label="Annual"
          price="$74.99"
          per="/yr"
          tag="Save ~37%"
        />
      </div>

      {error && <ErrorBox message={error} />}

      <button
        onClick={startCheckout}
        type="button"
        disabled={status === "loading"}
        className="w-full text-sm font-bold py-3 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
        style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.35)" }}
      >
        {status === "loading" ? "Opening Stripe…" : "Upgrade to Pro →"}
      </button>
      <p className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.35)" }}>
        14-day free trial · Stripe Checkout · cancel any time
      </p>
    </div>
  );
}

function PlanButton({
  active, onClick, label, price, per, tag,
}: {
  active: boolean;
  onClick: () => void;
  label:   string;
  price:   string;
  per:     string;
  tag?:    string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="text-left p-3 rounded-xl transition-all"
      style={{
        background: active ? "rgba(28,184,184,0.10)" : "rgba(255,255,255,0.04)",
        border:     active ? "1px solid rgba(28,184,184,0.40)" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
        style={{ color: active ? "#1CB8B8" : "rgba(255,255,255,0.4)" }}>
        {label}
        {tag && (
          <span className="ml-1.5 normal-case font-semibold tracking-normal text-[9px]" style={{ color: "#2DB36A" }}>
            · {tag}
          </span>
        )}
      </p>
      <p className="text-base font-bold" style={{ color: "white" }}>
        {price}
        <span className="text-xs font-medium ml-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{per}</span>
      </p>
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-xs px-3 py-2 mb-3 rounded-lg"
      style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.20)" }}>
      {message}
    </p>
  );
}
