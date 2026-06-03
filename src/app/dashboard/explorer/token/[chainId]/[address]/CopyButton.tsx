"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title={copied ? "Copied!" : "Copy contract address"}
      className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors"
      style={{ color: "var(--preview-text-3)", background: "var(--preview-muted-2)" }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
