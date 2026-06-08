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

interface SaleRow { id: string; date: string; amount: number; price: number }

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
    // Same-tab download — window.location.href IS a navigation side effect,
    // not a render-time mutation (matches the pattern on the parent page).
    // eslint-disable-next-line react-hooks/immutability
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
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--preview-text-3)" }}>
            Income — claims (priced at receipt)
          </p>
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

          {/* Gains — auto-detected disposals + manual sales ledger */}
          <SalesSection tokenAddress={v.tokenAddress} tokenSymbol={v.tokenSymbol} chainId={v.chainId} />
        </div>
      )}
    </div>
  );
}

// Chains sell-detection can scan today — must match SELL_DETECT_CHAINS server-side.
const SELL_SCAN_CHAINS = [1, 8453];

interface DisposalCandidate {
  id: string; chainId: number; txHash: string; toAddress: string;
  amount: number; priceUsd: number | null; occurredAt: string; internalTransfer: boolean;
}

const EXPLORER_TX: Record<number, string> = {
  1:    "https://etherscan.io/tx/",
  8453: "https://basescan.org/tx/",
};

function SalesSection({ tokenAddress, tokenSymbol, chainId }: { tokenAddress: string; tokenSymbol: string; chainId: number }) {
  const [sales, setSales]             = useState<SaleRow[] | null>(null);
  const [entryPrice, setEntry]        = useState<number | null>(null);
  const [candidates, setCandidates]   = useState<DisposalCandidate[]>([]);
  const [adding, setAdding]           = useState(false);
  const [date, setDate]               = useState("");
  const [amount, setAmount]           = useState("");
  const [price, setPrice]             = useState("");
  const [submitting, setSubmit]       = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const [scanning, setScanning]       = useState(false);
  const [scanMsg, setScanMsg]         = useState<string | null>(null);
  const canScan = SELL_SCAN_CHAINS.includes(chainId);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/dashboard/pnl/${encodeURIComponent(tokenAddress)}`);
      const data = await res.json();
      setSales(data.sales ?? []);
      setEntry(typeof data.entryPrice === "number" ? data.entryPrice : null);
      setCandidates(data.candidates ?? []);
    } catch {
      setSales([]);
    }
  }, [tokenAddress]);

  useEffect(() => { void load(); }, [load]);

  async function scan() {
    setScanning(true);
    setScanMsg(null);
    try {
      const res  = await fetch(`/api/dashboard/pnl/${encodeURIComponent(tokenAddress)}/detect-sales?chainId=${chainId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setScanMsg(data.error ?? "Scan failed."); return; }
      setCandidates(data.candidates ?? []);
      const n = (data.candidates ?? []).length;
      setScanMsg(n === 0 ? "No disposals found on-chain." : `${n} disposal${n === 1 ? "" : "s"} found — confirm the ones that were sales.`);
    } catch {
      setScanMsg("Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function actCandidate(id: string, action: "confirm" | "dismiss") {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    try {
      await fetch(`/api/dashboard/pnl/${encodeURIComponent(tokenAddress)}/candidates/${encodeURIComponent(id)}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      if (action === "confirm") await load(); // pull the newly-created sale row
    } catch {
      void load();
    }
  }

  async function addSale(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmit(true);
    try {
      const res  = await fetch(`/api/dashboard/pnl/${encodeURIComponent(tokenAddress)}/sales`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ date, amount: Number(amount), price: Number(price) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? "Couldn't add sale"); return; }
      setSales((prev) => [...(prev ?? []), data.sale]);
      setDate(""); setAmount(""); setPrice(""); setAdding(false);
    } catch {
      setErr("Couldn't add sale");
    } finally {
      setSubmit(false);
    }
  }

  async function removeSale(id: string) {
    setSales((prev) => (prev ?? []).filter((s) => s.id !== id));
    try {
      await fetch(`/api/dashboard/pnl/${encodeURIComponent(tokenAddress)}/sales/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      void load(); // re-sync on failure
    }
  }

  const gain = (s: SaleRow): number | null => (entryPrice != null ? (s.price - entryPrice) * s.amount : null);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>
          Gains — sales {entryPrice != null ? `(cost basis $${entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })})` : ""}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            onClick={scan}
            disabled={scanning || !canScan}
            title={canScan ? "Scan the chain for times you sold or transferred this token" : "Sell scanning isn't available on this chain yet"}
            className="text-[11px] font-semibold px-2 py-1 rounded-md text-white disabled:opacity-50"
            style={{ background: "#1CB8B8" }}>
            {scanning ? "Scanning…" : "⌕ Scan for sales"}
          </button>
          {!adding && (
            <button onClick={() => setAdding(true)}
              className="text-[11px] font-semibold px-2 py-1 rounded-md"
              style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)", color: "var(--preview-text-2)" }}>
              + Add sale
            </button>
          )}
        </div>
      </div>

      {scanMsg && (
        <p className="text-[11px] mb-2" style={{ color: scanMsg.toLowerCase().includes("fail") ? "#B3322E" : "var(--preview-text-3)" }}>
          {scanMsg}
        </p>
      )}
      {!canScan && (
        <p className="text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
          Auto sell-detection currently covers Ethereum &amp; Base. Add sales for this chain manually below.
        </p>
      )}

      {/* Detected disposals — confirm the ones that were sales, dismiss the rest. */}
      {candidates.length > 0 && (
        <div className="mb-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--preview-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5"
            style={{ background: "var(--preview-card)", color: "var(--preview-text-3)" }}>
            Detected on-chain — confirm sales
          </p>
          {candidates.map((c) => (
            <div key={c.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              style={{ borderTop: "1px solid var(--preview-border-2)", opacity: c.internalTransfer ? 0.6 : 1 }}>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span style={{ color: "var(--preview-text)" }}>{c.occurredAt.slice(0, 10)}</span>
                  <span className="font-mono" style={{ color: "var(--preview-text)" }}>
                    {c.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tokenSymbol}
                  </span>
                  {c.priceUsd != null && (
                    <span style={{ color: "var(--preview-text-3)" }}>@ ${c.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  )}
                  {c.internalTransfer && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--preview-bg)", color: "var(--preview-text-3)", border: "1px solid var(--preview-border-2)" }}>
                      to your wallet
                    </span>
                  )}
                </div>
                {EXPLORER_TX[c.chainId] && (
                  <a href={`${EXPLORER_TX[c.chainId]}${c.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-mono hover:underline" style={{ color: "var(--preview-text-3)" }}>
                    {c.txHash.slice(0, 10)}… ↗
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => actCandidate(c.id, "confirm")}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md text-white" style={{ background: "#0F8A4A" }}>
                  Confirm
                </button>
                <button onClick={() => actCandidate(c.id, "dismiss")}
                  className="text-[11px] px-2 py-1 rounded-md" style={{ color: "var(--preview-text-3)", border: "1px solid var(--preview-border)" }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {entryPrice == null && (
        <p className="text-[11px] mb-2" style={{ color: "var(--preview-text-3)" }}>
          No entry price set for {tokenSymbol} — set one in the dashboard P&amp;L to compute realized gains. Sales below show proceeds only.
        </p>
      )}

      {adding && (
        <form onSubmit={addSale} className="flex flex-wrap items-end gap-2 mb-2 rounded-xl p-2"
          style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
          <label className="flex flex-col text-[10px]" style={{ color: "var(--preview-text-3)" }}>
            Date
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
              className="text-xs px-2 py-1 rounded-md outline-none"
              style={{ background: "var(--preview-bg)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }} />
          </label>
          <label className="flex flex-col text-[10px]" style={{ color: "var(--preview-text-3)" }}>
            Amount ({tokenSymbol})
            <input type="number" step="any" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0"
              className="text-xs px-2 py-1 rounded-md outline-none w-28"
              style={{ background: "var(--preview-bg)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }} />
          </label>
          <label className="flex flex-col text-[10px]" style={{ color: "var(--preview-text-3)" }}>
            Sale price (USD)
            <input type="number" step="any" min="0" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00"
              className="text-xs px-2 py-1 rounded-md outline-none w-28"
              style={{ background: "var(--preview-bg)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }} />
          </label>
          <button type="submit" disabled={submitting}
            className="text-xs font-semibold px-3 py-1.5 rounded-md text-white disabled:opacity-50"
            style={{ background: "#1CB8B8" }}>
            {submitting ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setErr(null); }}
            className="text-xs px-2 py-1.5 rounded-md" style={{ color: "var(--preview-text-3)" }}>
            Cancel
          </button>
          {err && <span className="text-[11px] w-full" style={{ color: "#B3322E" }}>{err}</span>}
        </form>
      )}

      {sales === null ? (
        <p className="text-xs py-1" style={{ color: "var(--preview-text-3)" }}>Loading sales…</p>
      ) : sales.length === 0 ? (
        <p className="text-xs py-1" style={{ color: "var(--preview-text-3)" }}>No sales recorded for this token.</p>
      ) : (
        <div className="rounded-xl overflow-x-auto"
          style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border-2)" }}>
          <table className="w-full text-sm" style={{ minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--preview-border-2)" }}>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Date</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Amount</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Price</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Proceeds</th>
                <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--preview-text-3)" }}>Realized gain</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {sales.map((s, i) => {
                const g = gain(s);
                return (
                  <tr key={s.id} style={{ borderTop: i > 0 ? "1px solid var(--preview-border-2)" : undefined }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--preview-text)" }}>{s.date}</td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap" style={{ color: "var(--preview-text)" }}>{s.amount.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: "var(--preview-text)" }}>${s.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: "var(--preview-text)" }}>${(s.amount * s.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap font-semibold"
                      style={{ color: g == null ? "var(--preview-text-3)" : g >= 0 ? "#0F8A8A" : "#B3322E" }}>
                      {g == null ? "—" : `${g >= 0 ? "+" : "−"}$${Math.abs(g).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => removeSale(s.id)} title="Remove sale"
                        className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
