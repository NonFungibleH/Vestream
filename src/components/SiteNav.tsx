"use client";
// ─────────────────────────────────────────────────────────────────────────────
// SiteNav — per Vestream brand brief v1.0 §09 (Page structure → Header).
//
//   Lockup-primary on the left (28px tall icon, lockup width ~140px).
//   Nav links on the right in JetBrains Mono uppercase 11px tracked +0.12em.
//   Sticky on scroll. 1px rule divider below.
//
// Theme: light only. The earlier navy + dark variants have been retired
// per the brand brief's "no third typeface, no extra themes" discipline.
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/brand/Button";

interface Props {
  /** Kept for back-compat with existing pages calling theme="navy"|"dark"; ignored. */
  theme?: "light" | "navy" | "dark";
}

const NAV_LINKS = [
  { label: "Protocols",  href: "/protocols"  },
  { label: "Pricing",    href: "/pricing"    },
  { label: "Developers", href: "/developer"  },
  { label: "Resources",  href: "/resources"  },
] as const;

export function SiteNav(_props: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav
        className="sticky top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-16"
        style={{
          background:    "color-mix(in srgb, var(--paper) 92%, transparent)",
          borderBottom:  "1px solid var(--rule)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Lockup */}
        <Link
          href="/"
          className="flex items-center hover:opacity-80 transition-opacity"
          onClick={() => setOpen(false)}
          aria-label="Vestream — home"
        >
          <img
            src="/logo.svg"
            alt="Vestream"
            width={140}
            height={35}
            style={{ height: 28, width: "auto" }}
          />
        </Link>

        {/* Desktop links + CTA */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="relative px-3 py-2 transition-colors"
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight:    500,
                  color:         isActive ? "var(--ink)" : "var(--grey-1)",
                }}
              >
                {label}
              </Link>
            );
          })}
          <div className="ml-3">
            <Button href="/find-vestings" variant="primary" size="compact">
              Find vestings
            </Button>
          </div>
        </div>

        {/* Mobile right — compact CTA + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <Button href="/find-vestings" variant="primary" size="compact">
            Find vestings
          </Button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative w-11 h-11 flex items-center justify-center rounded-[3px]"
            aria-label="Toggle menu"
          >
            {([
              { offset: -6, deg: 45,  hide: false },
              { offset:  0, deg:  0,  hide: true  },
              { offset:  6, deg: -45, hide: false },
            ] as const).map(({ offset, deg, hide }, i) => (
              <span
                key={i}
                className="absolute block w-5 h-0.5 transition-all duration-200"
                style={{
                  background: "var(--ink)",
                  top: "50%",
                  transform: open
                    ? `translateY(-50%) rotate(${deg}deg)`
                    : `translateY(calc(-50% + ${offset}px))`,
                  opacity: hide && open ? 0 : 1,
                }}
              />
            ))}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="fixed top-16 left-0 right-0 z-40 md:hidden px-4 pt-4 pb-6 space-y-1"
          style={{
            background:     "var(--paper)",
            borderBottom:   "1px solid var(--rule)",
            backdropFilter: "blur(12px)",
          }}
        >
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-[3px] transition-colors"
                style={{
                  fontFamily:    "var(--font-mono)",
                  fontSize:      12,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight:    isActive ? 600 : 500,
                  color:         isActive ? "var(--ink)" : "var(--grey-1)",
                  background:    isActive ? "var(--paper-2)" : "transparent",
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
