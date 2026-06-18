"use client";

// Vesting rounds for a token. Each round is a collapsible card; expanding it
// reveals every wallet in that round with amount, dates, claimed, claimable.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Round } from "@/lib/vesting/rounds";
import type { VestingStream } from "@/lib/vesting/types";
import { CopyButton } from "@/components/CopyButton";
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
// Compact month-year for date RANGES (staggered cohorts span many months —
// "Jun 2026 → Apr 2027" reads cleaner than two full dates).
const fmtMonthYear = (t: number | null | undefined) =>
  t ? new Date(t * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "—";
// Relative time to an unlock — the at-a-glance differentiator between rounds.
const relUntil = (t: number | null | undefined): string => {
  if (!t) return "";
  const diff = t - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "now";
  const days = diff / 86_400;
  if (days >= 365) { const y = days / 365.25; return `in ${y < 10 ? y.toFixed(1) : Math.round(y)} yr`; }
  if (days >= 30)  return `in ${Math.round(days / 30.44)} mo`;
  if (days >= 1)   return `in ${Math.round(days)} d`;
  return "today";
};
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
        const cliffOnly = r.durationDays > 0 && r.cliffOffsetDays >= r.durationDays - 3;
        // Instant = each stream's start == end (a lump on one date). When such
        // streams have DIFFERENT dates they group into one round by terms, so
        // it's a STAGGERED cohort — show its date RANGE, not a single date, and
        // say so in the cadence. This is the CHEEL case users found confusing.
        const isInstant = r.durationDays === 0;
        const staggered = isInstant && (r.windowEnd - r.windowStart > 2 * 86400);
        const cadence =
          isInstant
            ? (staggered ? "Each wallet unlocks in full on its own date" : "Unlocks in full at once")
          : cliffOnly
            ? "Unlocks in full at the cliff"
          : r.shape === "steps" ? "Stepped unlocks" : "Continuous (linear)";
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
                {/* Date dropped from here — it now lives in the prominent block on
                    the right, so near-identical rounds (same protocol/amount/
                    cadence) are told apart by their unlock date at a glance. */}
                <div className="text-[11px] mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                  {r.recipientCount} wallet{r.recipientCount !== 1 ? "s" : ""} · {fmtNum(whole(r.totalLocked, dec))} {symbol} locked · {cadence}
                </div>
              </div>
              {/* Prominent unlock-date block — the primary differentiator.
                  Staggered instant cohorts show the date RANGE (each wallet
                  unlocks on its own date), so "Jun 2026 → Apr 2027" reads as a
                  window instead of a single misleading "next" date. */}
              {staggered ? (
                <div className="text-right flex-shrink-0 mr-1">
                  <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--preview-text-2)" }}>
                    {fmtMonthYear(r.windowStart)} → {fmtMonthYear(r.windowEnd)}
                  </div>
                  <div className="text-[10px]" style={{ color: c }}>staggered dates</div>
                </div>
              ) : r.nextUnlockTime != null ? (
                <div className="text-right flex-shrink-0 mr-1">
                  <div className="text-xs font-semibold tabular-nums" style={{ color: "var(--preview-text-2)" }}>{fmtDate(r.nextUnlockTime)}</div>
                  <div className="text-[10px] tabular-nums" style={{ color: c }}>{relUntil(r.nextUnlockTime)}</div>
                </div>
              ) : null}
              <span className="text-[11px] flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="overflow-x-auto border-t" style={{ borderColor: "var(--preview-border-2)" }}>
                <WalletTable wallets={wallets} dec={dec} />
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

// ── Sortable wallet table (per expanded round) ──────────────────────────────
// In-memory sort over the round's wallets — clicking a header reorders rows
// instantly with zero round-trip (mirrors ExplorerTable's pattern).

type WalletSortCol = "amount" | "start" | "cliff" | "end" | "claimed" | "claimable";
type WalletSortDir = "asc" | "desc";

function walletSortValue(s: VestingStream, col: WalletSortCol): number {
  switch (col) {
    case "amount":    return Number(BigInt(s.totalAmount ?? "0"));
    case "start":     return s.startTime ?? 0;
    case "cliff":     return s.cliffTime ?? 0;
    case "end":       return s.endTime ?? 0;
    case "claimed":   return Number(BigInt(s.withdrawnAmount ?? "0"));
    case "claimable": return Number(BigInt(s.claimableNow ?? "0"));
  }
}

function WalletTable({ wallets, dec }: { wallets: VestingStream[]; dec: number }) {
  const [col, setCol] = useState<WalletSortCol | null>(null);
  const [dir, setDir] = useState<WalletSortDir>("desc");

  const sorted = useMemo(() => {
    if (!col) return wallets;
    const copy = [...wallets];
    copy.sort((a, b) => {
      const cmp = walletSortValue(a, col) - walletSortValue(b, col);
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [wallets, col, dir]);

  function toggle(next: WalletSortCol, defaultDir: WalletSortDir) {
    if (next === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setCol(next); setDir(defaultDir); }
  }

  return (
    <table className="w-full text-[12px] whitespace-nowrap">
      <thead>
        <tr style={{ color: "var(--preview-text-3)" }}>
          <th className="text-left font-medium px-4 md:px-5 py-2">Wallet</th>
          <Wth label="Amount"    align="right" active={col === "amount"}    dir={dir} onClick={() => toggle("amount", "desc")} />
          <Wth label="Start"     align="left"  active={col === "start"}     dir={dir} onClick={() => toggle("start", "asc")} />
          <Wth label="Cliff"     align="left"  active={col === "cliff"}     dir={dir} onClick={() => toggle("cliff", "asc")} />
          <Wth label="End"       align="left"  active={col === "end"}       dir={dir} onClick={() => toggle("end", "asc")} />
          <Wth label="Claimed"   align="right" active={col === "claimed"}   dir={dir} onClick={() => toggle("claimed", "desc")} />
          <Wth label="Claimable" align="right" active={col === "claimable"} dir={dir} onClick={() => toggle("claimable", "desc")} last />
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => (
          <tr key={s.id} className="border-t" style={{ borderColor: "var(--preview-border-2)" }}>
            <td className="px-4 md:px-5 py-2">
              <CopyButton
                value={s.recipient}
                display={trunc(s.recipient)}
                style={{ color: "#0F8A8A" }}
              />
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
  );
}

function Wth({
  label, align, active, dir, onClick, last,
}: {
  label: string; align: "left" | "right"; active: boolean;
  dir: WalletSortDir; onClick: () => void; last?: boolean;
}) {
  const pad = last ? "px-4 md:px-5" : "px-2";
  return (
    <th className={`font-medium ${pad} py-2 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
        aria-label={`Sort by ${label}`}
      >
        <span className="transition-colors" style={{ color: active ? "#0F8A8A" : "inherit" }}>{label}</span>
        <span className="text-[8px]" style={{ color: active ? "#0F8A8A" : "transparent" }}>
          {active ? (dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      </button>
    </th>
  );
}
