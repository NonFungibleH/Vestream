"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface Props {
  /** "light" = white/grey pages (default). "dark" = dark pages like /developer */
  theme?: "light" | "dark";
}

const NAV_LINKS = [
  { label: "Resources",    href: "/resources" },
  { label: "Pricing",      href: "/pricing"   },
  { label: "Developer API", href: "/developer" },
] as const;

export function SiteNav({ theme = "light" }: Props) {
  const pathname   = usePathname();
  const isDark     = theme === "dark";
  const [open, setOpen] = useState(false);

  // Colours
  const navBg     = isDark ? "rgba(13,15,20,0.92)"         : "rgba(248,250,252,0.85)";
  const navBorder = isDark ? "rgba(255,255,255,0.06)"      : "rgba(0,0,0,0.07)";
  const logoText  = isDark ? "white"                        : "#0f172a";
  const linkBase  = isDark ? "rgba(255,255,255,0.45)"      : "#64748b";
  const linkActive= isDark ? "white"                        : "#0f172a";
  const mobileMenuBg = isDark ? "#0d0f14" : "#f8fafc";

  // On /developer: hide consumer links
  const isDeveloper  = pathname === "/developer";
  const visibleLinks = isDeveloper
    ? NAV_LINKS.filter(({ href }) => href === "/developer")
    : NAV_LINKS;
  const ctaHref  = "/early-access";
  const ctaLabel = "Early Access →";

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-14 md:h-16"
        style={{ background: navBg, borderBottom: `1px solid ${navBorder}`, backdropFilter: "blur(12px)" }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity" onClick={() => setOpen(false)}>
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
          >
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-bold text-base tracking-tight" style={{ color: logoText }}>
            Vestream
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-5">
          {visibleLinks.map(({ label, href }) => {
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
                    style={{ width: 4, height: 4, background: isDark ? "white" : "#2563eb" }}
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
          {visibleLinks.map(({ label, href }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive ? linkActive : linkBase,
                  background: isActive ? (isDark ? "rgba(255,255,255,0.05)" : "rgba(37,99,235,0.05)") : "transparent",
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
