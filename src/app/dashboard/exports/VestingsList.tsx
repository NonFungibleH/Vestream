"use client";

// VestingsList — the "vestings-first" headline of the Tax page.
// ─────────────────────────────────────────────────────────────────────────────
// One row per token the user has a tracked vesting in (from
// GET /api/claims/vestings). Each row shows claimed-to-date income; clicking it
// expands a per-token claim-history table, lazily fetched (and cached) from
// GET /api/claims/history?tokenAddress=…. Per-token export lands in Phase 2
// alongside the export-scoping param.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { CHAIN_NAMES } from "@/lib/vesting/types";

interface VestingToken {
  chainId:         number;
  tokenAddress:    string;
  tokenSymbol:     string;
  protocols:       string[];
  claimCount:      number;
  totalClaimedUsd: number | null;
  lastClaimAt:     string | null;
}

interface ClaimRow {
  id:              string;
  tokenSymbol:     string | null;
  tokenAddress:    string;
  tokenDecimals:   number;
  amount:          string;
  claimedAt:       string;
  usdValueAtClaim: string | null;
  priceConfidence: "exact" | "nearest" | "missing";
}

function chainName(id: number): string {
  return CHAIN_NAMES[id as keyof typeof CHAIN_NAMES] ?? `chain ${id}`;
}

function tokensWhole(amount: string, decimals: number): string {
  try {
    const big     = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole   = big / divisor;
    const frac    = big % divisor;
    if (frac === 0n) return whole.toLocaleString();
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 4).replace(/0+$/, "");
    return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
  } catch {
    return "—";
  }
}

function usd(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

export function VestingsList() {
  const [vestings, setVestings] = useState<VestingToken[] | null>(null);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch("/api/claims/vestings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setVestings(data.vestings ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <p className="text-xs mb-5" style={{ color: "var(--preview-text-3)" }}>
        Couldn&apos;t load your vestings ({error}).
      </p>
    );
  }

  if (vestings === null) {
    return <div className="text-sm mb-5" style={{ color: "var(--preview-text-3)" }}>Loading your vestings…</div>;
  }

  if (vestings.length === 0) {
    // No tracked streams at all — the flat claim table / refresh below still applies.
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--preview-text-3)" }}>
        Your vestings
      </h2>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
        {vestings.map((v, i) => (
          <VestingRow key={`${v.chainId}:${v.tokenAddress}`} v={v} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

const EXPORT_FORMATS: { id: string; label: string }[] = [
  { id: "koinly",           label: "Koinly" },
  { id: "cointracker",      label: "CoinTracker" },
  { id: "vestream-generic", label: "CSV" },
];

function VestingRow({ v, first }: { v: VestingToken; first: boolean }) {
  const [open, setOpen]       = useState(false);
  const [claims, setClaims]   = useState<ClaimRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg]   = useState<string | null>(null);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/claims/history?tokenAddress=${encodeURIComponent(v.tokenAddress)}`);
      const data = await res.json();
      setClaims(data.events ?? []);
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [v.tokenAddress]);

  async function runReport() {
    setRunning(true);
    setRunMsg(null);
    try {
      const sp  = new URLSearchParams({ action: "refresh", chainId: String(v.chainId), protocol: v.protocols.join(",") });
      const res = await fetch(`/api/claims/history?${sp.toString()}`, { method: "POST" });
      const data = await res.json();
      setRunMsg(res.ok ? (data.message ?? "Done.") : (data.error ?? "Refresh failed."));
      if (res.ok) await loadClaims();
    } catch {
      setRunMsg("Refresh failed.");
    } finally {
      setRunning(false);
    }
  }

  function download(format: string) {
    const sp = new URLSearchParams({ format, tokenAddress: v.tokenAddress });
    window.location.href = `/api/claims/export?${sp.toString()}`;
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && claims === null && !loading) void loadClaims();
  }

  return (
    <div style={{ borderTop: first ? undefined : "1px solid var(--preview-border-2)" }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors"
        style={{ background: open ? "var(--preview-bg)" : "transparent" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--preview-text-3)" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm" style={{ color: "var(--preview-text)" }}>{v.tokenSymbol}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--preview-bg)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
                {chainName(v.chainId)}
              </span>
            </div>
            <div className="text-[11px] capitalize" style={{ color: "var(--preview-text-3)" }}>
              {v.protocols.map((p) => p.replace("-", " ")).join(", ")}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold" style={{ color: v.totalClaimedUsd ? "var(--preview-text)" : "var(--preview-text-3)" }}>
            {usd(v.totalClaimedUsd)}
          </div>
          <div className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            {v.claimCount} claim{v.claimCount === 1 ? "" : "s"} claimed
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4" style={{ background: "var(--preview-bg)" }}>
          {/* Per-token actions: re-index this token's claims, or export scoped CSV */}
          <div className="flex items-center justify-between gap-3 flex-wrap pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={runReport}
                disabled={running}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-all disabled:opacity-50"
                style={{ background: "#1CB8B8" }}
              >
                {running ? "Indexing…" : "↻ Run report"}
              </button>
              {runMsg && (
                <span className="text-[11px]" style={{ color: runMsg.toLowerCase().includes("fail") ? "#B3322E" : "var(--preview-text-3)" }}>
                  {runMsg}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider mr-1" style={{ color: "var(--preview-text-3)" }}>Export</span>
              {EXPORT_FORMATS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => download(f.id)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all"
                  style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text-2)" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className="text-xs py-2" style={{ color: "var(--preview-text-3)" }}>Loading claims…</p>
          ) : !claims || claims.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--preview-text-3)" }}>
              No claims indexed for this token yet. Hit <strong>Refresh claims</strong> above to index them.
            </p>
          ) : (
            <div className="rounded-xl overflow-x-auto"
              style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border-2)" }}>
              <table className="w-full text-sm" style={{ minWidth: 440 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Date</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Amount</th>
                    <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>USD at receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c, i) => (
                    <tr key={c.id} style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {new Date(c.claimedAt).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color: "var(--preview-text)" }}>
                        {tokensWhole(c.amount, c.tokenDecimals)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: c.usdValueAtClaim ? "var(--preview-text)" : "var(--preview-text-3)" }}>
                        {c.usdValueAtClaim
                          ? `$${Number(c.usdValueAtClaim).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                          : "—"}
                        {c.priceConfidence === "nearest" && (
                          <span className="ml-1 text-[10px]" title="Nearest available price within ±7 days" style={{ color: "#d97706" }}>~</span>
                        )}
                        {c.priceConfidence === "missing" && (
                          <span className="ml-1 text-[10px]" title="No historical price found — set cost basis manually" style={{ color: "#B3322E" }}>!</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
