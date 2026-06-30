"use client";
// ─────────────────────────────────────────────────────────────────────────────
// src/app/find-vestings/FindVestingsClient.tsx
//
// Client island for the /find-vestings page.
//
// Primary flow: user connects their wallet → we auto-scan the connected
// address → show results + prominent DownloadGate (teal card with direct store badges)
// and a sticky app bar as the conversion path. Connecting a wallet sets the
// expectation that these streams are theirs and will appear live in the mobile app.
//
// Fallback: "Scan a different address instead" reveals a text input for
// power users checking other wallets (e.g. a cold wallet they don't want
// to connect from this browser).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { protocolBrand } from "@/lib/protocol-constants";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";
import { track, classifyAddressOrQuery } from "@/lib/analytics";

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

// ── Session-scoped scan cache ─────────────────────────────────────────────
// Keyed by normalised wallet address. TTL = 10 minutes.
// sessionStorage persists for the browser tab lifetime, so navigating away
// and back shows the cached result instantly instead of re-scanning.
const SCAN_CACHE_PREFIX = "vestr-scan:";
const SCAN_CACHE_TTL_MS = 10 * 60 * 1_000;

interface CachedScan {
  result:   ScanResponse;
  cachedAt: number; // ms epoch
}

function readScanCache(address: string): ScanResponse | null {
  try {
    const raw = sessionStorage.getItem(SCAN_CACHE_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const { result, cachedAt } = JSON.parse(raw) as CachedScan;
    if (Date.now() - cachedAt > SCAN_CACHE_TTL_MS) {
      sessionStorage.removeItem(SCAN_CACHE_PREFIX + address.toLowerCase());
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

function writeScanCache(address: string, result: ScanResponse): void {
  try {
    const entry: CachedScan = { result, cachedAt: Date.now() };
    sessionStorage.setItem(
      SCAN_CACHE_PREFIX + address.toLowerCase(),
      JSON.stringify(entry),
    );
  } catch {
    // Ignore quota / private-browsing errors
  }
}

function clearScanCache(address: string): void {
  try {
    sessionStorage.removeItem(SCAN_CACHE_PREFIX + address.toLowerCase());
  } catch { /* ignore */ }
}

// Protocol colours come from the single source of truth (protocol-constants).

function fmtAmount(raw: string, decimals: number): string {
  const bn = BigInt(raw || "0");
  const base = 10n ** BigInt(decimals);
  const whole = bn / base;
  const frac  = bn % base;
  const fracStr = (frac * 100n / base).toString().padStart(2, "0");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${wholeStr}.${fracStr}`;
}

function truncateAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function FindVestingsClient() {
  // ── Wallet state ─────────────────────────────────────────────────────────
  const { address: connectedAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // ── Manual-address fallback ─────────────────────────────────────────────
  const [manualMode,    setManualMode]    = useState(false);
  const [manualAddress, setManualAddress] = useState("");

  // ── Scan state ──────────────────────────────────────────────────────────
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<ScanResponse | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const lastScanned = useRef<string | null>(null);

  const scanAddress = useCallback(async (addr: string) => {
    if (!isValidWalletAddress(addr)) {
      setError("That doesn't look like a valid address. Paste an EVM 0x… address or a Solana base58 pubkey.");
      return;
    }
    const addressType = classifyAddressOrQuery(addr);
    track("wallet_scan_started", { surface: "find_vestings", address_type: addressType });
    setLoading(true);
    setError(null);
    setResult(null);
    setFromCache(false);
    lastScanned.current = normaliseAddress(addr);
    // Clear stale cache so a forced refresh actually hits the network
    clearScanCache(addr);
    try {
      const res  = await fetch(`/api/find-vestings?address=${addr}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Scan failed");
      setResult(body);
      writeScanCache(addr, body);
      track("wallet_scan_completed", {
        surface:       "find_vestings",
        address_type:  addressType,
        result_count:  Array.isArray(body?.streams) ? body.streams.length : 0,
        has_results:   Array.isArray(body?.streams) && body.streams.length > 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-scan when wallet becomes connected (or swaps).
  // Check sessionStorage first — if a recent result exists, show it
  // immediately without hitting the network again.
  useEffect(() => {
    if (!isConnected || !connectedAddress) return;
    if (lastScanned.current === connectedAddress.toLowerCase()) return;
    lastScanned.current = connectedAddress.toLowerCase();

    const cached = readScanCache(connectedAddress);
    if (cached) {
      setResult(cached);
      setFromCache(true);
      setError(null);
      return;
    }

    scanAddress(connectedAddress);
  }, [isConnected, connectedAddress, scanAddress]);

  // Reset scan view when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setResult(null);
      setError(null);
      setFromCache(false);
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
            boxShadow: "0 10px 40px rgba(28,184,184,0.05)",
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(28,184,184,0.1)" }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth="2" strokeLinecap="round">
              <rect x="2" y="7" width="20" height="13" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>

          <h2 className="text-xl md:text-2xl font-bold mb-2" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            Connect to find your vesting
          </h2>
          <p className="text-sm max-w-md mx-auto mb-6" style={{ color: "#8B8E92" }}>
            We&rsquo;ll scan your wallet across 10 protocols and 7 chains — EVM and Solana. These same vestings will appear live in the Vestream mobile app with push alerts.
          </p>

          {/* Single brand-styled trigger; RainbowKit's modal handles the
              actual wallet picker (MetaMask, Rainbow, Coinbase, WalletConnect,
              Trust, Phantom-injected, Ledger, Safe, etc.). */}
          <div className="flex items-center justify-center max-w-md mx-auto">
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => (
                <button
                  onClick={openConnectModal}
                  disabled={!mounted}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                  style={{
                    background: "#1CB8B8",
                    color: "white",
                    boxShadow: "0 4px 20px rgba(28,184,184,0.3)",
                  }}
                >
                  Connect wallet
                </button>
              )}
            </ConnectButton.Custom>
          </div>

          <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <button
              onClick={() => setManualMode(true)}
              className="text-xs font-medium hover:underline"
              style={{ color: "#8B8E92" }}
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
          style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 4px 20px rgba(28,184,184,0.04)" }}
        >
          <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
            <input
              type="text"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="Paste any wallet — 0x… or Solana pubkey"
              disabled={loading}
              className="flex-1 px-4 py-3 text-sm font-mono rounded-xl outline-none focus:ring-2"
              style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.08)", color: "#1A1D20", minWidth: 240 }}
            />
            <button
              type="submit"
              disabled={loading || !manualAddress.trim()}
              className="w-full md:w-auto px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "#1CB8B8",
                color: "white",
                boxShadow: "0 4px 20px rgba(28,184,184,0.25)",
              }}
            >
              {loading ? "Scanning…" : "Scan"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setManualMode(false); setManualAddress(""); }}
            className="text-xs font-medium mt-3 hover:underline"
            style={{ color: "#8B8E92" }}
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
            background: "rgba(45,179,106,0.05)",
            border: "1px solid rgba(45,179,106,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#2DB36A" }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: "#2DB36A" }} />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#2DB36A" }}>
                Connected
              </div>
              <div className="font-mono text-sm" style={{ color: "#1A1D20" }}>
                {truncateAddr(connectedAddress!)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Show a refresh button when we're displaying a cached result */}
            {fromCache && !loading && (
              <button
                onClick={() => scanAddress(connectedAddress!)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "#1CB8B8", background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.2)" }}
              >
                Refresh
              </button>
            )}
            <button
              onClick={() => disconnect()}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "#8B8E92", background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
            >
              Disconnect
            </button>
          </div>
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
      {loading && <ScanningIndicator scanningLabel={scanningLabel} />}

      {/* ── RESULTS ────────────────────────────────────────────────────── */}
      {result && !loading && (
        result.totalStreams === 0 ? (
          <NoResults address={result.address} />
        ) : (
          <ResultsBlock result={result} />
        )
      )}
    </div>
  );
}

