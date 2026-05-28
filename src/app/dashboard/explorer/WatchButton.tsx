"use client";

// WatchButton — small client island for the Explorer row-level watch action.
//
// Adds or removes a token from the user's Token Watchlist
// (POST/DELETE /api/watchlist) without navigating away.
// Renders a bookmark icon that fills when the token is already watched.

import { useState, useTransition } from "react";

interface WatchButtonProps {
  /** Lowercase token contract address */
  tokenAddress: string;
  chainId: number;
  tokenSymbol: string | null;
}

export function WatchButton({ tokenAddress, chainId, tokenSymbol }: WatchButtonProps) {
  const [watching, setWatching] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;
    startTransition(async () => {
      if (watching) {
        await fetch(`/api/watchlist?tokenAddress=${encodeURIComponent(tokenAddress)}&chainId=${chainId}`, {
          method: "DELETE",
        });
        setWatching(false);
      } else {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenAddress, chainId, label: tokenSymbol }),
        });
        setWatching(true);
      }
    });
  }

  return (
    <button
      onClick={toggle}
      title={watching ? `Unwatch ${tokenSymbol ?? "token"}` : `Watch ${tokenSymbol ?? "token"}`}
      aria-label={watching ? "Remove from watchlist" : "Add to watchlist"}
      className="flex-shrink-0 p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
      style={{
        color: watching ? "#1CB8B8" : "var(--preview-text-3)",
        background: watching ? "rgba(28,184,184,0.10)" : "transparent",
        border: watching ? "1px solid rgba(28,184,184,0.25)" : "1px solid transparent",
        opacity: isPending ? 0.5 : 1,
      }}
      onMouseEnter={(ev) => { if (!watching) ev.currentTarget.style.color = "var(--preview-text-2)"; }}
      onMouseLeave={(ev) => { if (!watching) ev.currentTarget.style.color = "var(--preview-text-3)"; }}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill={watching ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
  );
}
