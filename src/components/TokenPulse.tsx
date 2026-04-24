// src/components/TokenPulse.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Pulse summary card — sits near the top of /token/[chainId]/[address].
//
// Shows 3-4 bulleted insights about the token's current vesting state,
// with an expandable "See more" region that reveals a longer narrative
// paragraph. Uses native <details>/<summary> so the expand behaviour is
// SSR-correct and works without client-side React.
//
// Deliberate naming decision: this card is labelled "Pulse", NOT
// "AI Insights" — competitors use that label and we want to stay visually
// distinct. Pulse also lines up with TokenVest's "Live TVL / Live activity"
// vocabulary elsewhere on the site.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseOutput } from "@/lib/vesting/token-pulse";

interface Props {
  pulse:  PulseOutput;
  /** For the card header and fallback wording. */
  symbol: string;
}

export function TokenPulse({ pulse, symbol }: Props) {
  // Nothing to say — don't render an empty card.
  if (pulse.bullets.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "white",
        border:     "1px solid rgba(0,0,0,0.07)",
        boxShadow:  "0 4px 24px rgba(37,99,235,0.06)",
      }}
    >
      {/* Header strip — blue/purple gradient matching the rest of the site's
          "live" surfaces (TVL bar, upcoming unlocks). Uses a dot+ping pulse
          icon so the card visually signals "live data" consistent with the
          Live TVL and Upcoming Unlocks widgets on /protocols. */}
      <div
        className="flex items-center justify-between px-5 md:px-6 py-3 gap-3 flex-wrap"
        style={{
          background:   "linear-gradient(90deg, rgba(37,99,235,0.05), rgba(124,58,237,0.05))",
          borderBottom: "1px solid rgba(0,0,0,0.05)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "#7c3aed" }}
            />
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ background: "#7c3aed" }}
            />
          </span>
          <span
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: "#7c3aed" }}
          >
            Pulse · {symbol}
          </span>
        </div>
        {/* Long-form caption hidden on mobile — the pulsing dot + "Pulse"
            label already communicates "live data". Showing the full
            sentence alongside on a 375px viewport wraps to a second line
            and crowds the pill. */}
        <span className="hidden sm:inline text-[11px]" style={{ color: "#94a3b8" }}>
          Generated from TokenVest&rsquo;s indexed cache
        </span>
      </div>

      {/* Bullet body — scannable, 3-4 rows max. Each bullet is a single
          complete sentence so even a quick-skim visitor gets a full insight.
          The "See more" extended narrative that used to live below is
          removed for now — the bullets carry the insight and the extended
          paragraph didn't add enough on top to justify the extra UI. If we
          later wire Pulse to a real LLM, the extended surface can come
          back with genuinely richer content. */}
      <ul className="px-5 md:px-6 py-4 space-y-2">
        {pulse.bullets.map((b, i) => (
          <li
            key={i}
            className="flex gap-3 text-sm leading-relaxed"
            style={{ color: "#0f172a" }}
          >
            <span
              aria-hidden
              className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full"
              style={{ background: "#7c3aed" }}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
