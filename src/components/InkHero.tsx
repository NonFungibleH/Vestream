// src/components/InkHero.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The ink hero block, extracted so every public landing surface shares it.
//
// The homepage hero was the one part of the redesign that immediately read as
// "modern app" rather than "data site", and the reason is contrast: an ink
// block with a teal wash and a masked grid, against paper sections below. The
// rest of the site was still uniform warm grey from nav to footer, so the
// homepage felt like a different product. This component is that block, so
// /unlocks, /chains and /protocols open the same way.
//
// Pair it with <SiteNav theme="ink" />; the nav sits ON the block and its
// background is matched to #0B0E12 exactly (see the "ink" row in SiteNav).
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from "react";

export const INK_BG = "#0B0E12";

export function InkHero({
  eyebrow,
  title,
  accent,
  sub,
  children,
  align = "center",
}: {
  /** Small uppercase label above the headline. */
  eyebrow?: ReactNode;
  /** Headline, first line. */
  title: ReactNode;
  /** Second line, filled with the brand gradient. */
  accent?: ReactNode;
  /** Lead paragraph. */
  sub?: ReactNode;
  /** Anything below the lead (stat rows, CTAs, chips). */
  children?: ReactNode;
  align?: "center" | "left";
}) {
  const centred = align === "center";
  return (
    <section
      className={`relative overflow-hidden isolate px-4 md:px-8 pt-24 pb-14 md:pt-28 md:pb-20 ${centred ? "text-center" : ""}`}
      style={{ background: INK_BG, color: "#FFFFFF" }}
    >
      {/* Teal wash */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background:
          "radial-gradient(900px 520px at 80% -10%, rgba(28,184,184,0.24), transparent 62%)," +
          "radial-gradient(680px 480px at 4% 106%, rgba(15,138,138,0.16), transparent 66%)",
      }} />
      {/* 76px grid, masked so it fades before the copy */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "76px 76px",
        maskImage: "radial-gradient(1000px 620px at 50% 0%, #000, transparent 76%)",
        WebkitMaskImage: "radial-gradient(1000px 620px at 50% 0%, #000, transparent 76%)",
      }} />

      <div className={`relative max-w-5xl mx-auto ${centred ? "" : "text-left"}`}>
        {eyebrow && (
          <div className={`inline-flex items-center gap-2.5 mb-5 ${centred ? "justify-center" : ""}`}>
            <span style={{ width: 26, height: 1, background: "#1CB8B8" }} />
            <span className="text-[10.5px] font-semibold uppercase" style={{ letterSpacing: "0.18em", color: "#5FDCDC" }}>
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="font-semibold mb-5" style={{
          fontSize: "clamp(2.25rem, 5vw, 3.375rem)", lineHeight: 1.06,
          letterSpacing: "-0.034em", color: "#FFFFFF", textWrap: "balance",
        }}>
          {title}
          {accent && (
            <>
              <br />
              <span style={{
                background: "linear-gradient(135deg,#5FDCDC 0%,#1CB8B8 52%,#0F8A8A 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
              }}>{accent}</span>
            </>
          )}
        </h1>
        {sub && (
          <p className={`text-base md:text-lg leading-relaxed ${centred ? "max-w-2xl mx-auto" : "max-w-2xl"}`}
            style={{ color: "rgba(255,255,255,0.64)" }}>
            {sub}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
