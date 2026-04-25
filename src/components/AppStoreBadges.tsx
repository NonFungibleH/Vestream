// src/components/AppStoreBadges.tsx
// ─────────────────────────────────────────────────────────────────────────────
// App Store and Google Play download badges. These are visual reproductions
// styled to match Apple and Google's published badge guidelines — dark pill,
// platform mark on the left, small "Download on the" / "GET IT ON" caption
// above a larger "App Store" / "Google Play" wordmark.
//
// These are NOT the official trademark badge files. Apple provides SVG
// badges at https://developer.apple.com/app-store/marketing/guidelines/
// and Google at https://play.google.com/intl/en_us/badges/ — when the real
// app-store listings go live, download those .svg files into public/badges/
// and swap the inline SVG in this component for <img> tags. Keeping this as
// code until then avoids a placeholder-asset round-trip.
//
// Placeholder hrefs are in the constants below; once the live App Store and
// Google Play URLs exist, edit APP_STORE_URL and GOOGLE_PLAY_URL.
// ─────────────────────────────────────────────────────────────────────────────

const APP_STORE_URL    = "https://apps.apple.com/app/vestream/id0000000000";
const GOOGLE_PLAY_URL  = "https://play.google.com/store/apps/details?id=io.vestream.app";

interface Props {
  /** Centre-align the pair (default) or leave the alignment to the parent. */
  align?: "center" | "start";
  /** Adds a small "Coming soon" ribbon corner when the stores haven't approved yet. */
  comingSoon?: boolean;
}

export function AppStoreBadges({ align = "center", comingSoon = false }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${align === "center" ? "justify-center" : ""}`}
    >
      <StoreBadge
        href={APP_STORE_URL}
        label="Download on the App Store"
        caption="Download on the"
        wordmark="App Store"
        icon={<AppleLogo />}
        comingSoon={comingSoon}
      />
      <StoreBadge
        href={GOOGLE_PLAY_URL}
        label="Get it on Google Play"
        caption="GET IT ON"
        wordmark="Google Play"
        icon={<PlayLogo />}
        comingSoon={comingSoon}
      />
    </div>
  );
}

// ── Pill button ─────────────────────────────────────────────────────────────

interface BadgeProps {
  href:       string;
  label:      string;
  caption:    string;
  wordmark:   string;
  icon:       React.ReactNode;
  comingSoon: boolean;
}

function StoreBadge({ href, label, caption, wordmark, icon, comingSoon }: BadgeProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="relative inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all hover:opacity-90 hover:-translate-y-0.5"
      style={{
        background: "#000",
        border: "1px solid rgba(255,255,255,0.12)",
        minWidth: 148,
      }}
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

      {comingSoon && (
        <span
          className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
          style={{
            background: "linear-gradient(135deg, #C47A1A, #B3322E)",
            color: "white",
            boxShadow: "0 2px 6px rgba(245,158,11,0.4)",
          }}
        >
          Soon
        </span>
      )}
    </a>
  );
}

// ── Brand marks (single-colour white, inline for self-containment) ──────────

function AppleLogo() {
  // Canonical Apple logo path, simplified. Used under fair-use context-of-use
  // for pointing at the App Store — swap for the official badge asset when
  // trademark-compliant badges are available.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style={{ color: "white" }}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.39.07 2.35.82 3.15.85.82-.08 2.43-.99 4.1-.84 1.01.08 3.86.41 5.7 3.14-4.84 2.69-4.07 8.64.05 10.71zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function PlayLogo() {
  // Google Play triangle. Approximates the four-colour brand mark with a
  // simpler single-fill gradient for in-button use — the official logo has
  // four colour bands that don't render well at small sizes on a black pill.
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <defs>
        <linearGradient id="gplay-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00D7FE" />
          <stop offset="1" stopColor="#00A0E1" />
        </linearGradient>
        <linearGradient id="gplay-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FFCE00" />
          <stop offset="1" stopColor="#FFEA00" />
        </linearGradient>
        <linearGradient id="gplay-c" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FF3A44" />
          <stop offset="1" stopColor="#C31162" />
        </linearGradient>
        <linearGradient id="gplay-d" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#00A071" />
          <stop offset="1" stopColor="#00F076" />
        </linearGradient>
      </defs>
      {/* Four triangular quadrants that form the Google Play logo. */}
      <path d="M3.5 2.8v18.4c0 .3.3.5.6.3l10.4-6-4-4L3.5 2.8z" fill="url(#gplay-a)" />
      <path d="M20.1 11.2l-3.4-2-3.2 3 3.2 3 3.4-2c.9-.5.9-1.6 0-2.1z" fill="url(#gplay-b)" />
      <path d="M14.5 15.5l-4 4 6.2-3.6-2.2-2.4z" fill="url(#gplay-c)" />
      <path d="M14.5 8.5l2.2-2.4L10.5 2.5l4 4z" fill="url(#gplay-d)" />
    </svg>
  );
}
