// src/components/brand/primitives.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Compact primitives that show up on every page.
//
//   Eyebrow      — JetBrains Mono uppercase tracked, used as section label
//   HairlineRule — 1px section divider, primary section separator (§07)
//   LiveDot      — pulsing teal dot signalling currently-active state (§07)
//   LiveBadge    — pulsing dot + "Live" label, ready-made for ticker headers
//   Card         — paper surface, 1px rule border, 4px radius. NO shadow.
//   Container    — 1200px max marketing / 1440px max product (§07 grid rules)
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode, HTMLAttributes } from "react";

// ─── Eyebrow ────────────────────────────────────────────────────────────────
export function Eyebrow({
  children,
  className = "",
  style,
  tone = "default",
}: {
  children:  ReactNode;
  className?: string;
  style?:    React.CSSProperties;
  /** "default" → grey-1; "accent" → teal (live state contexts). */
  tone?:     "default" | "accent";
}) {
  return (
    <span
      className={`eyebrow ${className}`}
      style={{
        color: tone === "accent" ? "var(--teal)" : "var(--grey-1)",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── HairlineRule ───────────────────────────────────────────────────────────
export function HairlineRule({
  className = "",
  style,
}: { className?: string; style?: React.CSSProperties }) {
  return <hr className={`rule ${className}`} style={style} />;
}

// ─── LiveDot ────────────────────────────────────────────────────────────────
export function LiveDot({
  className = "",
  style,
}: { className?: string; style?: React.CSSProperties }) {
  return <span className={`live-dot ${className}`} style={style} aria-hidden="true" />;
}

// ─── LiveBadge ──────────────────────────────────────────────────────────────
export function LiveBadge({
  label = "Live",
  className = "",
}: { label?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={{
        fontFamily:    "var(--font-mono)",
        fontSize:      11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color:         "var(--teal)",
        fontWeight:    500,
      }}
    >
      <LiveDot />
      {label}
    </span>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────
export function Card({
  children,
  className = "",
  style,
  /** "raised" — paper background. "subtle" — paper-2 background. */
  variant = "raised",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: "raised" | "subtle" }) {
  return (
    <div
      className={`rounded-[4px] ${className}`}
      style={{
        background:  variant === "subtle" ? "var(--paper-2)" : "var(--paper)",
        border:      "1px solid var(--rule)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

// ─── Container ──────────────────────────────────────────────────────────────
export function Container({
  children,
  size = "marketing",
  className = "",
  style,
}: {
  children: ReactNode;
  /** "marketing" → 1200px max. "product" → 1440px max. "reading" → 700px max. */
  size?: "marketing" | "product" | "reading";
  className?: string;
  style?: React.CSSProperties;
}) {
  const maxWidth =
    size === "product"  ? 1440 :
    size === "reading"  ?  700 :
    1200;
  return (
    <div
      className={`mx-auto px-4 md:px-8 ${className}`}
      style={{ maxWidth, ...style }}
    >
      {children}
    </div>
  );
}
