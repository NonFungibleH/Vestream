"use client";
// ─────────────────────────────────────────────────────────────────────────────
// Global token search — a command-palette overlay opened from the nav search
// icon (or ⌘K / "/"). Type a ticker, project, or contract address; results come
// from /api/search/tokens (token_vesting_rollups) and link to the fast, cached
// /token/[chainId]/[address] pages. Self-themed (light card on a dim backdrop)
// so it looks identical on every page regardless of the nav theme.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chainBrand, chainIcon } from "@/lib/protocol-constants";

interface Result {
  chainId:        number;
  tokenAddress:   string;
  tokenSymbol:    string | null;
  walletCount:    number;
  lockedValueUsd: number | null;
}

function fmtUsd(v: number | null): string {
  if (v == null || v <= 0) return "";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

export function GlobalSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Reset + focus when opened.
  useEffect(() => {
    if (open) {
      setQ(""); setResults([]); setActive(0);
      // Focus after paint so the autofocus lands.
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/tokens?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const body = await res.json();
        setResults(Array.isArray(body.results) ? body.results : []);
        setActive(0);
      } catch { /* aborted / network — ignore */ }
      finally { setLoading(false); }
    }, 180);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, open]);

  const go = useCallback((r: Result) => {
    onClose();
    router.push(`/token/${r.chainId}/${r.tokenAddress}`);
  }, [router, onClose]);

  // Keyboard: Esc closes, arrows move, Enter opens the active result.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
  };

  if (!open) return null;

  const term = q.trim();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden"
        style={{ background: "white", border: "1px solid rgba(21,23,26,0.10)", boxShadow: "0 24px 60px rgba(15,23,42,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: "1px solid rgba(21,23,26,0.07)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B8E92" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search any token by ticker, project, or contract address"
            className="flex-1 py-4 text-[15px] outline-none bg-transparent"
            style={{ color: "#1A1D20" }}
            autoComplete="off" autoCorrect="off" spellCheck={false}
          />
          <button onClick={onClose} className="text-[11px] font-semibold px-2 py-1 rounded-md" style={{ color: "#8B8E92", background: "rgba(21,23,26,0.05)" }}>ESC</button>
        </div>

        {/* Results */}
        <div className="max-h-[52vh] overflow-y-auto">
          {term.length < 2 ? (
            <p className="px-4 py-6 text-[13px]" style={{ color: "#8B8E92" }}>
              Start typing a token ticker (e.g. <span style={{ color: "#0F8A8A", fontWeight: 600 }}>ARB</span>), a project name, or paste a contract address.
            </p>
          ) : loading && results.length === 0 ? (
            <p className="px-4 py-6 text-[13px]" style={{ color: "#8B8E92" }}>Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-[13px]" style={{ color: "#8B8E92" }}>
              No indexed token matches &ldquo;{term}&rdquo;. Try the full contract address, or a different ticker.
            </p>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => {
                const brand = chainBrand(r.chainId);
                const icon = chainIcon(r.chainId);
                const usd = fmtUsd(r.lockedValueUsd);
                return (
                  <li key={`${r.chainId}-${r.tokenAddress}`}>
                    <button
                      onClick={() => go(r)}
                      onMouseEnter={() => setActive(i)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{ background: i === active ? "rgba(28,184,184,0.07)" : "transparent" }}
                    >
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: brand.bg, border: `1px solid ${brand.border}` }}>
                        {icon
                          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={icon} alt="" width={32} height={32} className="w-full h-full object-contain p-1.5" />
                          : <span className="font-bold text-xs" style={{ color: brand.color }}>{brand.name[0]}</span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate" style={{ color: "#1A1D20" }}>
                          {r.tokenSymbol || `${r.tokenAddress.slice(0, 6)}…${r.tokenAddress.slice(-4)}`}
                          <span className="ml-2 text-[11px] font-medium" style={{ color: brand.color }}>{brand.name}</span>
                        </p>
                        <p className="text-[11px] truncate" style={{ color: "#8B8E92" }}>
                          {r.walletCount > 0 ? `${r.walletCount.toLocaleString()} ${r.walletCount === 1 ? "holder" : "holders"} vesting` : "Vesting tracker"}
                          {usd ? ` · ${usd} locked` : ""}
                        </p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C5C7CA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
