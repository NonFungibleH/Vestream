"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/app/find-vestings/FindVestingsClient.tsx
//
// Client island for the /find-vestings page. Owns the scan form + results
// rendering + mobile app CTA that pops when results are found.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react";
import Link from "next/link";

// ── Shape mirrored from /api/find-vestings route ───────────────────────────

interface TokenSummary {
  symbol:          string;
  address:         string;
  decimals:        number;
  streamCount:     number;
  totalAmountRaw:  string;
  claimableNowRaw: string;
  lockedAmountRaw: string;
}

interface Group {
  protocolId:   string;
  protocolName: string;
  chainId:      number;
  chainName:    string;
  streamCount:  number;
  tokens:       TokenSummary[];
}

interface ScanResponse {
  address:      string;
  totalStreams: number;
  groups:       Group[];
  scannedAt:    string;
}

// Brand colour for each protocol card (matches /unlocks page tokens)
const PROTOCOL_COLOURS: Record<string, string> = {
  sablier:        "#f97316",
  hedgey:         "#a855f7",
  uncx:           "#0ea5e9",
  unvest:         "#14b8a6",
  "team-finance": "#f59e0b",
  superfluid:     "#10b981",
  pinksale:       "#ec4899",
};

function fmtAmount(raw: string, decimals: number): string {
  const bn = BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = bn / base;
  const frac  = bn % base;
  const fracStr = (frac * 100n / base).toString().padStart(2, "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${wholeStr}.${fracStr}`;
}

function isAddress(v: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

export default function FindVestingsClient() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<ScanResponse | null>(null);

  const scan = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = address.trim();
    if (!isAddress(trimmed)) {
      setError("That doesn't look like a valid EVM address (0x followed by 40 hex chars).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/find-vestings?address=${trimmed}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return (
    <div className="space-y-8">
      {/* Form */}
      <form
        onSubmit={scan}
        className="rounded-2xl p-5 md:p-6 flex items-center gap-3 flex-wrap md:flex-nowrap"
        style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 4px 20px rgba(37,99,235,0.04)" }}
      >
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE"
          disabled={loading}
          className="flex-1 px-4 py-3 text-sm font-mono rounded-xl outline-none focus:ring-2"
          style={{
            background: "#f8fafc",
            border: "1px solid rgba(0,0,0,0.08)",
            color: "#0f172a",
            minWidth: 240,
          }}
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="w-full md:w-auto px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            color: "white",
            boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
          }}
        >
          {loading ? "Scanning…" : "Scan wallet"}
        </button>
      </form>

      {error && (
        <div
          className="px-4 py-3 rounded-xl text-sm"
          style={{ background: "rgba(220,38,38,0.06)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.18)" }}
        >
          {error}
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div className="grid grid-cols-1 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-5 animate-pulse"
              style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", opacity: 1 - i * 0.2 }}
            >
              <div className="h-4 w-40 rounded mb-3" style={{ background: "rgba(0,0,0,0.08)" }} />
              <div className="h-3 w-64 rounded" style={{ background: "rgba(0,0,0,0.05)" }} />
            </div>
          ))}
          <p className="text-xs text-center mt-2" style={{ color: "#94a3b8" }}>
            Scanning 7 protocols across 4 chains. Wallets with many streams can take 10–30 seconds.
          </p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {result.totalStreams === 0 ? (
            <NoResults address={result.address} />
          ) : (
            <>
              <ResultsSummary result={result} />
              <div className="grid grid-cols-1 gap-3">
                {result.groups.map((g) => (
                  <GroupCard key={`${g.protocolId}-${g.chainId}`} group={g} />
                ))}
              </div>
              <MobileAppCta />
            </>
          )}
        </>
      )}

      {/* Example prompt when idle */}
      {!loading && !result && !error && (
        <div className="text-center">
          <p className="text-xs mb-3" style={{ color: "#94a3b8" }}>Don&rsquo;t have a wallet to hand?</p>
          <button
            onClick={() => setAddress("0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE")}
            className="text-xs px-4 py-2 rounded-lg font-medium hover:opacity-80 transition-opacity"
            style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", color: "#2563eb" }}
          >
            Try with example wallet
          </button>
        </div>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────

function ResultsSummary({ result }: { result: ScanResponse }) {
  const uniqueProtocols = new Set(result.groups.map((g) => g.protocolId)).size;
  const uniqueChains    = new Set(result.groups.map((g) => g.chainId)).size;

  return (
    <div
      className="rounded-2xl p-5 md:p-6"
      style={{
        background: "linear-gradient(135deg, rgba(37,99,235,0.04), rgba(124,58,237,0.04))",
        border: "1px solid rgba(37,99,235,0.15)",
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#2563eb" }}>
            Scan complete
          </div>
          <h2 className="text-xl md:text-2xl font-bold" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            {result.totalStreams} vesting{result.totalStreams === 1 ? "" : "s"} found
          </h2>
          <p className="text-sm mt-1 font-mono break-all" style={{ color: "#64748b" }}>
            {result.address.slice(0, 6)}…{result.address.slice(-4)}
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>Protocols</div>
            <div className="font-mono font-bold text-lg" style={{ color: "#0f172a" }}>{uniqueProtocols}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>Chains</div>
            <div className="font-mono font-bold text-lg" style={{ color: "#0f172a" }}>{uniqueChains}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const colour = PROTOCOL_COLOURS[group.protocolId] ?? "#64748b";

  return (
    <div
      className="rounded-2xl p-5 md:p-6"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: colour }}
          />
          <div>
            <div className="text-base font-bold" style={{ color: "#0f172a" }}>
              {group.protocolName}
            </div>
            <div className="text-xs" style={{ color: "#64748b" }}>
              {group.chainName} · {group.streamCount} stream{group.streamCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {group.tokens.slice(0, 4).map((tok) => (
          <div
            key={tok.address || tok.symbol}
            className="rounded-xl p-3"
            style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.05)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm" style={{ color: "#0f172a" }}>
                {tok.symbol || "—"}
              </span>
              <span className="text-[11px]" style={{ color: "#94a3b8" }}>
                {tok.streamCount} stream{tok.streamCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#94a3b8" }}>
              Total
            </div>
            <div className="font-mono text-sm font-semibold truncate" style={{ color: "#0f172a" }}>
              {fmtAmount(tok.totalAmountRaw, tok.decimals)}
            </div>
            {BigInt(tok.claimableNowRaw) > 0n && (
              <div className="text-[11px] font-mono mt-1" style={{ color: "#10b981" }}>
                {fmtAmount(tok.claimableNowRaw, tok.decimals)} claimable now
              </div>
            )}
          </div>
        ))}
      </div>

      {group.tokens.length > 4 && (
        <p className="text-xs mt-3" style={{ color: "#94a3b8" }}>
          + {group.tokens.length - 4} more token{group.tokens.length - 4 === 1 ? "" : "s"} — see full detail in the Vestream app
        </p>
      )}
    </div>
  );
}

function NoResults({ address }: { address: string }) {
  return (
    <div
      className="rounded-2xl p-8 md:p-10 text-center"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      <div
        className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
        style={{ background: "rgba(37,99,235,0.05)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: "#0f172a" }}>
        No vestings found
      </h3>
      <p className="text-sm mb-1 font-mono" style={{ color: "#64748b" }}>
        {address.slice(0, 6)}…{address.slice(-4)}
      </p>
      <p className="text-sm max-w-md mx-auto mt-3" style={{ color: "#64748b" }}>
        We scanned 7 vesting protocols across Ethereum, BNB Chain, Polygon and Base. If this wallet has vestings elsewhere, reach out — we add new protocols every month.
      </p>
      <div className="mt-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:opacity-90"
          style={{
            background: "rgba(37,99,235,0.08)",
            color: "#2563eb",
            border: "1px solid rgba(37,99,235,0.2)",
          }}
        >
          Try a different wallet →
        </Link>
      </div>
    </div>
  );
}

function MobileAppCta() {
  return (
    <div
      className="rounded-2xl p-6 md:p-8 text-center overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        boxShadow: "0 20px 50px rgba(15,23,42,0.18)",
      }}
    >
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 20% 30%, rgba(37,99,235,0.4), transparent 40%), radial-gradient(circle at 80% 70%, rgba(124,58,237,0.4), transparent 40%)",
        }}
      />
      <div className="relative">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          📱 Get push alerts the moment they unlock
        </div>
        <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "white", letterSpacing: "-0.02em" }}>
          Track these in the Vestream app
        </h3>
        <p className="text-sm md:text-base max-w-lg mx-auto mb-6" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          Install the app, sign in with email, and get instant push notifications as each stream unlocks — even while your screen&rsquo;s off.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/early-access"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              color: "white",
              boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
            }}
          >
            Get early access →
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            See live demo →
          </Link>
        </div>
      </div>
    </div>
  );
}
