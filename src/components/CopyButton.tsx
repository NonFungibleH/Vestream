"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Generic copy-to-clipboard button. Renders children (or a fallback display
// string) with a small copy icon; briefly shows "Copied!" on success.
//
// Used on token pages to make the contract address copyable without making the
// whole page a client component.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";

interface Props {
  /** The full string to copy to clipboard (e.g. the full contract address). */
  value:      string;
  /** What to display instead of `value` (e.g. a truncated address). */
  display:    string;
  className?: string;
  style?:     React.CSSProperties;
}

export function CopyButton({ value, display, className, style }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for browsers that block clipboard without user gesture
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : `Copy ${value}`}
      className={`inline-flex items-center gap-1 transition-colors ${className ?? ""}`}
      style={style}
    >
      <span className="font-mono">{display}</span>
      <span style={{ color: copied ? "#1CB8B8" : "#B8BABD", transition: "color 0.15s" }}>
        {copied ? (
          // Checkmark
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          // Copy icon
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
    </button>
  );
}
