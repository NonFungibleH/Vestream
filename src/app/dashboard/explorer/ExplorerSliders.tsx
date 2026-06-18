"use client";

// Numeric drill-down sliders for the explorer sidebar: minimum wallets,
// schedules (rounds), and % vested. Each maps to an indexed rollup column, so
// filtering is a fast server re-query. To avoid a request per drag tick, the
// thumb is locally controlled and we only navigate on RELEASE (pointer/key up).
// Resets to page 1 on change.

import { useRouter } from "next/navigation";
import { useState } from "react";

function buildUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/dashboard/explorer?${qs}` : "/dashboard/explorer";
}

export function ExplorerSliders({
  params, minWallets, minRounds, minVested,
}: {
  params:     Record<string, string | undefined>;
  minWallets: number;   // current values (0 = off)
  minRounds:  number;
  minVested:  number;   // 0–100
}) {
  return (
    <div className="space-y-3.5">
      <Slider label="Wallets vested to" suffix="+" min={0} max={500} step={5} value={minWallets} paramKey="minWallets" params={params} />
      <Slider label="Schedules (rounds)" suffix="+" min={0} max={50}  step={1} value={minRounds}  paramKey="minRounds"  params={params} />
      <Slider label="Vested"             suffix="%" min={0} max={100} step={5} value={minVested}  paramKey="minVested"  params={params} />
    </div>
  );
}

function Slider({
  label, suffix, min, max, step, value, paramKey, params,
}: {
  label: string; suffix: string; min: number; max: number; step: number;
  value: number; paramKey: string; params: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [v, setV] = useState(value);

  const commit = (n: number) => {
    router.push(
      buildUrl({ ...params, [paramKey]: n > 0 ? String(n) : undefined, page: undefined }),
      { scroll: false },
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: "var(--preview-text-3)" }}>{label}</span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: v > 0 ? "#0F8A8A" : "var(--preview-text-3)" }}>
          {v > 0 ? (suffix === "%" ? `${v}%+` : `${v}${suffix}`) : "Any"}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        aria-label={label}
        className="w-full h-1.5 cursor-pointer"
        style={{ accentColor: "#0F8A8A" }}
      />
    </div>
  );
}
