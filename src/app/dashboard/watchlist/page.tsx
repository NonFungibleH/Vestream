"use client";

// /dashboard/watchlist
// ─────────────────────────────────────────────────────────────────────────────
// The user's saved tokens. These are tokens saved from the Vesting Index via
// the ☆ Save button on a token's drill-down page — NOT tracked wallets (that's
// the dashboard) and NOT a live scan (that's the Wallet Scanner). It's a
// read-only shortcut list: jump straight back to a token's vesting overview.
//
// Backed by /api/watchlist (the `watchlist` table). Save/remove writes go
// through that endpoint; this page lists + removes.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { useDarkMode } from "@/lib/use-dark-mode";
import { track } from "@/lib/analytics";

interface Entry {
  id:           string;
  chainId:      number;
  tokenAddress: string;
  label:        string | null;
  addedAt:      string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function WatchlistPage() {
  const router = useRouter();
  const { dark } = useDarkMode();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.status === 401) { router.push("/login"); return; }
    if (!res.ok) { setEntries([]); return; }
    const data = await res.json();
    setEntries(data.entries ?? []);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    setRemoving(id);
    try {
      await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
      setEntries((cur) => (cur ?? []).filter((e) => e.id !== id));
      track("cta_clicked", { cta_id: "watchlist_removed" });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <main className={`flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8 max-w-4xl w-full${dark ? " dark" : ""}`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
        <Link href="/dashboard" className="hover:underline">Dashboard</Link>
        <span>/</span>
        <span>Watchlist</span>
      </div>
      <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
        Watchlist
      </div>
      <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
        Saved tokens
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--preview-text-2)" }}>
        Tokens you&apos;ve saved from the{" "}
        <Link href="/dashboard/explorer" className="underline" style={{ color: "#0F8A8A" }}>Vesting Explorer</Link>{" "}
        — one click back to each token&apos;s vesting overview, rounds, and unlock schedule. Save any token with the{" "}
        <strong>☆ Save</strong> button on its page. (Tracking your own wallets is the{" "}
        <Link href="/dashboard" className="underline" style={{ color: "#0F8A8A" }}>Dashboard</Link>; a one-shot scan is the{" "}
        <Link href="/dashboard/discover" className="underline" style={{ color: "#0F8A8A" }}>Wallet Scanner</Link>.)
      </p>

      {entries === null ? (
        <p className="text-sm" style={{ color: "var(--preview-text-3)" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--preview-border)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>No saved tokens yet</p>
          <p className="text-xs mb-4" style={{ color: "var(--preview-text-3)" }}>
            Open the Vesting Explorer, find a token, and hit ☆ Save to pin it here.
          </p>
          <Link href="/dashboard/explorer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.25)" }}>
            Browse the Vesting Explorer →
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-4 px-5 py-4"
              style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A" }}>
                {(e.label?.[0] ?? e.tokenAddress.slice(2, 3)).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>
                  {e.label ?? short(e.tokenAddress)}
                </div>
                <div className="text-[11px] mt-0.5 font-mono truncate" style={{ color: "var(--preview-text-3)" }}>
                  {CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `Chain ${e.chainId}`} · {e.tokenAddress}
                </div>
              </div>
              <Link href={`/dashboard/explorer/token/${e.chainId}/${e.tokenAddress}`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.20)" }}>
                View →
              </Link>
              <button onClick={() => remove(e.id)} disabled={removing === e.id} aria-label="Remove from watchlist"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)" }}>
                {removing === e.id ? "…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