/**
 * Renders the populated-results section: summary + conversion strip + per-
 * group cards + sticky app bar. Extracted from the parent so the
 * sticky-bar IntersectionObserver can observe a stable ref to the inline
 * strip's anchor (which would re-mount if it lived inline alongside the
 * loading branch).
 */
function ResultsBlock({ result }: { result: ScanResponse }) {
  // Anchor that the sticky bar observes — when this is offscreen, the
  // sticky bar slides in. When it's on-screen, sticky bar slides out so
  // we never double-CTA the user.
  const stripRef = useRef<HTMLDivElement | null>(null);

  // Pick a "primary symbol" to personalise the conversion headline. We
  // use the symbol with the most streams as a heuristic — it's the user's
  // dominant exposure and the one they'll most viscerally not-want-to-miss.
  // Falls back to null if nothing has a symbol (rare; renders generic copy).
  const primarySymbol = useMemo<string | null>(() => {
    const counts = new Map<string, number>();
    for (const g of result.groups) {
      for (const tok of g.tokens) {
        if (!tok.symbol) continue;
        counts.set(tok.symbol, (counts.get(tok.symbol) ?? 0) + (tok.streamCount || 1));
      }
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [sym, n] of counts) {
      if (n > bestCount) { bestCount = n; best = sym; }
    }
    return best;
  }, [result]);

  return (
    <>
      <ResultsSummary result={result} />

      {/* Primary conversion gate — store download badges, directly after summary */}
      <div ref={stripRef}>
        <DownloadGate
          totalStreams={result.totalStreams}
          walletAddress={result.address}
          primarySymbol={primarySymbol}
        />
      </div>

      {/* Teaser cards — protocol/chain/symbol visible, amounts blurred */}
      <div className="grid grid-cols-1 gap-3">
        {result.groups.map((g) => (
          <TeaserCard
            key={`${g.protocolId}-${g.chainId}`}
            group={g}
            walletAddress={result.address}
          />
        ))}
      </div>

      {/* Secondary conversion — email capture, demoted to below the cards */}
      <SaveToAppCard walletAddress={result.address} />

      <StickyAppBar
        totalStreams={result.totalStreams}
        walletAddress={result.address}
        anchorRef={stripRef}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Scanning indicator — animated progress signal during the 10-30s scan
// ─────────────────────────────────────────────────────────────────────────

const SCAN_PROTOCOLS = [
  "Sablier",
  "Hedgey",
  "Superfluid",
  "LlamaPay",
  "UNCX",
  "Unvest",
  "PinkSale",
  "Streamflow",
  "Jupiter Lock",
];

function ScanningIndicator({ scanningLabel }: { scanningLabel: string }) {
  // Cycle through protocol names every ~1s so the user can see progress
  // happening even if the API is still pending. Visual lie? A bit — the
  // adapters mostly run in parallel so we don't actually finish protocol N
  // at second N. But the cycling indicator vastly improves perceived
  // responsiveness; without it a 20s scan feels like the app froze.
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % SCAN_PROTOCOLS.length);
    }, 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      {/* Hero scanning card — pulsing radar + active protocol name */}
      <div
        className="rounded-2xl p-6 md:p-8 text-center relative overflow-hidden"
        style={{
          background: "white",
          border: "1px solid rgba(28,184,184,0.15)",
          boxShadow: "0 10px 40px rgba(28,184,184,0.08)",
        }}
      >
        {/* Animated background glow that drifts across the card */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at var(--scan-x, 50%) 50%, rgba(28,184,184,0.08), transparent 60%)",
            animation: "scan-glow 3s ease-in-out infinite",
          }}
        />
        <style>{`
          @keyframes scan-glow {
            0%, 100% { --scan-x: 20%; }
            50%      { --scan-x: 80%; }
          }
          @keyframes scan-bar {
            0%   { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>

        {/* Radar / pulse ring */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <span
            className="absolute inset-0 rounded-full opacity-75"
            style={{
              background: "radial-gradient(circle, rgba(28,184,184,0.25), transparent 60%)",
              animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
            }}
          />
          <span
            className="absolute inset-2 rounded-full opacity-90"
            style={{
              background: "radial-gradient(circle, rgba(15,138,138,0.3), transparent 65%)",
              animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite 0.4s",
            }}
          />
          <div
            className="absolute inset-4 rounded-full flex items-center justify-center"
            style={{
              background: "#1CB8B8",
              boxShadow: "0 4px 16px rgba(28,184,184,0.35)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.5-4.5" />
            </svg>
          </div>
        </div>

        <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: "#1CB8B8" }}>
          Scanning {scanningLabel || "wallet"}
        </div>
        {/* Active-protocol carousel — single line, swaps every 900ms.
            Fixed height keeps the layout from jumping. */}
        <div className="h-7 flex items-center justify-center" style={{ color: "#1A1D20" }}>
          <span className="text-base md:text-lg font-bold tabular-nums" style={{ letterSpacing: "-0.02em" }}>
            <span style={{ color: "#8B8E92", fontWeight: 500 }}>checking </span>
            <span
              key={activeIdx}
              className="inline-block transition-opacity duration-200"
              style={{ color: "#1CB8B8" }}
            >
              {SCAN_PROTOCOLS[activeIdx]}
            </span>
            <span style={{ color: "#B8BABD" }}>…</span>
          </span>
        </div>

        {/* Progress bar — pure CSS sweeping animation. NOT tied to actual
            scan progress (the API doesn't expose granular state) but the
            constant motion signals the job is alive. */}
        <div
          className="mt-5 h-1 rounded-full overflow-hidden mx-auto"
          style={{ background: "rgba(28,184,184,0.08)", maxWidth: 280 }}
        >
          <div
            className="h-full w-1/4 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, #1CB8B8, transparent)",
              animation: "scan-bar 1.8s ease-in-out infinite",
            }}
          />
        </div>

        <p className="text-xs mt-4" style={{ color: "#B8BABD" }}>
          Scanning all supported protocols and chains — usually 10–30 seconds.
        </p>
      </div>

      {/* Skeleton result cards — subtle preview of where data will land. */}
      <div className="grid grid-cols-1 gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl p-5 animate-pulse"
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.05)",
              opacity: 0.7 - i * 0.2,
            }}
          >
            <div className="h-4 w-40 rounded mb-3" style={{ background: "rgba(0,0,0,0.06)" }} />
            <div className="h-3 w-64 rounded" style={{ background: "rgba(0,0,0,0.04)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Primary conversion gate shown immediately after ResultsSummary.
 * Goal: one dominant action — download the app to unlock amounts.
 * No social proof copy until we have real review data.
 */
function DownloadGate({
  totalStreams,
  walletAddress,
  primarySymbol,
}: {
  totalStreams: number;
  walletAddress: string;
  primarySymbol: string | null;
}) {
  return (
    <>
      {/* keyframes for pulsing glow + badge float — scoped to this component */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gate-glow {
          0%, 100% { box-shadow: 0 14px 40px rgba(28,184,184,0.30); }
          50%       { box-shadow: 0 20px 64px rgba(28,184,184,0.55), 0 0 0 8px rgba(28,184,184,0.10); }
        }
        @keyframes badge-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
      `}} />

      <div
        id="download-gate"
        className="rounded-2xl p-6 md:p-10 relative overflow-hidden text-center"
        style={{
          background: "linear-gradient(135deg, #1CB8B8 0%, #189D9D 100%)",
          animation: "gate-glow 3s ease-in-out infinite",
        }}
      >
        {/* Radial highlights */}
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 15%, rgba(255,255,255,0.22), transparent 50%), radial-gradient(circle at 20% 90%, rgba(0,0,0,0.15), transparent 50%)",
          }}
        />

        <div className="relative">
          <h3
            className="text-2xl md:text-4xl font-bold leading-tight mb-3"
            style={{ color: "white", letterSpacing: "-0.02em" }}
          >
            {primarySymbol ? (
              <>
                Don&rsquo;t miss your next{" "}
                <span style={{ background: "rgba(255,255,255,0.22)", padding: "0 6px", borderRadius: 6 }}>
                  {primarySymbol}
                </span>{" "}
                unlock
              </>
            ) : (
              <>Your {totalStreams === 1 ? "vesting is" : `${totalStreams} vestings are`} ready</>
            )}
          </h3>

          <p
            className="text-sm md:text-base mb-7 max-w-sm mx-auto"
            style={{ color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}
          >
            See live amounts, track progress, and claim — free on iOS and Android.
          </p>

          {/* Store badges — centred, floating animation */}
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("cta_clicked", { cta_id: "app_store_download", surface: "find_vestings_gate" })}
              className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl hover:opacity-90"
              style={{
                background: "black",
                color: "white",
                border: "1px solid rgba(255,255,255,0.2)",
                minWidth: 155,
                animation: "badge-float 3s ease-in-out infinite",
              }}
              aria-label="Download on the App Store"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <div className="text-left leading-tight">
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Download on the
                </div>
                <div className="text-[15px] font-semibold">App Store</div>
              </div>
            </a>

            <a
              href="https://play.google.com/store/apps/details?id=io.vestream.app"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("cta_clicked", { cta_id: "play_store_download", surface: "find_vestings_gate" })}
              className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl hover:opacity-90"
              style={{
                background: "black",
                color: "white",
                border: "1px solid rgba(255,255,255,0.2)",
                minWidth: 155,
                animation: "badge-float 3s ease-in-out infinite 0.4s",
              }}
              aria-label="Get it on Google Play"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                <defs>
                  <linearGradient id="gp-blue"   x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#00C3FF" /><stop offset="100%" stopColor="#1A73E8" /></linearGradient>
                  <linearGradient id="gp-green"  x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#00F076" /><stop offset="100%" stopColor="#00D95F" /></linearGradient>
                  <linearGradient id="gp-red"    x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FF3A44" /><stop offset="100%" stopColor="#C31162" /></linearGradient>
                  <linearGradient id="gp-yellow" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE000" /><stop offset="100%" stopColor="#FFBD00" /></linearGradient>
                </defs>
                <path fill="url(#gp-blue)"   d="M3.3 2.5c-.3.3-.5.8-.5 1.5v16c0 .7.2 1.2.5 1.5l9.4-9.5z" />
                <path fill="url(#gp-green)"  d="M16.2 15 12.7 11.5 3.3 21a1.6 1.6 0 0 0 2 .1z" />
                <path fill="url(#gp-yellow)" d="M20.8 11 16.2 8.4 12.3 12l3.9 3.9 4.6-2.6c1.4-.8 1.4-2.1 0-2.3z" />
                <path fill="url(#gp-red)"    d="M5.3 2.4a1.6 1.6 0 0 0-2 .1l9.4 9.5L16.2 8.4z" />
              </svg>
              <div className="text-left leading-tight">
                <div className="text-[9px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Get it on
                </div>
                <div className="text-[15px] font-semibold">Google Play</div>
              </div>
            </a>
          </div>

          <p className="text-xs mt-4" style={{ color: "rgba(255,255,255,0.65)" }}>
            Free · iOS &amp; Android
          </p>

          {/* Notification mockup — centred below badges */}
          <div className="mt-6 flex justify-center">
            <NotificationMockup primarySymbol={primarySymbol} />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Stylised lock-screen notification preview. Renders on all screen sizes —
 * full-width and stacked below the headline copy on mobile, fixed-width in
 * the right column on md+.
 *
 * Deliberately abstract — not a real device chrome, just enough visual
 * vocabulary that users read it as "phone notification". Avoids brand
 * confusion (looks like neither a real iPhone nor a Pixel) while still
 * landing the message: this is what the app does for you.
 */
