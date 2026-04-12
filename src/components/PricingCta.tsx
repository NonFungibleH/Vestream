"use client";

import { useState } from "react";
import Link from "next/link";

interface PricingCtaProps {
  /** Stripe price ID to POST to checkout. Omit to render a plain link instead. */
  priceId?: string;
  /** Button label */
  label: string;
  /** Fallback href — used when priceId is not supplied (Free plan / Fund contact) */
  href?: string;
  /** Tailwind + inline style classNames forwarded to the <button>/<a> element */
  className?: string;
  style?: React.CSSProperties;
}

export default function PricingCta({
  priceId,
  label,
  href,
  className,
  style,
}: PricingCtaProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plain link — Free tier CTA or Fund contact link
  if (!priceId) {
    return (
      <Link href={href ?? "/early-access"} className={className} style={style}>
        {label}
      </Link>
    );
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });

      if (!res.ok) {
        throw new Error("checkout_failed");
      }

      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error("no_url");

      window.location.href = data.url;
    } catch {
      setError("Something went wrong — try again");
      setLoading(false);
    }
  }

  return (
    <div style={{ width: "100%" }}>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={className}
        style={{
          ...style,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.75 : 1,
          border: "none",
          width: "100%",
        }}
      >
        {loading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <svg
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
              style={{ animation: "spin 0.7s linear infinite" }}
            >
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity={0.3} strokeWidth="2" />
              <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Redirecting…
          </span>
        ) : (
          label
        )}
      </button>
      {error && (
        <p
          style={{
            color: "#ef4444",
            fontSize: "12px",
            marginTop: "6px",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}
      {/* Inline keyframe for the spinner — avoids an external CSS dependency */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
