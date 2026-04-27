"use client";

// src/components/CopyableCode.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Code block with a built-in "Copy" button. Used on the /ai install snippets,
// /developer/quickstart, and anywhere else where the user is meant to grab
// JSON / shell to paste into a config file.
//
// Theming is intentionally minimal — the host page sets the surrounding
// card background, this component just paints a darker inset over it. Keeps
// the component reusable across navy (/developer) and near-black (/ai)
// themes without needing a `theme` prop.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

interface Props {
  code:    string;
  /** Small uppercase eyebrow above the block (e.g. "claude_desktop_config.json"). */
  label?:  string;
}

export function CopyableCode({ code, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (HTTP context, sandbox) — user can still
      // select-copy the visible text.
    }
  }

  return (
    <div className="relative">
      {label && (
        <p
          className="text-[10px] uppercase tracking-widest font-bold mb-1.5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          {label}
        </p>
      )}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#080a10", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <pre
          className="p-5 text-xs leading-relaxed overflow-x-auto"
          style={{
            color:      "#a5f3fc",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            whiteSpace: "pre",
          }}
        >
{code}
        </pre>
      </div>
      <button
        onClick={copy}
        type="button"
        aria-label="Copy code"
        className="absolute top-2 right-2 text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
        style={{
          background: copied ? "rgba(45,179,106,0.15)" : "rgba(28,184,184,0.12)",
          color:      copied ? "#2DB36A" : "#1CB8B8",
          border:     copied ? "1px solid rgba(45,179,106,0.30)" : "1px solid rgba(28,184,184,0.30)",
        }}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
