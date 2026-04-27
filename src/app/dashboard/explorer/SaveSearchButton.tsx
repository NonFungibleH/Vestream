"use client";

// Tiny client island for the "Save this search" button on the explorer.
// On click, POSTs the current URL params to /api/dashboard/explorer/saved
// with optional alerts. Renders nothing for free users (gated by props
// from the server page).

import { useState } from "react";
import { useSearchParams } from "next/navigation";

interface Props {
  isPaid: boolean;
}

export function SaveSearchButton({ isPaid }: Props) {
  const sp = useSearchParams();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [alertsEnabled, setAlerts] = useState(false);

  if (!isPaid) {
    return null;
  }

  async function save() {
    if (state === "saving") return;
    setState("saving");
    const params: Record<string, string> = {};
    sp.forEach((value, key) => { params[key] = value; });

    try {
      const r = await fetch("/api/dashboard/explorer/saved", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ params, alertsEnabled }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setState("saved");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  const label =
    state === "saving" ? "Saving…" :
    state === "saved"  ? "Saved ✓" :
    state === "error"  ? "Try again" :
    "Save search";

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer select-none"
        style={{ color: "var(--preview-text-2)" }}>
        <input
          type="checkbox"
          checked={alertsEnabled}
          onChange={(e) => setAlerts(e.target.checked)}
          className="w-3.5 h-3.5 rounded"
        />
        Alert on new matches
      </label>
      <button
        onClick={save}
        disabled={state === "saving"}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
        style={{
          background: state === "saved" ? "rgba(63,165,104,0.10)" : "rgba(28,184,184,0.10)",
          color:      state === "saved" ? "#3FA568" : "#0F8A8A",
          border:     state === "saved" ? "1px solid rgba(63,165,104,0.25)" : "1px solid rgba(28,184,184,0.25)",
        }}
      >
        {label}
      </button>
    </div>
  );
}
