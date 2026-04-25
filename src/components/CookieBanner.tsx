"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "vestream-cookie-consent";

type Consent = "all" | "essential" | null;

export default function CookieBanner() {
  const [consent, setConsent] = useState<Consent | "loading">("loading");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Consent;
      setConsent(stored ?? null);
    } catch {
      setConsent(null);
    }
  }, []);

  function accept(choice: "all" | "essential") {
    try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
    setConsent(choice);
  }

  // Don't render until we know the stored preference (avoids flash)
  if (consent === "loading" || consent !== null) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
      style={{
        background: "rgba(15,23,42,0.97)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}
      role="dialog"
      aria-label="Cookie consent"
    >
      {/* Text */}
      <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
        We use essential cookies to keep you signed in and remember your preferences.
        We do not use advertising or tracking cookies.{" "}
        <Link
          href="/privacy"
          className="underline text-slate-400 hover:text-white transition-colors"
        >
          Privacy &amp; Cookie Policy
        </Link>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => accept("essential")}
          className="px-4 py-2 rounded-xl text-xs font-semibold border transition-all duration-150"
          style={{
            background: "rgba(255,255,255,0.06)",
            borderColor: "rgba(255,255,255,0.12)",
            color: "#B8BABD",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)")}
        >
          Essential only
        </button>
        <button
          onClick={() => accept("all")}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-150"
          style={{
            background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
            boxShadow: "0 2px 8px rgba(28,184,184,0.35)",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.9")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
