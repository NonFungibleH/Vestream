// src/components/brand/Button.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Brand button — per brand brief v1.0 §07.
//
//   Primary    — teal background, ink text, 12×22 padding, 3px radius.
//   Secondary  — 1px ink border, ink text, transparent fill.
//   Tertiary   — ink text, no border, no fill, hover underline.
//   Destructive — danger background, paper text. Always require confirmation.
//
// Heights: 44px (default), 36px (compact), 52px (hero).
// NO gradients. NO pill shapes. NO drop shadows on buttons.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "tertiary" | "destructive";
type Size    = "compact" | "default" | "hero";

interface BaseProps {
  variant?: Variant;
  size?:    Size;
  children: ReactNode;
  /** Optional leading icon (Lucide). Pixel-snapped to 16/20/24 by size. */
  icon?:    ReactNode;
}

const sizeStyles: Record<Size, { height: number; padX: number; fontSize: number }> = {
  compact: { height: 36, padX: 16, fontSize: 13 },
  default: { height: 44, padX: 22, fontSize: 14 },
  hero:    { height: 52, padX: 28, fontSize: 15 },
};

function variantStyles(v: Variant): React.CSSProperties {
  switch (v) {
    case "primary":
      return {
        background: "var(--teal)",
        color:      "var(--ink)",
        border:     "1px solid var(--teal)",
      };
    case "secondary":
      return {
        background: "transparent",
        color:      "var(--ink)",
        border:     "1px solid var(--ink)",
      };
    case "tertiary":
      return {
        background: "transparent",
        color:      "var(--ink)",
        border:     "1px solid transparent",
      };
    case "destructive":
      return {
        background: "var(--danger)",
        color:      "var(--paper)",
        border:     "1px solid var(--danger)",
      };
  }
}

const baseClass =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 " +
  "rounded-[3px] whitespace-nowrap select-none focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--teal)] " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  // Hover rules per brief §07: primary→teal-d, secondary→ink fill, tertiary→underline.
  "hover:[&[data-variant=primary]]:bg-[var(--teal-d)] " +
  "hover:[&[data-variant=secondary]]:bg-[var(--ink)] hover:[&[data-variant=secondary]]:text-[var(--paper)] " +
  "hover:[&[data-variant=tertiary]]:underline";

interface ButtonAsButton extends BaseProps, Omit<ComponentPropsWithoutRef<"button">, keyof BaseProps> {
  href?: never;
}
interface ButtonAsLink extends BaseProps, Omit<ComponentPropsWithoutRef<"a">,      keyof BaseProps> {
  href: string;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", children, icon, className, style, ...rest },
  ref,
) {
  const sz = sizeStyles[size];
  const composed: React.CSSProperties = {
    height:        sz.height,
    paddingInline: sz.padX,
    fontSize:      sz.fontSize,
    ...variantStyles(variant),
    ...style,
  };
  const merged = `${baseClass} ${className ?? ""}`.trim();

  const inner = (
    <>
      {icon && <span className="inline-flex flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </>
  );

  if ("href" in rest && rest.href) {
    const { href, ...anchorRest } = rest;
    return (
      <Link
        href={href}
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={merged}
        style={composed}
        data-variant={variant}
        {...anchorRest}
      >
        {inner}
      </Link>
    );
  }

  // Standard button.
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={merged}
      style={composed}
      data-variant={variant}
      {...(rest as ComponentPropsWithoutRef<"button">)}
    >
      {inner}
    </button>
  );
});
