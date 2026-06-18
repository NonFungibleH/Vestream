"use client";

// Dual-handle RANGE sliders for the explorer sidebar — drill into the token
// universe by wallets / locked USD / schedules / % vested, each with a min AND
// max bound (e.g. "30–50 wallets", "$500k–$1M locked"). All map to indexed
// rollup columns, so a change is a fast server re-query. Values snap to a stops
// array (round, human numbers); the top stop = "no upper limit". Commits on
// release (one navigation, not per drag tick) and resets to page 1.

import { useRouter } from "next/navigation";
import { useState } from "react";

function buildUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") sp.set(k, v);
  const qs = sp.toString();
  return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
}

const WALLET_STOPS = [0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, Infinity];
const ROUND_STOPS  = [0, 1, 2, 3, 4, 5, 7, 10, 15, 20, 30, Infinity];
const VESTED_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];        // %
const USD_STOPS    = [0, 1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, Infinity];

const fmtCount = (n: number) => (n === Infinity ? "∞" : `${n}`);
const fmtPct   = (n: number) => `${n}%`;
const fmtUsd   = (n: number) =>
  n === Infinity ? "∞"
  : n >= 1e6 ? `$${n / 1e6}M`
  : n >= 1e3 ? `$${n / 1e3}k`
  : `$${n}`;

export function ExplorerSliders({
  params, minWallets, maxWallets, minRounds, maxRounds, minVested, maxVested, usdMin, usdMax,
}: {
  params:     Record<string, string | undefined>;
  minWallets: number | undefined; maxWallets: number | undefined;
  minRounds:  number | undefined; maxRounds:  number | undefined;
  minVested:  number | undefined; maxVested:  number | undefined;  // 0–100
  usdMin:     number | undefined; usdMax:     number | undefined;
}) {
  return (
    <div className="space-y-4">
      <RangeSlider label="Wallets vested to" stops={WALLET_STOPS} format={fmtCount} valueMin={minWallets} valueMax={maxWallets} keyMin="minWallets" keyMax="maxWallets" params={params} />
      <RangeSlider label="Locked value"      stops={USD_STOPS}    format={fmtUsd}   valueMin={usdMin}     valueMax={usdMax}     keyMin="usdMin"     keyMax="usdMax"     params={params} />
      <RangeSlider label="Schedules"         stops={ROUND_STOPS}  format={fmtCount} valueMin={minRounds}  valueMax={maxRounds}  keyMin="minRounds"  keyMax="maxRounds"  params={params} />
      <RangeSlider label="Vested"            stops={VESTED_STOPS} format={fmtPct}   valueMin={minVested}  valueMax={maxVested}  keyMin="minVested"  keyMax="maxVested"  params={params} />
    </div>
  );
}

function nearestIdx(stops: number[], value: number | undefined, fallback: number): number {
  if (value == null) return fallback;
  let best = fallback, bd = Infinity;
  stops.forEach((s, i) => {
    const sv = s === Infinity ? Number.MAX_VALUE : s;
    const d = Math.abs(sv - value);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function RangeSlider({
  label, stops, format, valueMin, valueMax, keyMin, keyMax, params,
}: {
  label: string; stops: number[]; format: (n: number) => string;
  valueMin: number | undefined; valueMax: number | undefined;
  keyMin: string; keyMax: string; params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const N = stops.length - 1;
  const [lo, setLo] = useState(() => nearestIdx(stops, valueMin, 0));
  const [hi, setHi] = useState(() => nearestIdx(stops, valueMax, N));

  const commit = (loIdx: number, hiIdx: number) => {
    router.push(buildUrl({
      ...params,
      // min param only when above the bottom stop; max only when below the top.
      [keyMin]: loIdx > 0 ? String(stops[loIdx]) : undefined,
      [keyMax]: hiIdx < N ? String(stops[hiIdx]) : undefined,
      page: undefined,
    }), { scroll: false });
  };

  const active = lo > 0 || hi < N;
  const valueLabel = !active ? "Any"
    : `${format(stops[lo])} – ${hi < N ? format(stops[hi]) : "∞"}`;
  const leftPct  = (lo / N) * 100;
  const rightPct = ((N - hi) / N) * 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--preview-text-3)" }}>{label}</span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: active ? "#0F8A8A" : "var(--preview-text-3)" }}>{valueLabel}</span>
      </div>
      <div className="dual">
        <div className="track" />
        <div className="active" style={{ left: `${leftPct}%`, right: `${rightPct}%` }} />
        <input
          className="rng" type="range" min={0} max={N} step={1} value={lo} aria-label={`${label} minimum`}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
        />
        <input
          className="rng" type="range" min={0} max={N} step={1} value={hi} aria-label={`${label} maximum`}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
        />
      </div>
      <style jsx>{`
        .dual { position: relative; height: 18px; }
        .track, .active {
          position: absolute; top: 50%; transform: translateY(-50%);
          height: 4px; border-radius: 9999px;
        }
        .track  { left: 0; right: 0; background: var(--preview-muted-2); }
        .active { background: #0F8A8A; }
        .rng {
          position: absolute; top: 0; left: 0; width: 100%; height: 18px; margin: 0;
          background: transparent; -webkit-appearance: none; appearance: none;
          pointer-events: none;
        }
        .rng::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #0F8A8A; border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer; pointer-events: auto;
        }
        .rng::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: #0F8A8A; border: 2px solid white; cursor: pointer; pointer-events: auto;
        }
      `}</style>
    </div>
  );
}
