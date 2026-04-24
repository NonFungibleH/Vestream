"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/app/find-vestings/FindVestingsClient.tsx
//
// Client island for the /find-vestings page.
//
// Primary flow: user connects their wallet → we auto-scan the connected
// address → show results + strong mobile app CTA with App Store / Play
// Store badges. Connecting a wallet sets the expectation that these streams
// are theirs and will appear live in the mobile app.
//
// Fallback: "Scan a different address instead" reveals a text input for
// power users checking other wallets (e.g. a cold wallet they don't want
// to connect from this browser).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";

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

function truncateAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function FindVestingsClient() {
  // ── Wallet state ─────────────────────────────────────────────────────────
  const { address: connectedAddress, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();

  // Pick one of each connector type for two explicit buttons
  const injectedConnector      = connectors.find((c) => c.type === "injected");
  const walletConnectConnector = connectors.find((c) => c.type === "walletConnect");

  // ── Manual-address fallback ─────────────────────────────────────────────
  const [manualMode,    setManualMode]    = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  // ── Scan state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [result,  setResult]  = useState<ScanResponse | null>(null);
  const lastScanned = useRef<string | null>(null);

  const scanAddress = useCallback(async (addr: string) => {
    if (!isAddress(addr)) {
      setError("That doesn't look like a valid EVM address (0x followed by 40 hex chars).");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    lastScanned.current = addr.toLowerCase();
    try {
      const res  = await fetch(`/api/find-vestings?address=${addr}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed");
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan when wallet becomes connected (or swaps)
  useEffect(() => {
    if (!isConnected || !connectedAddress) return;
    if (lastScanned.current === connectedAddress.toLowerCase()) return;
    scanAddress(connectedAddress);
  }, [isConnected, connectedAddress, scanAddress]);

  // Reset scan view when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setResult(null);
      setError(null);
      lastScanned.current = null;
    }
  }, [isConnected]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    scanAddress(manualAddress.trim());
  };

  const scanningLabel = connectedAddress
    ? truncateAddr(connectedAddress)
    : lastScanned.current
      ? truncateAddr(lastScanned.current)
      : "";

  const showInitialChooser = !isConnected && !manualMode && !result && !loading;
  const showManualForm     = !isConnected && manualMode;
  const showConnectedBanner = isConnected && connectedAddress;

  return (
    <div className="space-y-6">
      {/* ── INITIAL CHOOSER ─────────────────────────────────────────────── */}
      {showInitialChooser && (
        <div
          className="rounded-2xl p-6 md:p-8 text-center"
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.07)",
            boxShadow: "0 10px 40px rgba(37,99,235,0.05)",
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.1), rgba(124,58,237,0.1))" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="13" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>

          <h2 className="text-xl md:text-2xl font-bold mb-2" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>
            Connect to see your vestings
          </h2>
          <p className="text-sm max-w-md mx-auto mb-6" style={{ color: "#64748b" }}>
            We&rsquo;ll scan your wallet across 7 protocols and 4 chains. These same vestings will appear live in the TokenVest mobile app with push alerts.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-md mx-auto">
            {injectedConnector && (
              <button
                onClick={() => connect({ connector: injectedConnector })}
                disabled={connecting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                  color: "white",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
                }}
              >
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
            {walletConnectConnector && (
              <button
                onClick={() => connect({ connector: walletConnectConnector })}
                disabled={connecting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-80 disabled:opacity-60"
                style={{
                  background: "white",
                  color: "#0f172a",
                  border: "1px solid rgba(0,0,0,0.09)",
                }}
              >
                WalletConnect
              </button>
            )}
          </div>

          {connectError && (
            <p className="text-xs mt-4" style={{ color: "#dc2626" }}>
              {connectError.message}
            </p>
          )}

          <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <button
              onClick={() => setManualMode(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: "#64748b" }}
            >
              Or scan a different address instead →
            </button>
          </div>
        </div>
      )}

      {/* ── MANUAL ADDRESS FORM ─────────────────────────────────────────── */}
      {showManualForm && (
        <form
          onSubmit={onManualSubmit}
          className="rounded-2xl p-5 md:p-6"
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 4px 20px rgba(37,99,235,0.04)" }}
        >
          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
            <input
              type="text"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="0x… paste any wallet address"
              disabled={loading}
              className="flex-1 px-4 py-3 text-sm font-mono rounded-xl outline-none focus:ring-2"
              style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)", color: "#0f172a", minWidth: 240 }}
            />
            <button
              type="submit"
              disabled={loading || !manualAddress.trim()}
              className="w-full md:w-auto px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                color: "white",
                boxShadow: "0 4px 20px rgba(37,99,235,0.25)",
              }}
            >
              {loading ? "Scanning…" : "Scan"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setManualMode(false); setManualAddress(""); }}
            className="text-xs font-medium mt-3 hover:underline"
            style={{ color: "#64748b" }}
          >
            ← Connect wallet instead
          </button>
        </form>
      )}

      {/* ── CONNECTED BANNER ────────────────────────────────────────────── */}
      {showConnectedBanner && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3"
          style={{
            background: "rgba(16,185,129,0.05)",
            border: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#10b981" }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#10b981" }} />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#10b981" }}>
                Connected
              </div>
              <div className="font-mono text-sm" style={{ color: "#0f172a" }}>
                {truncateAddr(connectedAddress!)}
              </div>
            </div>
          </div>
          <button
            onClick={() => disconnect()}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "#64748b", background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="px-4 py-3 rounded-xl text-sm"
          style={{ background: "rgba(220,38,38,0.06)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.18)" }}
        >
          {error}
        </div>
      )}

      {/* ── LOADING ────────────────────────────────────────────────────── */}
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
            Scanning {scanningLabel} across 7 protocols and 4 chains — takes 10–30 seconds for complex wallets.
          </p>
        </div>
      )}

      {/* ── RESULTS ────────────────────────────────────────────────────── */}
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
            </>
          )}

          <MobileAppCta hasResults={result.totalStreams > 0} />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────────────────

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
            {truncateAddr(result.address)}
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
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: colour }} />
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
            {/* Allow token total to wrap rather than truncate — the number
                is the key data on this card and hiding it behind ellipsis
                on mobile hurts more than a two-line wrap. */}
            <div className="font-mono text-sm font-semibold break-all" style={{ color: "#0f172a" }}>
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
          + {group.tokens.length - 4} more token{group.tokens.length - 4 === 1 ? "" : "s"} — see full detail in the TokenVest app
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
        {truncateAddr(address)}
      </p>
      <p className="text-sm max-w-md mx-auto mt-3" style={{ color: "#64748b" }}>
        We scanned 7 vesting protocols across Ethereum, BNB Chain, Polygon, Base and Sepolia. If this wallet has vestings elsewhere, let us know — we add new protocols every month.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mobile App CTA — App Store + Play Store badges
// ─────────────────────────────────────────────────────────────────────────

function MobileAppCta({ hasResults }: { hasResults: boolean }) {
  return (
    <div
      className="rounded-3xl p-6 md:p-10 text-center overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        boxShadow: "0 20px 50px rgba(15,23,42,0.2)",
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
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-5"
          style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.15)" }}
        >
          📱 Next step
        </div>
        <h3 className="text-2xl md:text-3xl font-bold mb-3" style={{ color: "white", letterSpacing: "-0.02em" }}>
          {hasResults
            ? "See these vestings live in the TokenVest app"
            : "Get the app and try again"}
        </h3>
        <p className="text-sm md:text-base max-w-xl mx-auto mb-6" style={{ color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
          {hasResults
            ? "Install TokenVest, sign in with email, and the exact same vestings appear — with real-time progress bars, push alerts the moment anything unlocks, and one-tap claim links."
            : "TokenVest watches all 7 protocols across 4 chains, 24/7. You&rsquo;ll get a push alert the moment a new vesting is created for your address."}
        </p>

        {/* App store badges */}
        <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
          <AppStoreBadge />
          <PlayStoreBadge />
        </div>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          Apps rolling out now — join early access for TestFlight / Play Store beta invite
        </p>
      </div>
    </div>
  );
}

/** Apple App Store badge — visual placeholder linking to early access. */
function AppStoreBadge() {
  return (
    <Link
      href="/early-access"
      className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all hover:opacity-85"
      style={{
        background: "black",
        color: "white",
        border: "1px solid rgba(255,255,255,0.2)",
        minWidth: 180,
      }}
      aria-label="Download on the App Store"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
      <div className="text-left leading-tight">
        <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
          Download on the
        </div>
        <div className="text-base font-semibold">App Store</div>
      </div>
    </Link>
  );
}

/** Google Play badge — visual placeholder linking to early access. */
function PlayStoreBadge() {
  return (
    <Link
      href="/early-access"
      className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl transition-all hover:opacity-85"
      style={{
        background: "black",
        color: "white",
        border: "1px solid rgba(255,255,255,0.2)",
        minWidth: 180,
      }}
      aria-label="Get it on Google Play"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id="play-blue"   x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#00C3FF" /><stop offset="100%" stopColor="#1A73E8" /></linearGradient>
          <linearGradient id="play-green"  x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#00F076" /><stop offset="100%" stopColor="#00D95F" /></linearGradient>
          <linearGradient id="play-red"    x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#FF3A44" /><stop offset="100%" stopColor="#C31162" /></linearGradient>
          <linearGradient id="play-yellow" x1="0%" y1="0%"   x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE000" /><stop offset="100%" stopColor="#FFBD00" /></linearGradient>
        </defs>
        <path fill="url(#play-blue)"   d="M3.3 2.5c-.3.3-.5.8-.5 1.5v16c0 .7.2 1.2.5 1.5l9.4-9.5z" />
        <path fill="url(#play-green)"  d="M16.2 15 12.7 11.5 3.3 21a1.6 1.6 0 0 0 2 .1z" />
        <path fill="url(#play-yellow)" d="M20.8 11 16.2 8.4 12.3 12l3.9 3.9 4.6-2.6c1.4-.8 1.4-2.1 0-2.3z" />
        <path fill="url(#play-red)"    d="M5.3 2.4a1.6 1.6 0 0 0-2 .1l9.4 9.5L16.2 8.4z" />
      </svg>
      <div className="text-left leading-tight">
        <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
          Get it on
        </div>
        <div className="text-base font-semibold">Google Play</div>
      </div>
    </Link>
  );
}
