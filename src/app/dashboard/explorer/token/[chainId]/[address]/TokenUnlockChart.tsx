"use client";

// Overview graph with two lenses, toggled by the user:
//   • Cumulative — total unlocked over time, stacked area by round (the
//     "how much is out by date X" view).
//   • Per period — how much unlocks in each time bucket, stacked bars by round
//     (the "when do tokens actually hit" view — far more intuitive for spotting
//     unlock cliffs/waves).
// Pure inline SVG (matches the codebase's other charts), coloured to match the
// rounds list below.

import { useMemo, useState } from "react";
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

type Mode = "cumulative" | "bars";

export function TokenUnlockChart({ rounds, symbol }: { rounds: Round[]; symbol: string }) {
  const [mode, setMode] = useState<Mode>("cumulative");

  const model = useMemo(() => {
    let minT = Infinity, maxT = -Infinity;
    for (const r of rounds) for (const s of r.streams) {
      if (s.startTime < minT) minT = s.startTime;
      if (s.endTime > maxT) maxT = s.endTime;
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT) || maxT <= minT) return null;
    const ts = Array.from({ length: N }, (_, i) => minT + ((maxT - minT) * i) / (N - 1));
    // Cumulative vested per round at each sample point.
    const series = rounds.map((r) => ts.map((t) => r.streams.reduce((a, s) => a + vestedWhole(s, t), 0)));
    const totals = ts.map((_, i) => series.reduce((a, ser) => a + ser[i], 0));
    const maxTotal = Math.max(...totals, 1);
    // Per-bucket DELTA per round (how much unlocked since the previous point).
    const deltas = rounds.map((_, r) => ts.map((_, i) => (i ? Math.max(0, series[r][i] - series[r][i - 1]) : series[r][0])));
    const bucketTotals = ts.map((_, i) => deltas.reduce((a, d) => a + d[i], 0));
    const maxDelta = Math.max(...bucketTotals, 1);
    return { ts, series, totals, maxTotal, deltas, maxDelta };
  }, [rounds]);

  if (!model) return null;
  const { ts, series, maxTotal, deltas, maxDelta } = model;

  const x = (i: number) => PAD_L + ((W - PAD_L - PAD_R) * i) / (N - 1);
  const yArea = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxTotal);
  const yBar  = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxDelta);
  const axisMax = mode === "cumulative" ? maxTotal : maxDelta;

  // Cumulative: stacked area bands.
  const baseline = new Array(N).fill(0) as number[];
  const bands = series.map((ser, idx) => {
    const upper = ser.map((v, i) => baseline[i] + v);
    let d = upper.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yArea(v).toFixed(1)}`).join("");
    for (let i = N - 1; i >= 0; i--) d += `L${x(i).toFixed(1)},${yArea(baseline[i]).toFixed(1)}`;
    d += "Z";
    for (let i = 0; i < N; i++) baseline[i] = upper[i];
    return { d, color: roundColor(idx) };
  });

  // Per period: stacked bars (one stack per sample bucket).
  const barW = Math.max(1.5, ((W - PAD_L - PAD_R) / N) * 0.7);
  const zeroY = yBar(0);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <div className="inline-flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--preview-border)" }}>
          {(["cumulative", "bars"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="text-[11px] font-semibold px-2.5 py-1 transition-colors"
              style={{
                background: mode === m ? "#0F8A8A" : "transparent",
                color: mode === m ? "white" : "var(--preview-text-3)",
              }}>
              {m === "cumulative" ? "Cumulative" : "Per period"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {/* y gridline + max label */}
        <line x1={PAD_L} y1={PAD_T} x2={W - PAD_R} y2={PAD_T} stroke="var(--preview-border-2)" strokeWidth={1} strokeDasharray="3 3" />
        <text x={PAD_L} y={PAD_T - 4} fontSize={9} fill="var(--preview-text-3)">{fmtNum(axisMax)} {symbol}{mode === "bars" ? " / period" : ""}</text>

        {mode === "cumulative"
          ? bands.map((b, i) => (
              <path key={i} d={b.d} fill={b.color} fillOpacity={0.55} stroke={b.color} strokeWidth={1} />
            ))
          : ts.map((_, i) => {
              // stack this bucket's round deltas
              let yTop = zeroY;
              const rects: React.ReactNode[] = [];
              for (let r = 0; r < deltas.length; r++) {
                const v = deltas[r][i];
                if (v <= 0) continue;
                const h = (zeroY - yBar(v));
                yTop -= h;
                rects.push(<rect key={r} x={x(i) - barW / 2} y={yTop} width={barW} height={Math.max(0.5, h)} fill={roundColor(r)} fillOpacity={0.85} />);
              }
              return <g key={i}>{rects}</g>;
            })}

        {/* x date ticks */}
        {[0, Math.floor(N / 2), N - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize={9} fill="var(--preview-text-3)"
            textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"}>
            {fmtDate(ts[i])}
          </text>
        ))}
      </svg>

      {/* legend (rounds — same colours in both modes) */}
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
