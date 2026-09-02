"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  listProtocols, protocolIcon,
  publicChainIds, chainSlug, chainBrand, chainIcon,
} from "@/lib/protocol-constants";
import { GlobalSearchOverlay } from "@/components/GlobalSearchOverlay";

function SearchIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

interface Props {
  /**
   * "light"  = white/grey consumer pages (default) - homepage, pricing, resources
   * "navy"   = dark navy developer page - /developer
   * "dark"   = near-black AI/technical pages - /ai
   */
  theme?: "light" | "navy" | "dark" | "ink";
}

// Dropdown item lists, built from the single source of truth in
// protocol-constants so the nav never drifts from the real integrations.
const PROTOCOL_ITEMS = listProtocols().map((p) => ({
  label: p.name, href: `/protocols/${p.slug}`, icon: protocolIcon(p.slug), color: p.color, bg: p.bg, border: p.border,
}));
const CHAIN_ITEMS = publicChainIds()
  .map((id) => ({ id, slug: chainSlug(id), brand: chainBrand(id), icon: chainIcon(id) }))
  .filter((c) => c.slug)
  .map((c) => ({ label: c.brand.name, href: `/chains/${c.slug}`, icon: c.icon, color: c.brand.color, bg: c.brand.bg, border: c.brand.border }));

type NavItem = { label: string; href: string; items?: typeof PROTOCOL_ITEMS };
const NAV_ITEMS: NavItem[] = [
  { label: "Protocols", href: "/protocols", items: PROTOCOL_ITEMS },
  { label: "Chains",    href: "/chains",    items: CHAIN_ITEMS },
  // Added 2026-09-01 at Howard's explicit request ("an easy way to view our
  // unlocks page from the homepage and menu"). The no-new-nav-links rule in
  // CLAUDE.md stands for everything else.
  { label: "Unlocks",   href: "/unlocks" },
  { label: "Demo",      href: "/demo" },
  { label: "Pricing",   href: "/pricing" },
];

const THEME = {
  light: {
    iconTileBg:     "#FFFFFF",
    itemHoverBg:    "rgba(21,23,26,0.04)",
    navBg:          "rgba(248,250,252,0.85)",
    navBorder:      "rgba(21,23,26,0.10)",
    linkBase:       "#8B8E92",
    linkActive:     "#1A1D20",
    menuBg:         "white",
    menuShadow:     "0 12px 32px rgba(21,23,26,0.10), 0 2px 8px rgba(21,23,26,0.05)",
    mobileBackdropBg: "rgba(15,23,42,0.18)",
    activeDot:      "#1CB8B8",
    mobileActiveBg: "rgba(28,184,184,0.08)",
    itemText:       "#334155",
    logo:           "/logo.svg",
  },
  navy: {
    iconTileBg:     "#FFFFFF",
    itemHoverBg:    "rgba(255,255,255,0.06)",
    navBg:          "rgba(13,27,53,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    menuBg:         "#122040",
    menuShadow:     "0 12px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.25)",
    mobileBackdropBg: "rgba(0,0,0,0.45)",
    activeDot:      "white",
    mobileActiveBg: "rgba(28,184,184,0.12)",
    itemText:       "rgba(255,255,255,0.8)",
    logo:           "/logo-dark.svg",
  },
  // "ink" matches the homepage hero exactly (#0B0E12). The "dark" variant was
  // tuned for /ai, whose page background is #0d0f14 — one step lighter — so on
  // the hero it read as a distinctly lighter band across the top, and the
  // dropdown panel sat at a third shade again. Same family, own row, so /ai is
  // untouched.
  ink: {
    iconTileBg:     "#FFFFFF",
    itemHoverBg:    "rgba(255,255,255,0.06)",
    navBg:          "rgba(11,14,18,0.92)",
    navBorder:      "rgba(255,255,255,0.10)",
    linkBase:       "rgba(255,255,255,0.44)",
    linkActive:     "#FFFFFF",
    menuBg:         "#141A20",
    menuShadow:     "0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px -24px rgba(0,0,0,0.9)",
    mobileBackdropBg: "rgba(0,0,0,0.6)",
    activeDot:      "#5FDCDC",
    mobileActiveBg: "rgba(28,184,184,0.12)",
    itemText:       "rgba(255,255,255,0.82)",
    logo:           "/logo-dark.svg",
  },
  dark: {
    iconTileBg:     "#FFFFFF",
    itemHoverBg:    "rgba(255,255,255,0.06)",
    navBg:          "rgba(13,15,20,0.92)",
    navBorder:      "rgba(255,255,255,0.06)",
    linkBase:       "rgba(255,255,255,0.45)",
    linkActive:     "white",
    menuBg:         "#141720",
    menuShadow:     "0 12px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.35)",
    mobileBackdropBg: "rgba(0,0,0,0.55)",
    activeDot:      "white",
    mobileActiveBg: "rgba(28,184,184,0.12)",
    itemText:       "rgba(255,255,255,0.8)",
    logo:           "/logo-dark.svg",
  },
} as const;

