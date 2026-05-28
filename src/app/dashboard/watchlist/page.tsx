"use client";

// /dashboard/watchlist
// ─────────────────────────────────────────────────────────────────────────────
// User's token watchlist — tokens they want to track without holding.
//
// Different from /dashboard (their own vests) and /dashboard/discover
// (one-shot wallet scan). Watchlist answers: "what's about to unlock for
// tokens I'm watching for trade ideas / dilution exposure / jobs I might
// take?" — opens new TAM beyond holders (traders, prospective hires).
//
// v1 scope:
//   - Add token by (chain + address) or symbol search
//   - List entries with quick view of next unlock + top holder count
//   - Remove an entry
//   - Free tier capped at 5 entries; upgrade prompt when cap is hit
//
// Out of scope (v2):
//   - Per-event push alerts (the API already stores the toggle, UI later)
//   - Weekly digest email content
//   - Symbol-search auto-complete (currently address-only)
//   - Mobile equivalent (separate ticket)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { isValidWalletAddress } from "@/lib/address-validation";
import { track } from "@/lib/analytics";

interface WatchlistEntry {
  id:           string;
  chainId:      number;
  tokenAddress: string;
  label:        string | null;
  weeklyDigest: boolean;
  perEventPush: boolean;
  addedAt:      string;
}

// Chains we support adding watchlist entries for. Solana intentionally
// omitted from v1 — addresses are base58 (different validator) and the
// /token explorer page is EVM-only at the moment.
const ADDABLE_CHAINS = [
  { id: 1,    label: "Ethereum" },
  { id: 56,   label: "BNB Chain" },
  { id: 137,  label: "Polygon" },
  { id: 8453, label: "Base" },
];

export default function WatchlistPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [tier, setTier]       = useState<string>("free");
  const [limit, setLimit]     = useState<number | null>(5);
  const [loading, setLoading] = useState(true);

  // Add form
  const [chainId, setChainId]   = useState<number>(1);
  const [tokenAddress, setTokenAddress] = useState("");
  const [label, setLabel]       = useState("");
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      if (res.status === 401) { router.push("/login"); return; }
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTier(data.tier ?? "free");
      setLimit(data.limit ?? null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!isValidWalletAddress(tokenAddress.trim())) {
      setAddError("Enter a valid contract address (0x…)");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ chainId, tokenAddress: tokenAddress.trim(), label: label.trim() || undefined }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setAddError(data.message ?? "Free tier limit reached. Upgrade to Pro for unlimited.");
        track("upgrade_clicked", { from_surface: "watchlist_cap", required_tier: "pro" });
        return;
      }
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add");
        return;
      }
      track("cta_clicked", { cta_id: "watchlist_added", chain_id: chainId });
      setTokenAddress("");
      setLabel("");
      await load();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    await fetch(`/api/watchlist?id=${id}`, { method: "DELETE" });
    track("cta_clicked", { cta_id: "watchlist_removed" });
    setEntries((cur) => cur.filter((e) => e.id !== id));
  }

  const atCap = limit !== null && entries.length >= limit;

  return (
    <div className="min-h-screen flex" style={{ background: "var(--preview-bg)" }}>
      <main className="flex-1 px-4 md:px-8 py-6 max-w-4xl mx-auto w-full">
        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span>Token Watchlist</span>
          </div>
          <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "rgba(28,184,184,0.12)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.25)" }}>
            Token Watchlist
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--preview-text)", letterSpacing: "-0.02em" }}>
            Tokens you&apos;re watching
          </h1>
          <p className="text-sm" style={{ color: "var(--preview-text-2)" }}>
            Track unlock pressure for specific tokens — projects you&apos;re considering, jobs you might take, or competitors you&apos;re watching.
            <span className="ml-1" style={{ color: "var(--preview-text-3)" }}>
              To track wallets &amp; discover streams, use{" "}
              <Link href="/dashboard/discover" className="underline" style={{ color: "#0F8A8A" }}>Wallet Scanner</Link>.
            </span>
          </p>
        </div>

        {/* Add form */}
        <div className="rounded-2xl p-5 mb-6"
          style={{
            background: "var(--preview-card)",
            border: "1px solid var(--preview-border)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--preview-text)" }}>
            Add a token
          </h2>
          <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-[140px_1fr_140px_auto]">
            <select
              value={chainId}
              onChange={(e) => setChainId(Number.parseInt(e.target.value, 10))}
              className="text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
            >
              {ADDABLE_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => { setTokenAddress(e.target.value); setAddError(null); }}
              placeholder="0x… token contract address"
              className="text-sm px-3 py-2 rounded-lg outline-none font-mono"
              style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
            />
            <button
              type="submit"
              disabled={adding || !tokenAddress || atCap}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all disabled:opacity-50"
              style={{ background: "#1CB8B8", boxShadow: "0 4px 16px rgba(28,184,184,0.25)" }}
            >
              {adding ? "Adding…" : atCap ? "At limit" : "Add →"}
            </button>
          </form>
          {addError && <p className="text-xs mt-3" style={{ color: "#B3322E" }}>{addError}</p>}
          {limit !== null && (
            <p className="text-[11px] mt-3" style={{ color: "var(--preview-text-3)" }}>
              {entries.length} / {limit} on free tier.{" "}
              {atCap && (
                <Link href="/pricing" className="font-semibold underline" style={{ color: "#1CB8B8" }}>
                  Upgrade to Pro for unlimited →
                </Link>
              )}
            </p>
          )}
        </div>

        {/* Entries */}
        {loading ? (
          <div className="text-sm" style={{ color: "var(--preview-text-3)" }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl p-8 text-center"
            style={{ background: "var(--preview-card)", border: "1px dashed var(--preview-border)", color: "var(--preview-text-3)" }}>
            <p className="text-sm mb-1">No tokens watched yet.</p>
            <p className="text-xs">Add a token contract above to start tracking its unlock schedule.</p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
            {entries.map((e, i) => (
              <div
                key={e.id}
                className="flex items-center gap-4 px-5 py-4"
                style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A" }}>
                  {(e.label?.[0] ?? e.tokenAddress.slice(2, 3)).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--preview-text)" }}>
                    {e.label ?? `${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`}
                  </div>
                  <div className="text-[11px] mt-0.5 font-mono truncate" style={{ color: "var(--preview-text-3)" }}>
                    {CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `Chain ${e.chainId}`} · {e.tokenAddress}
                  </div>
                </div>
                <Link
                  href={`/token/${e.chainId}/${e.tokenAddress}`}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ background: "rgba(28,184,184,0.10)", color: "#0F8A8A", border: "1px solid rgba(28,184,184,0.20)" }}
                >
                  View →
                </Link>
                <button
                  onClick={() => handleRemove(e.id)}
                  aria-label="Remove from watchlist"
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.04)", color: "var(--preview-text-3)" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
