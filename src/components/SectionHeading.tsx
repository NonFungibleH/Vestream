// src/components/SectionHeading.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The one section heading. Every public page used to hand-roll its own h2
// block (eyebrow, title, sub) with slightly different sizes, weights and greys,
// and the net effect read as flat. This is the single treatment:
//
//   - eyebrow: 26px teal rule + tracked uppercase label
//   - title:   bold, larger than the old 38px cap, tight tracking, balanced
//              wrapping, in the deepest ink (#0B0E12) on light grounds and
//              pure white on dark ones
//   - accent:  optional trailing phrase in deep teal (#0F8A8A) on light
//              grounds or lifted teal (#5FDCDC) on dark. Solid colour on
//              purpose: the gradient is reserved for the hero payoff line so
//              it stays special.
//   - sub:     readable grey, not the caption grey used for table meta
//
// `tone` matches the surface the heading sits on. `align` defaults to centre
// because that is what most sections use; pass "left" for split layouts.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";

type Tone = "light" | "dark";

const TONES: Record<Tone, { title: string; accent: string; sub: string; label: string; rule: string }> = {
  light: { title: "#0B0E12", accent: "#0F8A8A", sub: "#5E6468", label: "#0F8A8A", rule: "#1CB8B8" },
  dark:  { title: "#FFFFFF", accent: "#5FDCDC", sub: "rgba(255,255,255,0.74)", label: "#5FDCDC", rule: "#1CB8B8" },
};

export const SECTION_TITLE_STYLE = {
  fontSize: "clamp(1.9rem, 3.4vw, 2.625rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.035em",
  textWrap: "balance" as const,
};

export function SectionHeading({
  eyebrow,
  title,
  accent,
  sub,
  tone = "light",
  align = "center",
  size = "md",
  className = "",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Trailing phrase rendered in the accent colour, after a space. */
  accent?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  align?: "center" | "left";
  /** "sm" for in-page table/list headings that should not compete with the page h1. */
  size?: "sm" | "md";
  className?: string;
}) {
  const t = TONES[tone];
  const centred = align === "center";
  const titleStyle = size === "sm"
    ? { fontSize: "clamp(1.4rem, 2.4vw, 1.75rem)", lineHeight: 1.12, letterSpacing: "-0.03em", textWrap: "balance" as const }
    : SECTION_TITLE_STYLE;

  return (
    <div className={`${centred ? "text-center mx-auto" : "text-left"} max-w-2xl ${className}`}>
      {eyebrow && (
        <div className={`inline-flex items-center gap-2.5 mb-3.5 ${centred ? "justify-center" : ""}`}>
          <span aria-hidden style={{ width: 26, height: 1, background: t.rule, display: "block" }} />
          <span className="text-[10.5px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: t.label }}>
            {eyebrow}
          </span>
        </div>
      )}
      <h2 className={`font-bold ${sub ? "mb-3" : ""}`} style={{ ...titleStyle, color: t.title }}>
        {title}
        {accent && <> <span style={{ color: t.accent }}>{accent}</span></>}
      </h2>
      {sub && (
        <p className="text-base md:text-[17px] leading-relaxed" style={{ color: t.sub }}>
          {sub}
        </p>
      )}
    </div>
  );
}
