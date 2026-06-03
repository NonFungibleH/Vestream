"use client";

// Vesting rounds for a token. Each round is a collapsible card; expanding it
// reveals every wallet in that round with amount, dates, claimed, claimable.

import { useState } from "react";
import Link from "next/link";
import type { Round } from "@/lib/vesting/rounds";
import { roundColor } from "./round-colors";

const PROTO: Record<string, string> = {
  sablier: "Sablier", hedgey: "Hedgey", uncx: "UNCX", "uncx-vm": "UNCX",
  unvest: "Unvest", superfluid: "Superfluid", pinksale: "PinkSale",
  streamflow: "Streamflow", "jupiter-lock": "Jupiter Lock",
};
const proto = (p: string) => PROTO[p] ?? p;

const whole = (raw: string | undefined, dec: number) => Number(BigInt(raw ?? "0")) / 10 ** dec;
const fmtNum = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M`
  : n >= 1e3 ? `${(n / 1e3).toFixed(2)}K`
  : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtDate = (t: number | null | undefined) =>
  t ? new Date(t * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
const trunc = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function RoundsList({
  rounds, symbol, isFree, rowCap,
}: {
  rounds: Round[]; symbol: string; isFree: boolean; rowCap: number;
}) {
  const [open, setOpen] = useState<string | null>(rounds[0]?.key ?? null);
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-3">
      {rounds.map((r, i) => {
        const c = roundColor(i);
        const dec = r.streams[0]?.tokenDecimals ?? 18;
        const isOpen = open === r.key;
        const wallets = isFree ? r.streams.slice(0, rowCap) : r.streams;
        const hidden = r.streams.length - wallets.length;
        const cadence = r.shape === "steps" ? "Stepped unlocks" : "Continuous (linear)";
        return (
          <div key={r.key} className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
            <button onClick={() => setOpen(isOpen ? null : r.key)}
              className="w-full flex items-center gap-3 px-4 md:px-5 py-3.5 text-left">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
                  {r.label}{" "}
                  <span className="font-normal" style={{ color: "var(--preview-text-3)" }}>· {proto(r.protocol)}</span>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                  {r.recipientCount} wallet{r.recipientCount !== 1 ? "s" : ""} · {fmtNum(whole(r.totalLocked, dec))} {symbol} locked · {cadence} · next {fmtDate(r.nextUnlockTime)}
                </div>
              </div>
              <span className="text-[11px] flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="overflow-x-auto border-t" style={{ borderColor: "var(--preview-border-2)" }}>
                <table className="w-full text-[12px] whitespace-nowrap">
                  <thead>
                    <tr style={{ color: "var(--preview-text-3)" }}>
                      <th className="text-left font-medium px-4 md:px-5 py-2">Wallet</th>
                      <th className="text-right font-medium px-2 py-2">Amount</th>
                      <th className="text-left font-medium px-2 py-2">Start</th>
                      <th className="text-left font-medium px-2 py-2">Cliff</th>
                      <th className="text-left font-medium px-2 py-2">End</th>
                      <th className="text-right font-medium px-2 py-2">Claimed</th>
                      <th className="text-right font-medium px-4 md:px-5 py-2">Claimable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wallets.map((s) => (
                      <tr key={s.id} className="border-t" style={{ borderColor: "var(--preview-border-2)" }}>
                        <td className="px-4 md:px-5 py-2">
                          <Link href={`/dashboard/explorer?q=${s.recipient}&mode=wallet`}
                            className="font-mono hover:underline" style={{ color: "#0F8A8A" }}>
                            {trunc(s.recipient)}
                          </Link>
                        </td>
                        <td className="text-right px-2 py-2 tabular-nums" style={{ color: "var(--preview-text)" }}>{fmtNum(whole(s.totalAmount, dec))}</td>
                        <td className="px-2 py-2" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.startTime)}</td>
                        <td className="px-2 py-2" style={{ color: "var(--preview-text-2)" }}>{s.cliffTime ? fmtDate(s.cliffTime) : "—"}</td>
                        <td className="px-2 py-2" style={{ color: "var(--preview-text-2)" }}>{fmtDate(s.endTime)}</td>
                        <td className="text-right px-2 py-2 tabular-nums" style={{ color: "var(--preview-text-3)" }}>{fmtNum(whole(s.withdrawnAmount, dec))}</td>
                        <td className="text-right px-4 md:px-5 py-2 tabular-nums" style={{ color: "#3FA568" }}>{fmtNum(whole(s.claimableNow, dec))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hidden > 0 && (
                  <div className="px-4 md:px-5 py-2.5 text-[11px] border-t" style={{ borderColor: "var(--preview-border-2)", color: "var(--preview-text-3)" }}>
                    +{hidden} more wallet{hidden !== 1 ? "s" : ""} —{" "}
                    <Link href="/pricing" className="underline" style={{ color: "#1CB8B8" }}>upgrade to Pro</Link> to see all.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
