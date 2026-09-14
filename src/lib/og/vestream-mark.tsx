// src/lib/og/vestream-mark.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The Vestream icon, for next/og (Satori) cards.
//
// Every OG route used to hand-draw this as three equal-width rounded bars in
// divs. That is not the logo. The real mark (public/logo-icon.svg) is three
// CASCADING slabs, each wider than the one above, with a 45° step on the right
// edge and square corners — it reads as vested value accumulating over time,
// which equal rounded bars do not. The difference is obvious at card size and
// these cards are the first thing anyone sees when a link is shared.
//
// Satori renders inline <svg> with <path>, so we use the real path data rather
// than approximating it again. Keep these three paths byte-identical to
// public/logo-icon.svg; if the brand mark changes, change it in both.
//
// The viewBox is cropped to the slabs themselves (x 22..86, y 30..70) so the
// component has no invisible padding and `width` means the width you see.
// ─────────────────────────────────────────────────────────────────────────────

const ASPECT = 40 / 64; // slab block is 64 wide × 40 tall in the source viewBox

export function VestreamMark({ width = 44 }: { width?: number }) {
  return (
    <svg
      width={width}
      height={Math.round(width * ASPECT)}
      viewBox="22 30 64 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22 30 L62 30 L70 38 L22 38 Z" fill="#1A1D20" opacity="0.35" />
      <path d="M22 46 L70 46 L78 54 L22 54 Z" fill="#1A1D20" opacity="0.65" />
      <path d="M22 62 L78 62 L86 70 L22 70 Z" fill="#1CB8B8" />
    </svg>
  );
}
