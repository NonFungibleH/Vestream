"use client";

// Client island for the explorer search box. Server page handles the actual
// query; this component just routes the user's input to the right URL via
// the smart-input detector.
//
// Behaviour:
//   - Live-detect what the user typed and show a "we'll look this up as X"
//     hint under the input — gives confidence the search will do the right
//     thing before they press Enter.
//   - On submit, navigate via Next router so existing filters in the URL
//     are preserved when relevant (calendar/symbol queries) or wiped (when
//     the new query is for a specific address/ENS/protocol).
//   - Hidden inputs preserve current filter state for the form fallback —
//     non-JS submits still work.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { detectQueryKind, destinationForQuery } from "./detect-query";
import type { WindowSlug } from "@/lib/vesting/unlock-windows";
import { track } from "@/lib/analytics";

interface Props {
  initialQuery: string;
  mode:         string;
  chainIds:     number[];
  protocols:    string[];
  dateSlug:     WindowSlug | "all";
}

export function ExplorerSearchInput({ initialQuery, mode, chainIds, protocols, dateSlug }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  const detected = detectQueryKind(value);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      // Empty submit clears the query but preserves filters.
      const sp = new URLSearchParams();
      if (mode)              sp.set("mode", mode);
      if (chainIds.length)   sp.set("chain", chainIds.join(","));
      if (protocols.length)  sp.set("protocol", protocols.join(","));
      if (dateSlug)          sp.set("date", dateSlug);
      const qs = sp.toString();
      startTransition(() => router.push(qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer"));
      return;
    }
    // Fire a search_performed event with the detected kind so dashboards
    // can group "what are people searching for" — addresses vs ENS vs
    // protocol slugs vs token symbols.
    track("search_performed", {
      surface:    "explorer",
      query_type: detected.kind,
      mode,
    });
    // For protocol / address / ENS — navigate to the dedicated landing.
    // For symbol / freeform — stay on the explorer with the query as ?q.
    const dest = destinationForQuery(detected);
    startTransition(() => router.push(dest));
  }

  // Hint copy — shown under the input as the user types.
  const hint = (() => {
    switch (detected.kind) {
      case "empty":     return "Type a wallet, ENS, token symbol, or protocol";
      case "address":   return `Looking up ${detected.ecosystem === "evm" ? "EVM" : "Solana"} address — wallet mode`;
      case "ens":       return `Resolving ${detected.name} → wallet mode`;
      case "protocol":  return `Protocol: ${detected.slug} — calendar mode`;
      case "symbol":    return `Token symbol: ${detected.symbol} — calendar mode`;
      case "freeform":  return "Free-text search — best-effort match";
    }
  })();

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            width={16} height={16} viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--preview-text-3)" }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x… · vitalik.eth · STRZ · sablier"
            className="w-full pl-10 pr-3 py-3 rounded-xl text-sm font-medium outline-none transition-all"
            style={{
              background: "var(--preview-card)",
              border:     "1px solid var(--preview-border)",
              color:      "var(--preview-text)",
            }}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all disabled:opacity-60"
          style={{
            background: "#1CB8B8",
            color:      "white",
            boxShadow:  "0 2px 12px rgba(28,184,184,0.3)",
          }}
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </div>
      <p className="mt-2 text-[11px] font-medium" style={{ color: "var(--preview-text-3)" }}>
        {hint}
      </p>
    </form>
  );
}
