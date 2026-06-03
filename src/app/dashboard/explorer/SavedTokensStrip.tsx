"use client";

// Saved tokens, surfaced in the Vesting Index (replaces the standalone
// watchlist page). Reads the existing /api/watchlist endpoint and links each
// saved token into its drill-down. Hidden when nothing is saved.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CHAIN_NAMES, type SupportedChainId } from "@/lib/vesting/types";

interface Entry { id: string; chainId: number; tokenAddress: string; label: string | null }

export function SavedTokensStrip() {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/watchlist")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setEntries(d.entries ?? []); });
    return () => { alive = false; };
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <div className="mb-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--preview-text-3)" }}>
        Saved tokens
      </p>
      <div className="flex flex-wrap gap-2">
        {entries.map((e) => (
          <Link
            key={e.id}
            href={`/dashboard/explorer/token/${e.chainId}/${e.tokenAddress}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:bg-[var(--preview-muted)]"
            style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", color: "var(--preview-text-2)" }}
          >
            <span style={{ color: "#0F8A8A" }}>★</span>
            {e.label || `${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`}
            <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
              {CHAIN_NAMES[e.chainId as SupportedChainId] ?? e.chainId}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
