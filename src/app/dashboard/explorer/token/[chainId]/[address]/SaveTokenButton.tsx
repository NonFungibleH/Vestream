"use client";

// Star/save toggle on the token drill-down. Persists to the existing
// /api/watchlist endpoint (the watchlist table is now surfaced as "saved
// tokens" in the Index rather than its own page).

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";

interface Entry { id: string; chainId: number; tokenAddress: string }

export function SaveTokenButton({
  chainId, address, symbol,
}: {
  chainId: number; address: string; symbol: string;
}) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const matchId = (entries: Entry[]) =>
    entries.find((e) => e.chainId === chainId && e.tokenAddress?.toLowerCase() === address.toLowerCase())?.id ?? null;

  useEffect(() => {
    let alive = true;
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (alive && data) setSavedId(matchId(data.entries ?? [])); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, address]);

  async function toggle() {
    if (busy || loading) return;
    setBusy(true);
    try {
      if (savedId) {
        await fetch(`/api/watchlist?id=${savedId}`, { method: "DELETE" });
        setSavedId(null);
        track("cta_clicked", { cta_id: "token_unsaved", chain_id: chainId });
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainId, tokenAddress: address, label: symbol }),
        });
        if (res.ok) {
          // Re-read to capture the new entry's id regardless of POST body shape.
          const data = await fetch("/api/watchlist").then((r) => (r.ok ? r.json() : null));
          setSavedId(data ? matchId(data.entries ?? []) : "saved");
          track("cta_clicked", { cta_id: "token_saved", chain_id: chainId });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const saved = !!savedId;
  return (
    <button
      onClick={toggle}
      disabled={loading || busy}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50"
      style={saved
        ? { background: "rgba(28,184,184,0.12)", color: "#0F8A8A", borderColor: "rgba(28,184,184,0.3)" }
        : { background: "var(--preview-card)", color: "var(--preview-text-2)", borderColor: "var(--preview-border)" }}
      title={saved ? "Remove from saved tokens" : "Save this token"}
    >
      <span>{saved ? "★" : "☆"}</span>{saved ? "Saved" : "Save"}
    </button>
  );
}