function NotificationMockup({ primarySymbol }: { primarySymbol: string | null }) {
  const tokenLabel = primarySymbol ?? "your vesting";
  return (
    <div
      className="flex flex-col gap-2 w-full md:w-[240px] flex-shrink-0"
      aria-hidden="true"
    >
      {/* Status-bar hint */}
      <div className="flex items-center justify-between px-2 text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>
        <span>9:41</span>
        <span>● Vestream</span>
      </div>

      {/* Notification card */}
      <div
        className="rounded-2xl p-3.5 backdrop-blur-md"
        style={{
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
          >
            <span className="text-[13px] font-bold" style={{ color: "white" }}>V</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Vestream
              </span>
              <span className="text-[10px]" style={{ color: "#94a3b8" }}>
                now
              </span>
            </div>
            <div className="text-[13px] font-bold leading-snug" style={{ color: "#0f172a" }}>
              {tokenLabel} just unlocked
            </div>
            <div className="text-[12px] leading-snug" style={{ color: "#64748b" }}>
              Tap to claim before the window closes →
            </div>
          </div>
        </div>
      </div>

      {/* Second, more subtle peek — implies a STREAM of alerts, not one */}
      <div
        className="rounded-2xl p-2.5 mx-2 opacity-70"
        style={{
          background: "rgba(255,255,255,0.85)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.10)",
        }}
      >
        <div className="text-[11px] font-semibold" style={{ color: "#64748b" }}>
          ⏰ Reminder · Sablier · 2 days
        </div>
        <div className="text-[11px]" style={{ color: "#94a3b8" }}>
          {tokenLabel} unlocks in 48h
        </div>
      </div>
    </div>
  );
}

/**
 * Sticky bottom bar shown after the user scrolls past the inline action
 * strip. Locks the conversion path within thumb-reach as they keep
 * scrolling through TeaserCards. Auto-hides when the user scrolls back up
 * to the inline strip (no double-CTA visual stack).
 *
 * Why a sticky bar specifically: the inline strip is a single visual
 * moment; once it's offscreen the user still has the dopamine of seeing
 * their numbers but no reminder of the next step. The sticky bar is
 * "Smart App Banner"-style — a low-cost permanent affordance that the
 * user dismisses by scrolling away or acting on.
 */
// ─────────────────────────────────────────────────────────────────────────
// Save-to-app handoff card — captures email, persists (email, wallet) into
// pending_wallet_links via /api/find-vestings/save-link. When the user
// later signs into the mobile app with the same email via OTP, the verify
// handler auto-claims every matching row and pre-loads the wallet into
// their portfolio.
//
// No App Store deep link or attribution SDK needed — the email is the
// attribution vector. The card just primes the backend; the user installs
// from the App Store / Play Store badges further down the page.
// ─────────────────────────────────────────────────────────────────────────
function SaveToAppCard({ walletAddress }: { walletAddress: string }) {
  const [email,   setEmail]   = useState("");
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  const isValidEmail = email.includes("@") && email.length > 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !isValidEmail) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/find-vestings/save-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim().toLowerCase(), walletAddress }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Couldn't save — try again");
      }
      setSaved(true);
      track("cta_clicked", { cta_id: "find_vestings_save_to_app", surface: "find_vestings_results" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-2xl p-6 mb-4"
        style={{
          background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(28,184,184,0.04))",
          border: "1px solid rgba(28,184,184,0.28)",
        }}>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(28,184,184,0.16)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.01em" }}>
              Saved to <span style={{ color: "#0F8A8A" }}>{email}</span>
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
              Install the app and sign in with the same email — your scan will be ready in the portfolio. App Store and Play Store links are further down this page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-6 mb-4"
      style={{
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
      }}>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(28,184,184,0.12)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F8A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold mb-1" style={{ color: "#0f172a", letterSpacing: "-0.01em" }}>
            Continue in the app
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
            On desktop? Drop your email — this scan will be waiting when you open the app. No password, just OTP sign-in.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={busy}
          className="flex-1 px-4 py-3 rounded-xl text-sm font-medium outline-none transition-colors"
          style={{
            background: "#f8fafc",
            border: "1px solid rgba(0,0,0,0.09)",
            color: "#0f172a",
          }}
          aria-label="Your email"
        />
        <button
          type="submit"
          disabled={busy || !isValidEmail}
          className="px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-opacity"
          style={{
            background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
            color: "white",
            boxShadow: "0 2px 12px rgba(28,184,184,0.25)",
            opacity: busy || !isValidEmail ? 0.55 : 1,
            cursor: busy || !isValidEmail ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Saving…" : "Save my scan →"}
        </button>
      </form>

      {error && (
        <p className="text-xs mt-2" style={{ color: "#dc2626" }}>{error}</p>
      )}
      <p className="text-xs mt-3" style={{ color: "#94a3b8" }}>
        We&rsquo;ll only use your email to link this scan to your account when you sign in. <a href="/privacy" className="underline" style={{ color: "#64748b" }}>Privacy</a>.
      </p>
    </div>
  );
}

function StickyAppBar({ totalStreams, walletAddress, anchorRef }: { totalStreams: number; walletAddress: string; anchorRef: React.RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      // SSR / older browsers — keep hidden, no JS-driven CTA. The inline
      // strip alone covers conversion in that path.
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Show the sticky bar when the inline strip is OFF screen
          // (intersectionRatio = 0). When the user scrolls back up to
          // the strip, ratio > 0 → hide the bar so we don't double-CTA.
          setVisible(e.intersectionRatio === 0);
        }
      },
      { threshold: [0, 0.01] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [anchorRef]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 md:pb-4 transition-all duration-300"
      style={{
        transform: visible ? "translateY(0)" : "translateY(120%)",
        opacity:   visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
      aria-hidden={!visible}
    >
      <div
        className="mx-auto max-w-3xl rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{
          background: "#0f172a",
          boxShadow: "0 -8px 30px rgba(15,23,42,0.30)",
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
              <rect x="5" y="2" width="14" height="20" rx="3" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight" style={{ color: "white" }}>
              Track {totalStreams === 1 ? "this" : `${totalStreams}`} in the app
            </div>
            <div className="text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.65)" }}>
              Push alerts · one-tap claims
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            track("cta_clicked", { cta_id: "scroll_to_gate", surface: "find_vestings_sticky_bar" });
            document.getElementById("download-gate")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
          className="inline-flex items-center gap-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-95 whitespace-nowrap flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            color: "white",
            boxShadow: "0 4px 14px rgba(37,99,235,0.35)",
          }}
        >
          Get the app
        </button>
      </div>
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
        background: "rgba(28,184,184,0.05)",
        border: "1px solid rgba(28,184,184,0.15)",
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: "#1CB8B8" }}>
            Scan complete
          </div>
          <h2 className="text-xl md:text-2xl font-bold" style={{ color: "#1A1D20", letterSpacing: "-0.02em" }}>
            {result.totalStreams} vesting{result.totalStreams === 1 ? "" : "s"} found
          </h2>
          <p className="text-sm mt-1 font-mono break-all" style={{ color: "#8B8E92" }}>
            {truncateAddr(result.address)}
          </p>
        </div>
        <div className="flex gap-5 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>Protocols</div>
            <div className="font-mono font-bold text-lg" style={{ color: "#1A1D20" }}>{uniqueProtocols}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>Chains</div>
            <div className="font-mono font-bold text-lg" style={{ color: "#1A1D20" }}>{uniqueChains}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeaserCard({ group, walletAddress }: { group: Group; walletAddress: string }) {
  const colour = protocolBrand(group.protocolId).color;

  // Determine if any token in this group has a claimable balance.
  // Used to choose between "Claim in app →" and "See amounts →".
  const liveClaimableSymbol: string | null = (() => {
    for (const tok of group.tokens) {
      if (BigInt(tok.claimableNowRaw || "0") > 0n) return tok.symbol || null;
    }
    return null;
  })();

  return (
    <div
      className="rounded-2xl p-5 md:p-6"
      style={{ background: "white", border: "1px solid rgba(0,0,0,0.07)" }}
    >
      {/* ── Card header — always visible ─────────────────────────── */}
      <div className="flex items-center gap-3 mb-4">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colour }} />
        <div>
          <div className="text-base font-bold" style={{ color: "#1A1D20" }}>
            {group.protocolName}
          </div>
          <div className="text-xs" style={{ color: "#8B8E92" }}>
            {group.chainName} · {group.streamCount} stream{group.streamCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* ── Token rows — amounts blurred, CTA overlay ────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {group.tokens.slice(0, 4).map((tok) => {
          const tokClaimable = BigInt(tok.claimableNowRaw || "0") > 0n;
          return (
            <div
              key={tok.address || tok.symbol}
              className="rounded-xl overflow-hidden relative"
              style={{ background: "#f8fafc", border: "1px solid rgba(0,0,0,0.05)" }}
            >
              {/* Symbol row — always visible */}
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <span className="font-semibold text-sm" style={{ color: "#1A1D20" }}>
                  {tok.symbol || "—"}
                </span>
                <span className="text-[11px]" style={{ color: "#B8BABD" }}>
                  {tok.streamCount} stream{tok.streamCount === 1 ? "" : "s"}
                </span>
              </div>

              {/* Amount block — blurred */}
              <div className="relative" style={{ minHeight: 52 }}>
                {/* Actual numbers, blurred so they are unreadable */}
                <div
                  className="px-3 pb-3"
                  style={{
                    filter: "blur(5px)",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                  aria-hidden="true"
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#B8BABD" }}>
                    Total
                  </div>
                  <div className="font-mono text-sm font-semibold" style={{ color: "#1A1D20" }}>
                    {fmtAmount(tok.totalAmountRaw, tok.decimals)}
                  </div>
                  {tokClaimable && (
                    <div className="text-[11px] font-mono mt-0.5" style={{ color: "#2DB36A" }}>
                      {fmtAmount(tok.claimableNowRaw, tok.decimals)} claimable
                    </div>
                  )}
                </div>

                {/* CTA overlay — sits above the blurred amounts */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: "rgba(248,250,252,0.55)" }}
                >
                  <button
                    onClick={() => {
                      track("cta_clicked", { cta_id: "scroll_to_gate", surface: `find_vestings_teaser_${group.protocolId}` });
                      document.getElementById("download-gate")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 whitespace-nowrap"
                    style={
                      tokClaimable
                        ? { background: "#2DB36A", color: "white" }
                        : { background: "rgba(28,184,184,0.12)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }
                    }
                  >
                    {tokClaimable ? "Claim in app →" : "See amounts →"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {group.tokens.length > 4 && (
        <p className="text-xs mt-3" style={{ color: "#B8BABD" }}>
          + {group.tokens.length - 4} more token{group.tokens.length - 4 === 1 ? "" : "s"} in app
        </p>
      )}

      {/* ── Card footer ──────────────────────────────────────────── */}
      <div
        className="mt-4 pt-3 flex items-center justify-between gap-3"
        style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}
      >
        <div
          className="text-[11px] md:text-xs flex items-center gap-1.5 min-w-0"
          style={{ color: "#64748b" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: liveClaimableSymbol ? "#2DB36A" : "#cbd5e1" }}
          />
          <span className="truncate">
            {liveClaimableSymbol ? (
              <><strong style={{ color: "#0f172a" }}>{liveClaimableSymbol}</strong> ready to claim — open in app</>
            ) : (
              <>Live progress &amp; alerts in app</>
            )}
          </span>
        </div>
        <button
          onClick={() => {
            track("cta_clicked", { cta_id: "scroll_to_gate", surface: `find_vestings_teaser_footer_${group.protocolId}` });
            document.getElementById("download-gate")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 whitespace-nowrap flex-shrink-0"
          style={
            liveClaimableSymbol
              ? { background: "#2DB36A", color: "white" }
              : { background: "rgba(28,184,184,0.10)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }
          }
        >
          {liveClaimableSymbol ? "Claim now →" : "Open app →"}
        </button>
      </div>
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
        style={{ background: "rgba(28,184,184,0.05)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8E92" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>
      <h3 className="text-lg font-bold mb-2" style={{ color: "#1A1D20" }}>
        No vestings found
      </h3>
      <p className="text-sm mb-1 font-mono" style={{ color: "#8B8E92" }}>
        {truncateAddr(address)}
      </p>
      <p className="text-sm max-w-md mx-auto mt-3" style={{ color: "#8B8E92" }}>
        We scanned 10 vesting protocols across Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism and Solana. If this wallet has vestings elsewhere, let us know — we add new protocols every month.
      </p>
    </div>
  );
}

