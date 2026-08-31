"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { docsByCategory } from "@/lib/docs";

const groups = docsByCategory();

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <Link
        href="/docs"
        onClick={onNavigate}
        className="block px-3 py-1.5 rounded-lg text-sm font-semibold mb-2"
        style={pathname === "/docs"
          ? { background: "rgba(37,99,235,0.1)", color: "#2563eb" }
          : { color: "#334155" }}
      >
        Overview
      </Link>
      {groups.map((g) => (
        <div key={g.category} className="mb-4">
          <p className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "#94a3b8" }}>{g.category}</p>
          {g.pages.map((p) => {
            const href = `/docs/${p.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={p.slug}
                href={href}
                onClick={onNavigate}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={active
                  ? { background: "rgba(37,99,235,0.1)", color: "#2563eb", fontWeight: 600 }
                  : { color: "#475569" }}
              >
                <span className="text-[13px]">{p.icon}</span>
                <span>{p.title.replace(/ — .*$/, "")}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function DocsSidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:block sticky top-24 self-start w-60 flex-shrink-0" aria-label="Docs navigation">
        <NavList />
      </nav>

      {/* Mobile dropdown */}
      <details className="lg:hidden mb-6 rounded-xl" style={{ background: "white", border: "1px solid rgba(0,0,0,0.08)" }}>
        <summary className="px-4 py-3 text-sm font-semibold cursor-pointer select-none" style={{ color: "#0f172a" }}>
          Browse docs
        </summary>
        <div className="px-2 pb-3 pt-1">
          <NavList />
        </div>
      </details>
    </>
  );
}
