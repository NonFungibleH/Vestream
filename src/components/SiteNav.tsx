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

const NAV_LINKS = [
  { label: "Protocols",     href: "/unlocks"       },
  { label: "Demo",          href: "/demo"          },
  { label: "Find Vestings", href: "/find-vestings" },
] as const;

const THEME = {
  light: {
    navBg:          "rgba(248,250,252,0.85)",
    navBorder:      "rgba(0,0,0,0.07)",
    linkBase:       "#64748b",
    linkActive:     "#0f172a",
    mobileMenuBg:   "#f8fafc",
    activeDot:      "#2563eb",
    mobileActiveBg: "rgba(37,99,235,0.05)",
    logo:           "/logo.svg",
  },
  navy: {
    navBg:          "rgba(13,27,53,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    mobileMenuBg:   "#0d1b35",
    activeDot:      "white",
    mobileActiveBg: "rgba(255,255,255,0.05)",
    logo:           "/logo-dark.svg",
  },
  dark: {
    navBg:          "rgba(13,15,20,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    mobileMenuBg:   "#0d0f14",
    activeDot:      "white",
    mobileActiveBg: "rgba(255,255,255,0.05)",
    logo:           "/logo-dark.svg",
  },
} as const;

export function SiteNav({ theme = "light" }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const { navBg, navBorder, linkBase, linkActive, mobileMenuBg, activeDot, mobileActiveBg, logo } = THEME[theme];

  const ctaHref  = "/early-access";
  const ctaLabel = "Early Access →";

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
            alt="Vestream"
            width={140}
            height={35}
            style={{ height: 35, width: "auto" }}
          />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className="text-sm transition-colors"
                style={{ color: isActive ? linkActive : linkBase, fontWeight: isActive ? 600 : 400 }}
              >
                {label}
                {isActive && (
                  <span
                    className="block mx-auto mt-0.5 rounded-full"
                    style={{ width: 4, height: 4, background: activeDot }}
                  />
                )}
              </Link>
            );
          })}

          {/* CTA */}
          <a
            href={ctaHref}
            className="text-sm font-semibold px-4 py-1.5 rounded-xl transition-all duration-150 hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 2px 12px rgba(37,99,235,0.3)" }}
          >
            {ctaLabel}
          </a>
        </div>

        {/* Mobile right — CTA button + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          <a
            href={ctaHref}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-150 hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}
          >
            Early Access
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg"
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

      {/* Mobile dropdown menu */}
      {open && (
        <div
          className="fixed top-14 left-0 right-0 z-40 md:hidden px-4 pt-4 pb-6 space-y-1"
          style={{ background: mobileMenuBg, borderBottom: `1px solid ${navBorder}`, backdropFilter: "blur(12px)" }}
        >
          {NAV_LINKS.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive ? linkActive : linkBase,
                  background: isActive ? mobileActiveBg : "transparent",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
