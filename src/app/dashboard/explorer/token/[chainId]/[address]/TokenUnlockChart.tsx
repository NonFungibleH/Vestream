"use client";

// Single overview graph: cumulative unlocked tokens over time, stacked by
// round. Pure inline SVG (matches the codebase's other charts). Each round is
// one band, coloured to match the rounds list below.

import { useMemo } from "react";
import type { Round } from "@/lib/vesting/rounds";
import type { VestingStream } from "@/lib/vesting/types";
import { roundColor } from "./round-colors";

const W = 760, H = 240, PAD_L = 10, PAD_R = 10, PAD_T = 12, PAD_B = 26;
const N = 64;

function vestedWhole(s: VestingStream, t: number): number {
  const dec = s.tokenDecimals ?? 18;
  const total = Number(BigInt(s.totalAmount ?? "0")) / 10 ** dec;
  const start = s.startTime;
  const end = s.endTime;
  const cliff = s.cliffTime ?? start;
  if (t < cliff) return 0;
  if (end <= start || t >= end) return total;
  if (s.shape === "steps" && s.unlockSteps?.length) {
    let sum = 0;
    for (const st of s.unlockSteps) if (st.timestamp <= t) sum += Number(BigInt(st.amount)) / 10 ** dec;
    return sum;
  }
  return (total * (t - start)) / (end - start);
}

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
const fmtDate = (t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

export function TokenUnlockChart({ rounds, symbol }: { rounds: Round[]; symbol: string }) {
  const model = useMemo(() => {
    let minT = Infinity, maxT = -Infinity;
    for (const r of rounds) for (const s of r.streams) {
      if (s.startTime < minT) minT = s.startTime;
      if (s.endTime > maxT) maxT = s.endTime;
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) return null;
    const ts = Array.from({ length: N }, (_, i) => minT + ((maxT - minT) * i) / (N - 1));
    const series = rounds.map((r) => ts.map((t) => r.streams.reduce((a, s) => a + vestedWhole(s, t), 0)));
    const totals = ts.map((_, i) => series.reduce((a, ser) => a + ser[i], 0));
    const maxTotal = Math.max(...totals, 1);
    return { ts, series, maxTotal, minT, maxT };
  }, [rounds]);

  if (!model) return null;
  const { ts, series, maxTotal, minT, maxT } = model;

  const x = (i: number) => PAD_L + ((W - PAD_L - PAD_R) * i) / (N - 1);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxTotal);

  const baseline = new Array(N).fill(0) as number[];
  const bands = series.map((ser, idx) => {
    const upper = ser.map((v, i) => baseline[i] + v);
    let d = upper.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    for (let i = N - 1; i >= 0; i--) d += `L${x(i).toFixed(1)},${y(baseline[i]).toFixed(1)}`;
    d += "Z";
    for (let i = 0; i < N; i++) baseline[i] = upper[i];
    return { d, color: roundColor(idx) };
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {/* y gridline + max label */}
        <line x1={PAD_L} y1={y(maxTotal)} x2={W - PAD_R} y2={y(maxTotal)} stroke="var(--preview-border-2)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={PAD_L} y={y(maxTotal) - 4} fontSize={9} fill="var(--preview-text-3)">{fmtNum(maxTotal)} {symbol}</text>
        {bands.map((b, i) => (
          <path key={i} d={b.d} fill={b.color} fillOpacity={0.55} stroke={b.color} strokeWidth={1} />
        ))}
        {/* x date ticks */}
        {[0, Math.floor(N / 2), N - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize={9} fill="var(--preview-text-3)"
            textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}>
            {fmtDate(ts[i])}
          </text>
        ))}
      </svg>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {rounds.map((r, i) => (
          <div key={r.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: roundColor(i) }} />
            <span className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
