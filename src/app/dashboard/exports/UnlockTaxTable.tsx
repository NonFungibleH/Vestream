"use client";

// src/app/dashboard/exports/UnlockTaxTable.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The accrual-basis half of the Tax tool. Shows one row per unlock tranche with
// BOTH bases side by side — when the tokens became available (+ price then) and
// when they were claimed (+ price then) — so a user exports on whichever basis
// their jurisdiction requires. Claim-basis is the default; unlock is opt-in via
// the toggle, which persists to /api/tax/basis.
//
// Data: GET /api/tax/unlock-events → { basis, events: TaxEventRow[] }.
// Pre-liquid tokens (unlock before listing) have no historical price → the row
// is flagged "needs your input" with an inline FMV entry that PUTs to
// /api/tax/unlock-events/[id]/price.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getProtocol } from "@/lib/protocol-constants";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toast";
import { track } from "@/lib/analytics";

interface TaxEvent {
  id: string;
  protocol: string;
  chainId: number;
  tokenAddress: string;
  tokenSymbol: string | null;
  tokenDecimals: number;
  amount: string;
  unlockTime: string;
  usdAtUnlock: string | null;
  unlockConfidence: string;
  manualPrice: boolean;
  claimedAt: string | null;
  usdAtClaim: string | null;
  claimConfidence: string | null;
  needsInput: boolean;
}

type Basis = "claim" | "unlock";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function tokensWhole(amount: string, decimals: number): string {
  try {
    const whole = Number(BigInt(amount)) / Math.pow(10, Math.min(decimals, 30));
    return whole.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return amount;
  }
}

