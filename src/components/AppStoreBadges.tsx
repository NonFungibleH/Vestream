"use client";

// src/components/AppStoreBadges.tsx
// ─────────────────────────────────────────────────────────────────────────────
// App Store + Google Play download badges.
//
// PRIMARY: the official badge artwork served from /public/badges/. Apple and
// Google both publish ready-made badges (correct logo + "Download on the App
// Store" / "Get it on Google Play" lockups) — using their files is the only
// brand-guideline-compliant option. Drop them in:
//     public/badges/app-store.svg     (Apple — https://developer.apple.com/app-store/marketing/guidelines/#section-badges)
//     public/badges/google-play.png   (Google — https://play.google.com/intl/en_us/badges/)
// See public/badges/README.md.
//
// FALLBACK: if an official file is missing (404s), each badge gracefully falls
// back to an inline re-creation so the page never shows a broken image.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

const APP_STORE_URL   = "https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=io.vestream.app";

// Render height for both badges. The official files carry their own internal
// padding so matching the height visually balances the pair.
const BADGE_HEIGHT = 48;

interface Props {
  /** Centre-align the pair (default) or leave the alignment to the parent. */
  align?: "center" | "start";
}

export function AppStoreBadges({ align = "center" }: Props) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${align === "center" ? "justify-center" : ""}`}>
      <StoreBadge
        href={APP_STORE_URL}
        label="Download on the App Store"
        badgeSrc="/badges/app-store.svg"
        caption="Download on the"
        wordmark="App Store"
        icon={<AppleLogo />}
      />
      <StoreBadge
        href={GOOGLE_PLAY_URL}
        label="Get it on Google Play"
        badgeSrc="/badges/google-play.png"
        caption="GET IT ON"
        wordmark="Google Play"
        icon={<PlayLogo />}
      />
    </div>
  );
}

interface BadgeProps {
  href:     string;
  label:    string;
  badgeSrc: string;
  caption:  string;
  wordmark: string;
  icon:     React.ReactNode;
}

function StoreBadge({ href, label, badgeSrc, caption, wordmark, icon }: BadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="inline-flex transition-all hover:opacity-90 hover:-translate-y-0.5"
    >
      {!imgFailed ? (
        // Official store-badge artwork (public/badges/). eslint-disable-next-line
        // because Next's <Image> isn't worth the config for a tiny static badge.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badgeSrc}
          alt={label}
          height={BADGE_HEIGHT}
          style={{ height: BADGE_HEIGHT, width: "auto", display: "block" }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        // Fallback re-creation if the official file is missing — never shows a
        // broken image. Replace by adding the real files to public/badges/.
        <span
          className="relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
          style={{ background: "#000", border: "1px solid rgba(255,255,255,0.12)", minWidth: 148 }}
        >
          <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[10px] font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.78)" }}>
              {caption}
            </span>
            <span className="text-[15px] font-semibold tracking-tight" style={{ color: "white", letterSpacing: "-0.01em" }}>
              {wordmark}
            </span>
          </span>
        </span>
      )}
    </a>
  );
}

// ── Inline fallback brand marks (only render if the official file is missing) ─

function AppleLogo() {
  return (
    <svg viewBox="0 0 384 512" width="17" height="21" fill="currentColor" style={{ color: "white" }} aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function PlayLogo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="22" aria-hidden="true">
      <path d="M4 3 L12 7.2 L12 12 L4 12 Z"   fill="#00A0FF" />
      <path d="M12 7.2 L21 12 L12 12 Z"        fill="#FF3D47" />
      <path d="M4 12 L12 12 L12 16.8 L4 21 Z"  fill="#00DE76" />
      <path d="M12 12 L21 12 L12 16.8 Z"       fill="#FFCE00" />
    </svg>
  );
}
