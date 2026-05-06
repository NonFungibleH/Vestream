"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface Props {
  /**
   * "light"  = white/grey consumer pages (default) — homepage, pricing, resources
   * "navy"   = dark navy developer page — /developer
   * "dark"   = near-black AI/technical pages — /ai
   */
  theme?: "light" | "navy" | "dark";
}

// "Find Vestings" lives in the CTA slot below — it's the primary funnel
// entry point so it gets the loud gradient button rather than a regular
// nav link. Keeping it out of NAV_LINKS prevents it appearing twice.
//
// May 5 2026 strategy reset: focusing the marketing surface on vesting
// while Payroll moves to the roadmap. Top nav drops the Invest / Payroll
// dual links — /invest still exists as a vesting-focused SEO landing
// page, /payroll redirects to a coming-soon waitlist (linked from the
// footer instead of the nav).
const NAV_LINKS = [
  { label: "Protocols", href: "/protocols" },
  { label: "Demo",      href: "/demo"      },
] as const;

const THEME = {
  light: {
    navBg:          "rgba(248,250,252,0.85)",
    navBorder:      "rgba(21,23,26,0.10)",
    linkBase:       "#8B8E92",
    linkActive:     "#1A1D20",
    // White for the dropdown so it sits *on top of* the warm-paper page bg
    // rather than blending into it. The shadow + bottom-rounded corners
    // do the rest of the lifting.
    mobileMenuBg:   "white",
    mobileMenuShadow: "0 12px 32px rgba(21,23,26,0.10), 0 2px 8px rgba(21,23,26,0.05)",
    mobileBackdropBg: "rgba(15,23,42,0.18)",
    activeDot:      "#1CB8B8",
    mobileActiveBg: "rgba(28,184,184,0.08)",
    logo:           "/logo.svg",
  },
  navy: {
    navBg:          "rgba(13,27,53,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    // Slight lift over the page bg so the panel reads as a card.
    mobileMenuBg:   "#122040",
    mobileMenuShadow: "0 12px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)",
    mobileBackdropBg: "rgba(0,0,0,0.45)",
    activeDot:      "white",
    mobileActiveBg: "rgba(28,184,184,0.12)",
    logo:           "/logo-dark.svg",
  },
  dark: {
    navBg:          "rgba(13,15,20,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    mobileMenuBg:   "#141720",
    mobileMenuShadow: "0 12px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.35)",
    mobileBackdropBg: "rgba(0,0,0,0.55)",
    activeDot:      "white",
    mobileActiveBg: "rgba(28,184,184,0.12)",
    logo:           "/logo-dark.svg",
  },
} as const;

export function SiteNav({ theme = "light" }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { navBg, navBorder, linkBase, linkActive, mobileMenuBg, mobileMenuShadow, mobileBackdropBg, mobileActiveBg, logo } = THEME[theme];

  // Primary funnel CTA — drives users to paste a wallet, see their vestings,
  // then convert via the in-results "Open in app" CTA. App is publicly live
  // (no longer early-access gated) so /find-vestings is the right top-of-
  // funnel target, not /early-access.
  const ctaHref       = "/find-vestings";
  const ctaLabel      = "Find My Vestings →";
  const ctaLabelShort = "Find Vestings";   // mobile — narrower button

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-14 md:h-16"
        style={{ background: navBg, borderBottom: `1px solid ${navBorder}`, backdropFilter: "blur(12px)" }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity" onClick={() => setOpen(false)}>
          <img
            src={logo}
            alt="TokenVest"
            width={140}
            height={35}
            style={{ height: 35, width: "auto" }}
          />
        </Link>

        {/* Desktop links + CTA */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1">
            {NAV_LINKS.map(({ label, href }) => {
              const isActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative text-sm transition-colors px-3 py-1.5 rounded-lg"
                  style={{
                    color: isActive ? linkActive : linkBase,
                    fontWeight: isActive ? 600 : 500,
                    background: isActive ? mobileActiveBg : "transparent",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </div>

          {/* "Log in" sits to the LEFT of the gradient CTA — same nav slot
              that's been free since SIWE was demoted. Returning users get a
              clear way back to /dashboard without competing with the
              acquisition CTA visually. */}
          <Link
            href="/login"
            className="text-sm font-medium px-3 rounded-xl transition-colors hover:opacity-80 inline-flex items-center min-h-[40px]"
            style={{ color: linkBase }}
          >
            Log in
          </Link>

          {/* CTA — min-h-[40px] ensures a WCAG-compliant tap target (44px
              target counting natural padding). Previously `py-1.5` alone
              gave ~32px, below the 44px accessibility floor. */}
          <a
            href={ctaHref}
            className="text-sm font-semibold px-4 rounded-xl transition-all duration-150 hover:opacity-90 inline-flex items-center min-h-[40px]"
            style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 12px rgba(28,184,184,0.3)" }}
          >
            {ctaLabel}
          </a>
        </div>

        {/* Mobile right — CTA button + hamburger. Both bumped to min-h-[40px]
            / w-11 h-11 for touch accessibility. */}
        <div className="flex md:hidden items-center gap-2">
          <a
            href={ctaHref}
            className="text-xs font-semibold px-3 rounded-xl transition-all duration-150 hover:opacity-90 inline-flex items-center min-h-[40px]"
            style={{ background: "#1CB8B8", color: "white" }}
          >
            {ctaLabelShort}
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative w-11 h-11 flex items-center justify-center rounded-lg"
            aria-label="Toggle menu"
          >
            {([
              { offset: -6, deg: 45,  hide: false },
              { offset:  0, deg:  0,  hide: true  },
              { offset:  6, deg: -45, hide: false },
            ] as const).map(({ offset, deg, hide }, i) => (
              <span
                key={i}
                className="absolute block w-5 h-0.5 rounded-full transition-all duration-200"
                style={{
                  background: linkActive,
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

      {/* Mobile dropdown menu — sits as a floating panel below the nav,
          inset from the edges with rounded corners and a soft shadow so
          it reads as a layer on top of the page rather than a tonally
          identical strip that "gets lost". */}
      {open && (
        <div
          className="fixed left-3 right-3 z-40 md:hidden p-2 space-y-1"
          style={{
            top:        "calc(56px + 8px)", // h-14 nav + small gap
            background: mobileMenuBg,
            border:     `1px solid ${navBorder}`,
            borderRadius: "16px",
            boxShadow:  mobileMenuShadow,
          }}
        >
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive ? linkActive : linkBase,
                  background: isActive ? mobileActiveBg : "transparent",
                  fontWeight: isActive ? 600 : 500,
                }}
              >
                <span>{label}</span>
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: "#1CB8B8" }}
                  />
                )}
              </Link>
            );
          })}

          {/* Returning-user login — visually separated from the navigation
              links above with a hairline, so it reads as account action
              rather than another product page. */}
          <div className="pt-2 mt-2" style={{ borderTop: `1px solid ${navBorder}` }}>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors"
              style={{ color: linkBase }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Log in
            </Link>
          </div>
        </div>
      )}

      {/* Backdrop — dims the page so the panel reads as elevated and
          gives the user an obvious tap-target to dismiss the menu. */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden transition-opacity"
          style={{ background: mobileBackdropBg, backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