function fmtUsd(v: string | null): string {
  if (v == null) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function unitPrice(usd: string | null, amount: string, decimals: number): string {
  if (usd == null) return "–";
  try {
    const whole = Number(BigInt(amount)) / Math.pow(10, Math.min(decimals, 30));
    if (whole === 0) return "–";
    const p = Number(usd) / whole;
    return `$${p.toLocaleString(undefined, { maximumFractionDigits: p < 1 ? 6 : 4 })}`;
  } catch {
    return "–";
  }
}

function isoDay(ts: string | null): string {
  if (!ts) return "–";
  return new Date(ts).toISOString().slice(0, 10);
}

// Confidence marker matching the claim table's convention.
function ConfidenceMark({ c }: { c: string | null }) {
  if (c === "nearest") return <span className="ml-1 text-[10px]" title="Nearest available price within ±7 days" style={{ color: "#d97706" }}>~</span>;
  if (c === "missing") return <span className="ml-1 text-[10px]" title="No historical price found" style={{ color: "#B3322E" }}>!</span>;
  if (c === "manual")  return <span className="ml-1 text-[10px]" title="Manual fair-market value you entered" style={{ color: "#0F8A8A" }}>✎</span>;
  return null;
}

export function UnlockTaxTable() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ basis: Basis; events: TaxEvent[] }>(
    "/api/tax/unlock-events",
    fetcher,
  );
  const [basis, setBasis] = useState<Basis | null>(null);
  const [savingBasis, setSavingBasis] = useState(false);

  const events = data?.events ?? [];
  const activeBasis: Basis = basis ?? data?.basis ?? "claim";

  async function switchBasis(next: Basis) {
    if (next === activeBasis) return;
    setBasis(next);
    setSavingBasis(true);
    try {
      const res = await fetch("/api/tax/basis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basis: next }),
      });
      if (!res.ok) throw new Error("save failed");
      track("tax_basis_changed", { basis: next });
    } catch {
      setBasis(activeBasis); // revert
      toast.error("Couldn't save your tax basis. Try again.");
    } finally {
      setSavingBasis(false);
    }
  }

  // Emphasise the active basis's columns; the other stays visible but muted.
  const unlockEmph = activeBasis === "unlock";
  const emphColor = "var(--preview-text)";
  const mutedColor = "var(--preview-text-3)";

  return (
    <div className="mb-6">
      {/* Header + basis toggle */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
            Unlock &amp; claim income
          </h2>
          <p className="text-[11px] mt-0.5 max-w-xl" style={{ color: "var(--preview-text-3)" }}>
            Each vesting tranche priced both ways — when it unlocked and when you claimed it.
            Export on the basis your region requires.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ background: "var(--preview-bg)", border: "1px solid var(--preview-border)" }}>
          {(["claim", "unlock"] as Basis[]).map((b) => (
            <button
              key={b}
              type="button"
              disabled={savingBasis}
              onClick={() => switchBasis(b)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors"
              style={{
                background: activeBasis === b ? "linear-gradient(135deg, #2563eb, #7c3aed)" : "transparent",
                color: activeBasis === b ? "white" : "var(--preview-text-2)",
              }}
            >
              {b} basis
            </button>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl p-3 mb-3 flex items-start gap-2"
        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <span className="text-[11px] leading-relaxed" style={{ color: "var(--preview-text-2)" }}>
          <strong>Not tax advice.</strong> Vesting is taxed at <em>unlock</em> in some jurisdictions and
          at <em>claim</em> in others — pick the basis your accountant or region requires. Figures are
          estimates; verify before filing.{" "}
          <Link href="/faq" className="underline" style={{ color: "#d97706" }}>Learn more →</Link>
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        <div className="overflow-x-auto" style={{ maxHeight: 560 }}>
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                <Th>Token</Th>
                <Th>Chain</Th>
                <Th align="right">Amount</Th>
                <Th align="right" emph={unlockEmph}>Unlocked on</Th>
                <Th align="right" emph={unlockEmph}>Price @ unlock</Th>
                <Th align="right" emph={unlockEmph}>Value @ unlock</Th>
                <Th align="right" emph={!unlockEmph}>Claimed on</Th>
                <Th align="right" emph={!unlockEmph}>Price @ claim</Th>
                <Th align="right" emph={!unlockEmph}>Value @ claim</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs" style={{ color: "var(--preview-text-3)" }}>Loading unlock events…</td></tr>
              )}
              {!isLoading && events.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-xs" style={{ color: "var(--preview-text-3)" }}>
                    No unlock events yet. We compute these from your vesting schedules for
                    discrete-tranche protocols (Hedgey, UNCX, Team Finance, PinkSale, Sablier
                    tranched). They populate automatically — check back after your next scan.
                  </td>
                </tr>
              )}
              {events.map((e, i) => (
                <tr key={e.id} style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--preview-text)" }}>
                    {e.tokenSymbol ?? (
                      <CopyButton value={e.tokenAddress} display={`${e.tokenAddress.slice(0, 6)}…${e.tokenAddress.slice(-4)}`} style={{ color: "var(--preview-text)" }} />
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--preview-text-2)" }}>
                    {CHAIN_NAMES[e.chainId as keyof typeof CHAIN_NAMES] ?? `chain ${e.chainId}`}
                    <div className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>{getProtocol(e.protocol)?.name ?? e.protocol}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                    {tokensWhole(e.amount, e.tokenDecimals)}
                  </td>
                  {/* Unlock basis */}
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: unlockEmph ? emphColor : mutedColor }}>{isoDay(e.unlockTime)}</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: unlockEmph ? "var(--preview-text-2)" : mutedColor }}>{unitPrice(e.usdAtUnlock, e.amount, e.tokenDecimals)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: e.usdAtUnlock ? (unlockEmph ? emphColor : mutedColor) : "var(--preview-text-3)" }}>
                    {e.needsInput
                      ? <FmvControl event={e} onSaved={() => mutate()} />
                      : <>{fmtUsd(e.usdAtUnlock)}<ConfidenceMark c={e.unlockConfidence} /></>}
                  </td>
                  {/* Claim basis */}
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: !unlockEmph ? emphColor : mutedColor }}>{isoDay(e.claimedAt)}</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap" style={{ color: !unlockEmph ? "var(--preview-text-2)" : mutedColor }}>{unitPrice(e.usdAtClaim, e.amount, e.tokenDecimals)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: e.usdAtClaim ? (!unlockEmph ? emphColor : mutedColor) : "var(--preview-text-3)" }}>
                    {e.claimedAt ? <>{fmtUsd(e.usdAtClaim)}<ConfidenceMark c={e.claimConfidence} /></> : <span title="Not yet claimed">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] mt-3" style={{ color: "var(--preview-text-3)" }}>
        Markers: <span style={{ color: "#d97706" }}>~</span> nearest price (±7 days),{" "}
        <span style={{ color: "#B3322E" }}>!</span> no price found (enter a value),{" "}
        <span style={{ color: "#0F8A8A" }}>✎</span> your manual value. Dates are UTC.
      </p>
    </div>
  );
}

function Th({ children, align = "left", emph = false }: { children: React.ReactNode; align?: "left" | "right"; emph?: boolean }) {
  return (
    <th
      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: emph ? "var(--preview-text-2)" : "var(--preview-text-3)", position: "sticky", top: 0, background: "var(--preview-card)" }}
    >
      {children}
    </th>
  );
}

// Inline "needs your input" FMV entry for a missing-priced unlock.
function FmvControl({ event, onSaved }: { event: TaxEvent; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const usd = Number(val);
    if (!Number.isFinite(usd) || usd <= 0) {
      toast.error("Enter a positive USD amount.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tax/unlock-events/${event.id}/price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usd }),
      });
      if (!res.ok) throw new Error("save failed");
      track("tax_unlock_fmv_set", { protocol: event.protocol, chainId: event.chainId });
      setOpen(false);
      onSaved();
    } catch {
      toast.error("Couldn't save that value. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: "rgba(179,50,46,0.08)", border: "1px solid rgba(179,50,46,0.25)", color: "#B3322E" }}
      >
        needs your input
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span style={{ color: "var(--preview-text-3)" }}>$</span>
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
        inputMode="decimal"
        placeholder="FMV"
        className="w-20 px-1.5 py-0.5 rounded text-xs text-right font-mono"
        style={{ background: "var(--preview-bg)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
      />
      <button type="button" onClick={save} disabled={saving} className="text-[10px] font-semibold" style={{ color: "#0F8A8A" }}>
        {saving ? "…" : "save"}
      </button>
    </span>
  );
}
