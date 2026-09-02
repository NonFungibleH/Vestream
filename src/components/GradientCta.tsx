// src/components/GradientCta.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-bleed gradient CTA band — the page's second bold block after the ink
// hero, and the counterpart to it: hero opens, this closes.
//
// Full-bleed on purpose. The homepage version of this started life as a rounded
// card sitting on the grey page, which left a strip of page background above
// and below it that read as a gap rather than a section. Edge to edge, it
// carries the same weight as the hero and gives each page a focal moment
// instead of trailing off into footer.
//
// The masked white grid is what keeps a large flat gradient from looking like
// a coloured rectangle; it fades from the bottom-right so it never sits behind
// the copy.
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import type { ReactNode } from "react";

export function GradientCta({
  eyebrow,
  title,
  sub,
  primary,
  secondary,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <section className="relative w-full overflow-hidden px-4 md:px-8 py-16 md:py-24"
      style={{ background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)" }}>
      {/* Masked grid, fading in from the bottom right. */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(680px 420px at 100% 100%, #000, transparent 72%)",
        WebkitMaskImage: "radial-gradient(680px 420px at 100% 100%, #000, transparent 72%)",
      }} />
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 55% 60% at 88% 50%, rgba(28,184,184,0.22) 0%, transparent 70%)",
      }} />

      <div className="relative max-w-4xl mx-auto text-center">
        {eyebrow && (
          <div className="inline-flex items-center gap-2.5 mb-5">
            <span style={{ width: 26, height: 1, background: "rgba(255,255,255,0.5)" }} />
            <span className="text-[10.5px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: "rgba(255,255,255,0.72)" }}>
              {eyebrow}
            </span>
          </div>
        )}
        <h2 className="font-semibold mb-4" style={{
          fontSize: "clamp(1.75rem, 3.6vw, 2.375rem)", lineHeight: 1.12,
          letterSpacing: "-0.032em", color: "#FFFFFF", textWrap: "balance",
        }}>{title}</h2>
        {sub && (
          <p className="text-base md:text-[16.5px] leading-relaxed max-w-xl mx-auto mb-8"
            style={{ color: "rgba(255,255,255,0.72)" }}>{sub}</p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {primary && (
            <Link href={primary.href}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
              style={{ background: "#0B0E12", color: "#FFFFFF", boxShadow: "0 12px 30px -12px rgba(0,0,0,0.6)" }}>
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href}
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-sm transition-colors"
              style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.24)", color: "#FFFFFF" }}>
              {secondary.label}
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
