"use client";

// src/components/DashboardHeader.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Universal top bar for EVERY /dashboard/* tab. Previously the header (title +
// wallet count + account menu) lived only inside the home page, so other tabs
// had no consistent top chrome. This is rendered once by DashboardChrome above
// the page content.
//
// Self-contained on purpose: it fetches /api/wallets itself (one cached SWR
// call returns wallets + sessionAddress + walletLimit), so it needs no state
// threaded from individual pages. The per-tab title is derived from the path.
//
// What's NOT here (deliberately): the home page's inline "+ Add wallet" quick-
// add bar stays on the home page — it drives home-specific UI. Everywhere
// else, "Manage" → /settings is the add/edit path.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { useDashboardChrome } from "./DashboardChrome";
import { WalletChip } from "./WalletChip";

interface WalletsResponse {
  wallets:        { address: string }[];
  sessionAddress: string | null;
  walletLimit:    number | null;
}

// Longest-prefix match so deep routes (e.g. /dashboard/explorer/token/…) still
// resolve to their section title. Order longest → shortest.
const TITLES: Array<[string, string]> = [
  ["/dashboard/explorer",        "Vesting Explorer"],
  ["/dashboard/discover",        "Wallet Scanner"],
  ["/dashboard/watchlist",       "Watchlist"],
  ["/dashboard/alerts",          "Alerts"],
  ["/dashboard/smart-money",     "Smart Money"],
  ["/dashboard/exports",         "Tax Reports"],
  ["/dashboard/income-statement","Income Statement"],
  ["/dashboard",                 "Overview"],
];

function titleForPath(pathname: string): string {
  for (const [prefix, label] of TITLES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return label;
  }
  return "Dashboard";
}

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<WalletsResponse>;
});

export function DashboardHeader() {
  const pathname = usePathname();
  const router   = useRouter();
  const { toggleSidebar } = useDashboardChrome();
  const [chipOpen, setChipOpen] = useState(false);

  // Cached by the dashboard SWR provider (60s dedupe), so this is effectively
  // free across navigations.
  const { data } = useSWR<WalletsResponse>("/api/wallets", fetcher);
  const walletCount = data?.wallets?.length ?? null;
  const walletLimit = data?.walletLimit ?? null;
  const sessionAddress = data?.sessionAddress ?? null;

  const title = titleForPath(pathname);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 px-4 md:px-6 flex items-center justify-between flex-shrink-0"
      style={{ background: "var(--preview-card)", borderBottom: "1px solid var(--preview-border)" }}
      // Close the account dropdown when clicking elsewhere in the bar.
      onClick={() => { if (chipOpen) setChipOpen(false); }}>
      <div className="flex items-center gap-3">
        {/* Mobile hamburger — toggles the shared sidebar drawer. */}
        <button className="flex md:hidden w-8 h-8 items-center justify-center rounded-lg"
          style={{ color: "var(--preview-text-2)" }}
          onClick={toggleSidebar}
          aria-label="Toggle sidebar">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <h1 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{title}</h1>
      </div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* Wallet count + Manage — universal across tabs. The inline quick-add
            ("+ Add") stays on the home page only. */}
        {walletCount !== null && (
          <div className="hidden md:flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)", color: "var(--preview-text-2)" }}>
            <span>
              <strong style={{ color: "var(--preview-text)" }}>{walletCount}</strong>
              {walletLimit !== null ? ` / ${walletLimit}` : ""} wallet{walletCount === 1 ? "" : "s"}
            </span>
            <span style={{ color: "var(--preview-border)" }}>·</span>
            <Link href="/settings" className="font-medium transition-colors hover:underline" style={{ color: "var(--preview-text-2)" }}>
              Manage
            </Link>
          </div>
        )}
        {sessionAddress && (
          <WalletChip
            address={sessionAddress}
            open={chipOpen}
            onToggle={(e) => { e.stopPropagation(); setChipOpen((v) => !v); }}
            onDisconnect={handleLogout}
          />
        )}
      </div>
    </header>
  );
}
