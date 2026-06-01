"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Share actions row for token pages — two small icon buttons:
//   1. "Share on X" — opens a tweet intent with pre-filled text
//   2. "Copy link" — copies the page URL to clipboard
//
// This is a client component so it can use clipboard APIs and window.location.
// The token page is a server component; it passes the props in at render time.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";

interface Props {
  /** Full page URL — e.g. https://www.vestream.io/token/1/0x... */
  pageUrl:     string;
  /** Token symbol, used in the tweet text. */
  symbol:      string;
  /** Chain name, used in tweet text. */
  chainName:   string;
  /** Optional short summary of locked TVL for the tweet, e.g. "$2.8M". */
  lockedSummary?: string | null;
}

export function TokenShareRow({ pageUrl, symbol, chainName, lockedSummary }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* silent fallback */ }
  }, [pageUrl]);

  const tweetText = lockedSummary
    ? `Track $${symbol} unlocks on @Vestream_ — ${lockedSummary} still vesting on ${chainName}. Full schedule:`
    : `Track $${symbol} token vesting on @Vestream_ — live unlock calendar and alerts on ${chainName}.`;

  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(pageUrl)}`;

  return (
    <div className="flex items-center gap-2">
      {/* Share on X */}
      <a
        href={tweetUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Share ${symbol} on X`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
        style={{
          background: "rgba(0,0,0,0.04)",
          color: "#64748b",
          border: "1px solid rgba(0,0,0,0.07)",
        }}
      >
        {/* X logo */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.632 5.906-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share
      </a>

      {/* Copy link */}
      <button
        type="button"
        onClick={copyLink}
        title={copied ? "Copied!" : "Copy page link"}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
        style={{
          background: copied ? "rgba(28,184,184,0.08)" : "rgba(0,0,0,0.04)",
          color: copied ? "#0F8A8A" : "#64748b",
          border: `1px solid ${copied ? "rgba(28,184,184,0.25)" : "rgba(0,0,0,0.07)"}`,
          transition: "all 0.15s",
        }}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        )}
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
