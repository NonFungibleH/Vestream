"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Soft paywall for public token pages (/token/[chainId]/[address]).
//
// Anonymous/free visitors get FREE_LIMIT distinct token pages, then a blurred
// "get the app" overlay. Deliberately CLIENT-SIDE so SEO is untouched:
//   - The page server-renders full content for everyone. Crawlers (which don't
//     execute JS) therefore always see the complete page — no cloaking, no
//     ranking hit, snippets intact.
//   - The view counter lives in a client cookie set via document.cookie (never
//     a Set-Cookie header), so the edge cache for /token/* stays shared and
//     warm — the cached HTML is identical for every visitor.
//   - Humans over the limit get the overlay applied post-hydration.
//
// Pro bypass: a logged-in user skips the wall entirely. The real session
// cookie (`vestr_session`) is httpOnly so client JS can't read it — checking
// for it here silently never matched, so Pro users got walled. Instead we read
// `vestr_pro`, a READABLE companion cookie the middleware sets on every
// authenticated /dashboard visit (see src/middleware.ts). Existence is a
// sufficient proxy — this is a soft marketing gate, not a data-access control
// (those live server-side on the gated APIs).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { AppStoreBadges } from "./AppStoreBadges";

const VIEW_COOKIE = "vestr_token_views";
const FREE_LIMIT  = 3;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function readViewed(): string[] {
  try {
    const m = document.cookie.match(/(?:^|; )vestr_token_views=([^;]*)/);
    if (!m) return [];
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeViewed(keys: string[]): void {
  try {
    // Cap stored keys so the cookie can't grow unbounded.
    const v = encodeURIComponent(JSON.stringify(keys.slice(-20)));
    document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  } catch {
    /* cookies disabled — visitor just won't be metered */
  }
}

function hasProSession(): boolean {
  // vestr_pro is the readable companion to the httpOnly vestr_session — set by
  // middleware for logged-in users (src/middleware.ts). httpOnly cookies aren't
  // visible to document.cookie, which is why checking vestr_session never worked.
  return /(?:^|; )vestr_pro=1/.test(document.cookie);
}

export function TokenPaywall({
  chainId,
  address,
  symbol,
}: {
  chainId: number;
  address: string;
  symbol:  string;
}) {
  const [walled, setWalled] = useState(false);

  useEffect(() => {
    if (hasProSession()) return; // Pro → unlimited, never walled.

    const key    = `${chainId}:${address.toLowerCase()}`;
    const viewed = readViewed();

    if (viewed.includes(key)) return;        // already counted → always free
    if (viewed.length >= FREE_LIMIT) {
      setWalled(true);                        // over the free limit → wall (don't count)
      return;
    }
    writeViewed([...viewed, key]);            // within limit → count + allow
  }, [chainId, address]);

  // Lock background scroll while the wall is up.
  useEffect(() => {
    if (!walled) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [walled]);

  if (!walled) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background: "rgba(248,250,252,0.72)",
      }}
    >
      <div
        className="rounded-3xl text-center"
        style={{
          maxWidth: 420, width: "100%", padding: "32px 28px",
          background: "white",
          border: "1px solid rgba(28,184,184,0.2)",
          boxShadow: "0 20px 60px rgba(15,138,138,0.18)",
        }}
      >
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
          style={{ background: "rgba(28,184,184,0.1)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="2" width="14" height="20" rx="2.5" /><line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
          You&rsquo;ve viewed your {FREE_LIMIT} free token pages
        </h2>
        <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "#64748b", lineHeight: 1.55 }}>
          Get the Vestream app to explore unlimited tokens{symbol ? `, track ${symbol},` : ""} and
          get push alerts before every unlock — free on iOS &amp; Android.
        </p>
        <AppStoreBadges align="center" />
      </div>
    </div>
  );
}