function Caret() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-60">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function SiteNav({ theme = "light" }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global shortcuts: ⌘K / Ctrl+K anywhere, or "/" when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !searchOpen) {
        const el = document.activeElement as HTMLElement | null;
        const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
        if (!typing) { e.preventDefault(); setSearchOpen(true); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const t = THEME[theme];
  const { navBg, navBorder, linkBase, linkActive, menuBg, menuShadow, mobileBackdropBg, mobileActiveBg, itemText, logo, iconTileBg, itemHoverBg } = t;

  const ctaHref       = "/find-vestings";
  const ctaLabel      = "Find My Vestings →";
  const ctaLabelShort = "Find Vestings";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-14 md:h-16"
        style={{
          background: navBg,
          borderBottom: `1px solid ${navBorder}`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity" onClick={() => setOpen(false)}>
          <img src={logo} alt="Vestream" width={140} height={35} style={{ height: 35, width: "auto" }} />
        </Link>

        {/* Desktop links + CTA */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              const linkStyle = {
                color: active ? linkActive : linkBase,
                fontWeight: active ? 600 : 500,
                background: active ? mobileActiveBg : "transparent",
              };
              if (!item.items) {
                return (
                  <Link key={item.href} href={item.href} className="relative text-sm transition-colors px-3 py-1.5 rounded-lg" style={linkStyle}>
                    {item.label}
                  </Link>
                );
              }
              // Dropdown (CSS hover): trigger links to the index page, panel
              // lists each protocol/chain. pt-2 bridge keeps hover alive over
              // the gap between trigger and panel.
              return (
                <div key={item.href} className="relative group">
                  <Link href={item.href} className="relative text-sm transition-colors px-3 py-1.5 rounded-lg inline-flex items-center gap-1" style={linkStyle}>
                    {item.label}
                    <Caret />
                  </Link>
                  <div className="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
                    <div
                      className="rounded-2xl p-2 w-[420px]"
                      style={{ background: menuBg, border: `1px solid ${navBorder}`, boxShadow: menuShadow }}
                    >
                      <div className="grid grid-cols-2 gap-0.5">
                        {item.items.map((it) => (
                          <Link
                            key={it.href}
                            href={it.href}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors nav-drop-item"
                            style={{ color: itemText, ["--hov" as string]: itemHoverBg }}
                          >
                            {/* White tile, not the protocol's brand tint. The
                                marks are opaque colour PNGs drawn for light
                                backgrounds, and at ~7% those tints were
                                invisible on the dark dropdown while the
                                transparent-background marks blended into it.
                                Same treatment as the hero chips. */}
                            <span className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: iconTileBg }}>
                              {it.icon
                                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.icon} alt="" width={28} height={28} className="w-full h-full object-contain p-0.5" />
                                : <span className="font-bold text-[12px]" style={{ color: it.color }}>{it.label[0]}</span>}
                            </span>
                            <span className="text-[13px] font-medium truncate">{it.label}</span>
                          </Link>
                        ))}
                      </div>
                      <Link
                        href={item.href}
                        className="block mt-1 px-2.5 py-2 rounded-lg text-[13px] font-semibold"
                        style={{ color: "#1CB8B8", borderTop: `1px solid ${navBorder}` }}
                      >
                        View all {item.label.toLowerCase()} →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search tokens"
            className="inline-flex items-center gap-2 text-sm px-3 rounded-xl transition-colors hover:opacity-80 min-h-[40px]"
            style={{ color: linkBase }}
          >
            <SearchIcon />
          </button>

          <Link
            href="/login"
            className="text-sm font-medium px-3 rounded-xl transition-colors hover:opacity-80 inline-flex items-center min-h-[40px]"
            style={{ color: linkBase }}
          >
            Log in
          </Link>

          <a
            href={ctaHref}
            className="text-sm font-semibold px-4 rounded-xl transition-all duration-150 hover:opacity-90 inline-flex items-center min-h-[40px]"
            style={{ background: "#1CB8B8", color: "white", boxShadow: "0 2px 12px rgba(28,184,184,0.3)" }}
          >
            {ctaLabel}
          </a>
        </div>

        {/* Mobile right - search + CTA + hamburger */}
        <div className="flex md:hidden items-center gap-1">
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search tokens"
            className="w-10 h-10 flex items-center justify-center rounded-lg"
            style={{ color: linkBase }}
          >
            <SearchIcon />
          </button>
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
                  transform: open ? `translateY(-50%) rotate(${deg}deg)` : `translateY(calc(-50% + ${offset}px))`,
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
          className="fixed left-3 right-3 z-40 md:hidden p-2 space-y-1 max-h-[75vh] overflow-y-auto"
          style={{
            top:        "calc(56px + 8px)",
            background: menuBg,
            border:     `1px solid ${navBorder}`,
            borderRadius: "16px",
            boxShadow:  menuShadow,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            if (!item.items) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: active ? linkActive : linkBase, background: active ? mobileActiveBg : "transparent", fontWeight: active ? 600 : 500 }}
                >
                  <span>{item.label}</span>
                  {active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#1CB8B8" }} />}
                </Link>
              );
            }
            // Expandable section (native details) for the dropdown groups.
            return (
              <details key={item.href} className="rounded-xl overflow-hidden" style={{ background: active ? mobileActiveBg : "transparent" }}>
                <summary className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl text-sm font-medium cursor-pointer select-none list-none" style={{ color: active ? linkActive : linkBase, fontWeight: active ? 600 : 500 }}>
                  <span>{item.label}</span>
                  <Caret />
                </summary>
                <div className="px-2 pb-2 grid grid-cols-2 gap-0.5">
                  <Link href={item.href} onClick={() => setOpen(false)} className="col-span-2 px-2.5 py-2 rounded-lg text-[13px] font-semibold" style={{ color: "#1CB8B8" }}>
                    All {item.label.toLowerCase()} →
                  </Link>
                  {item.items.map((it) => (
                    <Link key={it.href} href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ color: itemText }}>
                      <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: it.bg, border: `1px solid ${it.border}` }}>
                        {it.icon
                          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.icon} alt="" width={20} height={20} className="w-full h-full object-contain p-0.5" />
                          : <span className="font-bold text-[10px]" style={{ color: it.color }}>{it.label[0]}</span>}
                      </span>
                      <span className="text-[12px] font-medium truncate">{it.label}</span>
                    </Link>
                  ))}
                </div>
              </details>
            );
          })}

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

      {open && (
        <div
          className="fixed inset-0 z-30 md:hidden transition-opacity"
          style={{ background: mobileBackdropBg, backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      <GlobalSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
