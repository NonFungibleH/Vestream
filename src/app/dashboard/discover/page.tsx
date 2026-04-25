"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isValidWalletAddress } from "@/lib/address-validation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanTokenResult {
  symbol:          string;
  address:         string;
  decimals:        number;
  streamCount:     number;
  totalAmountRaw:  string;
  claimableNowRaw: string;
  lockedAmountRaw: string;
}

interface ScanResult {
  protocolId:   string;
  protocolName: string;
  chainId:      number;
  chainName:    string;
  streamCount:  number;
  tokens:       ScanTokenResult[];
}

interface ScanData {
  address:            string;
  totalStreams:        number;
  results:            ScanResult[];
  suggestedChains:    number[];
  suggestedProtocols: string[];
  scannedAt:          string;
  scansRemaining:     number;
  scanResetAt:        string;
}

interface TrackedWallet {
  id:           string;
  address:      string;
  label:        string | null;
  chains:       string[] | null;
  protocols:    string[] | null;
  tokenAddress: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHAIN_OPTIONS = [
  { id: "1",        label: "Ethereum",  short: "ETH"     },
  { id: "56",       label: "BNB Chain", short: "BSC"     },
  { id: "137",      label: "Polygon",   short: "Polygon" },
  { id: "8453",     label: "Base",      short: "Base"    },
  { id: "101",      label: "Solana",    short: "SOL"     },
  { id: "11155111", label: "Sepolia",   short: "Sepolia" },
];

const PROTOCOL_OPTIONS = [
  { id: "sablier",      label: "Sablier"       },
  { id: "uncx",         label: "UNCX"          },
  { id: "team-finance", label: "Team Finance"  },
  { id: "hedgey",       label: "Hedgey"        },
  { id: "unvest",       label: "Unvest"        },
  { id: "superfluid",   label: "Superfluid"    },
  { id: "pinksale",     label: "PinkSale"      },
];

const PROTOCOL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  sablier:        { text: "#f97316", bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.25)"  },
  hedgey:         { text: "#1CB8B8", bg: "rgba(28,184,184,0.12)",   border: "rgba(28,184,184,0.25)"   },
  "team-finance": { text: "#2D8A4A", bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.25)"  },
  uncx:           { text: "#C47A1A", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  "uncx-vm":      { text: "#C47A1A", bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.25)"  },
  unvest:         { text: "#0891b2", bg: "rgba(8,145,178,0.12)",   border: "rgba(8,145,178,0.25)"   },
  superfluid:     { text: "#1db954", bg: "rgba(29,185,84,0.12)",   border: "rgba(29,185,84,0.25)"   },
  pinksale:       { text: "#ec4899", bg: "rgba(236,72,153,0.12)",  border: "rgba(236,72,153,0.25)"  },
};

function shortAddr(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }

// Merge uncx-vm results into the uncx result so the user only sees one "UNCX" entry
function mergeUncxResults(results: ScanResult[]): ScanResult[] {
  const merged: ScanResult[] = [];
  for (const r of results) {
    if (r.protocolId === "uncx-vm") {
      const uncxResult = merged.find(x => x.protocolId === "uncx" && x.chainId === r.chainId);
      if (uncxResult) {
        uncxResult.streamCount += r.streamCount;
        for (const tok of r.tokens) {
          const existingTok = uncxResult.tokens.find(t =>
            (tok.address && t.address)
              ? tok.address.toLowerCase() === t.address.toLowerCase()
              : tok.symbol === t.symbol
          );
          if (existingTok) {
            existingTok.streamCount     += tok.streamCount;
            existingTok.totalAmountRaw   = (BigInt(existingTok.totalAmountRaw)   + BigInt(tok.totalAmountRaw)).toString();
            existingTok.claimableNowRaw  = (BigInt(existingTok.claimableNowRaw)  + BigInt(tok.claimableNowRaw)).toString();
            existingTok.lockedAmountRaw  = (BigInt(existingTok.lockedAmountRaw)  + BigInt(tok.lockedAmountRaw)).toString();
          } else {
            uncxResult.tokens.push(tok);
          }
        }
      } else {
        // No matching uncx entry yet — push as "uncx"
        merged.push({ ...r, protocolId: "uncx", protocolName: "UNCX" });
      }
    } else {
      merged.push(r);
    }
  }
  return merged;
}

function fmtTokenAmount(rawStr: string, decimals: number): string {
  try {
    const raw   = BigInt(rawStr);
    const scale = 10n ** BigInt(Math.min(decimals, 18));
    const whole = raw / scale;
    const frac  = Number(raw % scale) / Number(scale);
    const total = Number(whole) + frac;
    if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(2)}M`;
    if (total >= 1_000)     return `${(total / 1_000).toFixed(1)}K`;
    return total.toFixed(2);
  } catch { return "?" }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: <IconGrid />,     label: "Dashboard", href: "/dashboard",          active: false },
  { icon: <IconSearch />,   label: "Discover",  href: "/dashboard/discover", active: true  },
  { icon: <IconSettings />, label: "Settings",  href: "/settings",           active: false },
];

function DiscoverSidebar({ tier }: { tier: string }) {
  const router = useRouter();
  return (
    <aside className="w-56 flex-shrink-0 h-screen flex flex-col"
      style={{ background: "var(--preview-card)", borderRight: "1px solid var(--preview-border)" }}>

      {/* Logo */}
      <Link href="/" className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ borderBottom: "1px solid var(--preview-border)" }}>
        <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7 flex-shrink-0" />
        <div>
          <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>Vestream</span>
          <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>Track every token unlock</p>
        </div>
      </Link>

      {/* Nav */}
      <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
        {NAV_ITEMS.map((item) => (
          <button key={item.label} onClick={() => router.push(item.href)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={item.active
              ? { background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(15,138,138,0.08))", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.15)" }
              : { color: "var(--preview-text-2)", border: "1px solid transparent" }}
            onMouseEnter={(e) => { if (!item.active) { e.currentTarget.style.background = "var(--preview-muted)"; } }}
            onMouseLeave={(e) => { if (!item.active) { e.currentTarget.style.background = "transparent"; } }}
          >
            <span className="opacity-80 flex-shrink-0">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer — tier badge */}
      <div className="px-3 pb-3 flex-shrink-0 space-y-2" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}>
        {tier === "free" && (
          <div className="px-3 py-2.5 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Free Plan</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>FREE</span>
            </div>
            <p className="text-[9px] mb-2" style={{ color: "var(--preview-text-3)" }}>
              Upgrade to Pro to use Discover
            </p>
            <a href="/pricing"
              className="block w-full text-center text-[10px] font-bold py-1.5 rounded-lg text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)" }}>
              Upgrade to Pro →
            </a>
          </div>
        )}
        {tier === "pro" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "var(--preview-muted)", border: "1px solid var(--preview-border-2)" }}>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>PRO</span>
            <span className="text-[10px] font-semibold" style={{ color: "var(--preview-text-2)" }}>Pro Plan</span>
          </div>
        )}
        {tier === "fund" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(168,85,247,0.10))", border: "1px solid rgba(99,102,241,0.25)" }}>
            <span className="text-[10px]">✦</span>
            <div>
              <p className="text-[10px] font-bold" style={{ color: "#a78bfa" }}>Fund Plan</p>
              <p className="text-[8px]" style={{ color: "var(--preview-text-3)" }}>Unlimited wallets · all features</p>
            </div>
          </div>
        )}
        <p className="text-[8px] text-center" style={{ color: "var(--preview-text-3)" }}>
          Read-only · No funds access
        </p>
      </div>
    </aside>
  );
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function WatchBtn({ isWatching, isAdding, onClick, size = "sm" }: {
  isWatching: boolean; isAdding: boolean; onClick: () => void; size?: "sm" | "xs";
}) {
  const px = size === "xs" ? "px-2.5 py-1" : "px-3 py-1.5";
  const fs = size === "xs" ? "text-[11px]" : "text-xs";
  return (
    <button
      onClick={onClick}
      disabled={isWatching || isAdding}
      className={`flex items-center gap-1.5 ${px} rounded-lg ${fs} font-semibold transition-all flex-shrink-0 disabled:cursor-default`}
      style={isWatching
        ? { background: "rgba(52,211,153,0.10)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
        : { background: "rgba(59,130,246,0.10)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)", cursor: "pointer" }
      }
    >
      {isAdding ? (
        <>
          <svg className="animate-spin" width={10} height={10} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(96,165,250,0.3)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Adding…
        </>
      ) : isWatching ? (
        <>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Watching
        </>
      ) : (
        <>
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Watch
        </>
      )}
    </button>
  );
}

function ResultCard({
  result,
  watchStatus,
  onWatchGroup,
  onWatchToken,
  isGroupWatching,
  isTokenWatching,
}: {
  result:          ScanResult;
  watchStatus:     Record<string, "adding" | "watching" | "error">;
  onWatchGroup:    () => void;
  onWatchToken:    (tokenAddress: string) => void;
  isGroupWatching: boolean;
  isTokenWatching: (tokenAddress: string) => boolean;
}) {
  const pc       = PROTOCOL_COLORS[result.protocolId] ?? { text: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" };
  const chainOpt = CHAIN_OPTIONS.find(c => c.id === String(result.chainId));
  const groupKey = `${result.chainId}:${result.protocolId}`;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>

      {/* ── Group header row ── */}
      <div className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold"
          style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
          {result.protocolName.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{result.protocolName}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
              style={{ background: "rgba(59,130,246,0.10)", color: "#93c5fd" }}>
              {chainOpt?.short ?? result.chainName}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
            {result.streamCount} stream{result.streamCount !== 1 ? "s" : ""} · {result.tokens.length} token{result.tokens.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Watch all tokens in this protocol+chain */}
        <WatchBtn
          isWatching={isGroupWatching}
          isAdding={watchStatus[groupKey] === "adding"}
          onClick={onWatchGroup}
        />
      </div>

      {/* ── Individual token rows ── */}
      {result.tokens.length > 0 && (
        <div style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          {result.tokens.map((tok) => {
            const tokenKey     = `${result.chainId}:${result.protocolId}:${tok.address || tok.symbol}`;
            const tokenAdding  = watchStatus[tokenKey] === "adding";
            const tokenWatching = tok.address
              ? (isTokenWatching(tok.address) || watchStatus[tokenKey] === "watching")
              : false;

            return (
              <div key={tokenKey} className="px-4 py-2.5 flex items-center gap-3"
                style={{ borderBottom: "1px solid var(--preview-border-2)" }}>

                {/* Token avatar */}
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                  style={{ background: pc.bg, color: pc.text }}>
                  {tok.symbol.slice(0, 3).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold" style={{ color: "var(--preview-text)" }}>{tok.symbol}</span>
                    <span className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>
                      · {tok.streamCount} stream{tok.streamCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                    <span style={{ color: "#34d399" }}>{fmtTokenAmount(tok.claimableNowRaw, tok.decimals)} claimable</span>
                    {" · "}
                    {fmtTokenAmount(tok.totalAmountRaw, tok.decimals)} total
                  </p>
                </div>

                {/* Watch this token (only if we have a contract address) */}
                {tok.address ? (
                  <WatchBtn
                    isWatching={tokenWatching}
                    isAdding={tokenAdding}
                    onClick={() => onWatchToken(tok.address)}
                    size="xs"
                  />
                ) : (
                  <span className="text-[10px] flex-shrink-0" style={{ color: "var(--preview-text-3)" }}>no address</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Discover Page ────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const router = useRouter();
  const [dark,           setDark]           = useState(false);
  const [tier,           setTier]           = useState<string>("free");
  const [wallets,        setWallets]        = useState<TrackedWallet[]>([]);
  const [address,        setAddress]        = useState<string>("");
  const [filterChain,    setFilterChain]    = useState<string>("");   // "" = all chains
  const [filterProtocol, setFilterProtocol] = useState<string>("");   // "" = all platforms
  const [scanning,       setScanning]       = useState(false);
  const [scanData,       setScanData]       = useState<ScanData | null>(null);
  const [scanError,      setScanError]      = useState<string | null>(null);
  const [watchStatus,    setWatchStatus]    = useState<Record<string, "adding" | "watching" | "error">>({});
  // Scan quota (updated after each successful scan)
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [scanResetAt,    setScanResetAt]    = useState<string | null>(null);

  useEffect(() => {
    try { if (localStorage.getItem("vestr-dark") === "1") setDark(true); } catch { /* ignore */ }
  }, []);

  const loadWallets = useCallback(async () => {
    try {
      const res = await fetch("/api/wallets");
      if (res.status === 401) { router.push("/login"); return; }
      if (res.ok) {
        const json = await res.json();
        setWallets(json.wallets ?? []);
        const fetchedTier = json.tier ?? "free";
        setTier(fetchedTier);
      }
    } catch { /* ignore */ }
  }, [router]);

  useEffect(() => { loadWallets(); }, [loadWallets]);

  async function handleScan() {
    setScanError(null);
    setScanData(null);
    setWatchStatus({});
    if (!isValidWalletAddress(address)) {
      setScanError("Enter a valid wallet address (EVM 0x… or Solana pubkey)");
      return;
    }
    setScanning(true);
    try {
      const filterQs = [
        filterChain    ? `chains=${filterChain}`       : "",
        filterProtocol ? `protocols=${filterProtocol}` : "",
      ].filter(Boolean).join("&");
      const res = await fetch(`/api/wallets/scan?address=${address}${filterQs ? "&" + filterQs : ""}`);
      if (res.status === 402) {
        setScanError("Pro plan required to use Discover. Upgrade to unlock full scanning.");
        return;
      }
      if (res.status === 429) {
        const j = await res.json();
        setScanError(j.error ?? "Scan limit reached. Please try again later.");
        if (j.resetAt) setScanResetAt(j.resetAt);
        setScansRemaining(0);
        return;
      }
      if (!res.ok) {
        const j = await res.json();
        setScanError(j.error ?? "Scan failed");
        return;
      }
      const data = await res.json();
      // Merge uncx-vm results into uncx so user sees one unified UNCX entry
      if (data?.results) data.results = mergeUncxResults(data.results);
      setScanData(data);
      // Update quota display
      if (typeof data.scansRemaining === "number") setScansRemaining(data.scansRemaining);
      if (data.scanResetAt) setScanResetAt(data.scanResetAt);
    } catch { setScanError("Network error — please try again."); }
    finally { setScanning(false); }
  }

  // Group watching: protocol+chain is watched with NO token filter (covers all tokens)
  function isGroupWatching(chainId: number, protocolId: string): boolean {
    if (!scanData) return false;
    const key = `${chainId}:${protocolId}`;
    if (watchStatus[key] === "watching") return true;
    const tracked = wallets.find(w => w.address === scanData.address.toLowerCase());
    if (!tracked) return false;
    const hasChain = !tracked.chains || tracked.chains.includes(String(chainId));
    // UNCX UI covers both uncx and uncx-vm
    const protocolIds = protocolId === "uncx" ? ["uncx", "uncx-vm"] : [protocolId];
    const hasProtocol = !tracked.protocols || protocolIds.some(pid => tracked.protocols!.includes(pid));
    // Only "group watching" if no token filter is set (covers all tokens)
    return hasChain && hasProtocol && !tracked.tokenAddress;
  }

  // Token watching: this specific token is being watched (either via group or token-level watch)
  function isTokenWatchingFn(chainId: number, protocolId: string, tokenAddress: string): boolean {
    if (!scanData) return false;
    const key = `${chainId}:${protocolId}:${tokenAddress}`;
    if (watchStatus[key] === "watching") return true;
    const tracked = wallets.find(w => w.address === scanData.address.toLowerCase());
    if (!tracked) return false;
    const hasChain = !tracked.chains || tracked.chains.includes(String(chainId));
    const protocolIds = protocolId === "uncx" ? ["uncx", "uncx-vm"] : [protocolId];
    const hasProtocol = !tracked.protocols || protocolIds.some(pid => tracked.protocols!.includes(pid));
    if (!hasChain || !hasProtocol) return false;
    // Token is watched if: no filter (group watch covers all) OR token filter exactly matches
    return !tracked.tokenAddress || tracked.tokenAddress.toLowerCase() === tokenAddress.toLowerCase();
  }

  // handleWatch: group-level (no tokenAddress) or token-level (with tokenAddress)
  async function handleWatch(chainId: number, protocolId: string, tokenAddress?: string) {
    if (!scanData) return;
    const key = tokenAddress
      ? `${chainId}:${protocolId}:${tokenAddress}`
      : `${chainId}:${protocolId}`;
    setWatchStatus(prev => ({ ...prev, [key]: "adding" }));

    // UNCX UI option covers both uncx and uncx-vm on the backend
    const backendProtocols = protocolId === "uncx" ? ["uncx", "uncx-vm"] : [protocolId];

    const alreadyTracked = wallets.find(w => w.address === scanData.address.toLowerCase());

    try {
      if (alreadyTracked) {
        // PATCH to add this chain+protocol, optionally setting tokenAddress
        const existingChains    = alreadyTracked.chains    ?? [];
        const existingProtocols = alreadyTracked.protocols ?? [];
        const newChains    = [...new Set([...existingChains, String(chainId)])];
        const newProtocols = [...new Set([...existingProtocols, ...backendProtocols])];

        const patchBody: Record<string, unknown> = {
          chains:    newChains.map(Number),
          protocols: newProtocols,
        };
        if (tokenAddress !== undefined) patchBody.tokenAddress = tokenAddress;

        const res = await fetch(`/api/wallets/${scanData.address}`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(patchBody),
        });
        if (!res.ok) throw new Error("Update failed");
      } else {
        // POST to add new wallet with this specific chain+protocol (and optionally tokenAddress)
        const postBody: Record<string, unknown> = {
          address:   scanData.address,
          chains:    [chainId],
          protocols: backendProtocols,
        };
        if (tokenAddress !== undefined) postBody.tokenAddress = tokenAddress;

        const res = await fetch("/api/wallets", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(postBody),
        });
        if (res.status === 402) {
          const j = await res.json();
          const nextPlan = j.tier === "free" ? "Pro" : "Fund";
          setScanError(`Wallet limit reached — upgrade to ${nextPlan} to track more.`);
          setWatchStatus(prev => ({ ...prev, [key]: "error" }));
          return;
        }
        if (res.status === 409) {
          // Race condition: wallet was already added — fall through to PATCH
          await loadWallets();
          const freshWallets = await fetch("/api/wallets").then(r => r.json()).catch(() => null);
          const fresh = (freshWallets?.wallets ?? []) as TrackedWallet[];
          const existing = fresh.find(w => w.address === scanData.address.toLowerCase());
          if (existing) {
            const newChains    = [...new Set([...(existing.chains ?? []),    String(chainId)])];
            const newProtocols = [...new Set([...(existing.protocols ?? []), ...backendProtocols])];
            const racePatch: Record<string, unknown> = { chains: newChains.map(Number), protocols: newProtocols };
            if (tokenAddress !== undefined) racePatch.tokenAddress = tokenAddress;
            await fetch(`/api/wallets/${scanData.address}`, {
              method:  "PATCH",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify(racePatch),
            });
          }
        } else if (!res.ok) {
          throw new Error("Add failed");
        }
      }

      await loadWallets();
      setWatchStatus(prev => ({ ...prev, [key]: "watching" }));
    } catch {
      setWatchStatus(prev => ({ ...prev, [key]: "error" }));
    }
  }

  async function handleWatchAll() {
    if (!scanData) return;
    for (const r of scanData.results) {
      const key = `${r.chainId}:${r.protocolId}`;
      if (!isGroupWatching(r.chainId, r.protocolId) && watchStatus[key] !== "adding") {
        await handleWatch(r.chainId, r.protocolId);
      }
    }
  }

  return (
    <div
      className={`flex h-screen overflow-hidden${dark ? " dark" : ""}`}
      style={{ background: "var(--preview-bg)" }}
    >
      <DiscoverSidebar tier={tier} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-14 px-6 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--preview-card)", borderBottom: "1px solid var(--preview-border)" }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Discover Vestings</h1>
            <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
              Scan 8 platforms × 5 chains to find every active vesting for a wallet
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="h-8 flex items-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-all"
              style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", color: "var(--preview-text-2)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--preview-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--preview-card)")}>
              ← Dashboard
            </button>
            <button
              onClick={() => {
                setDark(v => {
                  try { localStorage.setItem("vestr-dark", !v ? "1" : "0"); } catch { /* ignore */ }
                  return !v;
                });
              }}
              className="h-8 w-8 flex items-center justify-center rounded-lg border transition-all text-sm"
              style={{ background: "var(--preview-muted-2)", borderColor: "var(--preview-border)", color: "var(--preview-text-2)" }}
            >
              {dark ? "☀" : "🌙"}
            </button>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Free-tier paywall banner */}
          {tier === "free" && (
            <div className="flex items-center justify-between gap-4 px-5 py-4 rounded-2xl mb-6"
              style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.06))", border: "1px solid rgba(15,138,138,0.2)" }}>
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">🔍</span>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
                    Auto-scan unlocks with Pro
                  </p>
                  <p className="text-xs" style={{ color: "var(--preview-text-3)", lineHeight: 1.5 }}>
                    Enter any wallet address and Vestream automatically scans every protocol and chain to find all your vesting streams — no contract address needed.
                  </p>
                </div>
              </div>
              <a href="/pricing"
                className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-xl text-white transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)" }}>
                Upgrade →
              </a>
            </div>
          )}

          {/* Scan form card */}
          <div className="rounded-2xl p-6"
            style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>

            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.10), rgba(15,138,138,0.08))", border: "1px solid rgba(59,130,246,0.2)" }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold mb-1" style={{ color: "var(--preview-text)" }}>
                  Find all vestings for a wallet
                </h2>
                <p className="text-[12px] leading-relaxed max-w-xl" style={{ color: "var(--preview-text-3)" }}>
                  Enter any wallet address and we&apos;ll scan every supported platform across all 5 chains — EVM and Solana.
                  Results appear below — click <strong style={{ color: "var(--preview-text-2)" }}>Watch this</strong> to
                  add individual vestings to your dashboard.
                </p>
              </div>
            </div>

            {/* Input row */}
            <div className="flex gap-3 flex-wrap">
              <input
                placeholder="Wallet address (0x… or Solana pubkey)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }}
                className="flex-1 min-w-[220px] rounded-xl px-4 py-2.5 text-sm font-mono outline-none"
                style={{
                  color: "var(--preview-text)",
                  background: "var(--preview-muted-2)",
                  border: `1px solid ${scanError ? "#B3322E" : "var(--preview-border)"}`,
                }}
              />
              <select
                value={filterChain}
                onChange={(e) => setFilterChain(e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm outline-none flex-shrink-0"
                style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
              >
                <option value="">All chains</option>
                {CHAIN_OPTIONS.filter(c => c.id !== "11155111").map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select
                value={filterProtocol}
                onChange={(e) => setFilterProtocol(e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm outline-none flex-shrink-0"
                style={{ color: "var(--preview-text)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)" }}
              >
                <option value="">All platforms</option>
                {PROTOCOL_OPTIONS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <button
                onClick={handleScan}
                disabled={scanning || !address || tier === "free"}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all flex-shrink-0"
                style={{ background: scanning ? "var(--preview-muted-2)" : "linear-gradient(135deg, #1CB8B8, #0F8A8A)" }}
              >
                {scanning ? (
                  <>
                    <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Scanning…
                  </>
                ) : (
                  <>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    Scan all platforms
                  </>
                )}
              </button>
            </div>
            {tier === "free" && (
              <p className="text-xs mt-2" style={{ color: "var(--preview-text-3)" }}>Upgrade to Pro to run a scan.</p>
            )}

            {/* Quota indicator — appears after first scan attempt */}
            {scansRemaining !== null && (
              <div className="mt-3 flex items-center gap-2.5">
                {/* 3 usage dots */}
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full transition-all"
                      style={{
                        background: i < (3 - scansRemaining)
                          ? "var(--preview-border)"
                          : "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[11px]" style={{ color: scansRemaining > 0 ? "var(--preview-text-3)" : "#C47A1A" }}>
                  {scansRemaining > 0
                    ? `${scansRemaining} scan${scansRemaining !== 1 ? "s" : ""} remaining today`
                    : scanResetAt
                      ? `No scans left — resets in ${Math.max(1, Math.ceil((new Date(scanResetAt).getTime() - Date.now()) / 3_600_000))}h`
                      : "No scans remaining today"
                  }
                </span>
              </div>
            )}

            {/* Error banner */}
            {scanError && (
              <div className="mt-3 flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="text-xs flex-1" style={{ color: "#f87171" }}>{scanError}</span>
                {scanError.includes("Pro plan") && (
                  <a href="/pricing" className="text-[11px] font-semibold underline flex-shrink-0" style={{ color: "#60a5fa" }}>
                    Upgrade →
                  </a>
                )}
              </div>
            )}

            {/* Platform tags */}
            <div className="mt-4 pt-4 flex flex-wrap items-center gap-2" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
              <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "var(--preview-text-3)" }}>Covers</span>
              {PROTOCOL_OPTIONS.map(p => {
                const pc = PROTOCOL_COLORS[p.id] ?? { text: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.25)" };
                return (
                  <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: pc.bg, color: pc.text }}>
                    {p.label}
                  </span>
                );
              })}
              <span className="text-[9px] font-bold tracking-widest uppercase ml-1" style={{ color: "var(--preview-text-3)" }}>on</span>
              {CHAIN_OPTIONS.map(c => (
                <span key={c.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "rgba(59,130,246,0.10)", color: "#93c5fd" }}>
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {/* Scanning in progress */}
          {scanning && (
            <div className="rounded-2xl p-8 text-center"
              style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(15,138,138,0.08))", border: "1px solid rgba(59,130,246,0.12)" }}>
                <svg className="animate-spin" width={24} height={24} viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(96,165,250,0.2)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#60a5fa" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--preview-text)" }}>Scanning all platforms…</p>
              <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
                Checking 8 platforms × 5 chains. This may take 10–20 seconds.
              </p>
            </div>
          )}

          {/* Results */}
          {scanData && !scanning && (
            <div>
              {/* Summary row */}
              <div className="flex items-center gap-3 mb-4">
                <h3 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
                  {scanData.totalStreams > 0
                    ? `${scanData.totalStreams} vesting stream${scanData.totalStreams !== 1 ? "s" : ""} found`
                    : "No vestings found"
                  }
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                  style={{ background: "var(--preview-muted-2)", color: "var(--preview-text-3)" }}>
                  {shortAddr(scanData.address)}
                </span>
                {scanData.totalStreams > 0 && (
                  <>
                    <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                      across {scanData.results.length} platform{scanData.results.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={handleWatchAll}
                      className="ml-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.10), rgba(15,138,138,0.08))", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
                    >
                      Watch all {scanData.results.length} →
                    </button>
                  </>
                )}
              </div>

              {/* No results empty state */}
              {scanData.totalStreams === 0 ? (
                <div className="rounded-2xl p-8 text-center"
                  style={{ background: "var(--preview-card)", border: "1px solid var(--preview-border)" }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: "var(--preview-muted-2)" }}>
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--preview-text-3)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                  </div>
                  <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--preview-text-2)" }}>No active vestings found</p>
                  <p className="text-[11px] max-w-xs mx-auto leading-relaxed" style={{ color: "var(--preview-text-3)" }}>
                    This wallet has no active vesting streams on any of the {PROTOCOL_OPTIONS.length} supported platforms.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {scanData.results.map(r => (
                    <ResultCard
                      key={`${r.chainId}:${r.protocolId}`}
                      result={r}
                      watchStatus={watchStatus}
                      onWatchGroup={() => handleWatch(r.chainId, r.protocolId)}
                      onWatchToken={(tokenAddress) => handleWatch(r.chainId, r.protocolId, tokenAddress)}
                      isGroupWatching={isGroupWatching(r.chainId, r.protocolId)}
                      isTokenWatching={(tokenAddress) => isTokenWatchingFn(r.chainId, r.protocolId, tokenAddress)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Initial empty state — before first scan */}
          {!scanData && !scanning && (
            <div className="rounded-2xl p-10 text-center"
              style={{ background: "var(--preview-card)", border: "1px dashed var(--preview-border-2)" }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.06), rgba(15,138,138,0.06))", border: "1px solid rgba(59,130,246,0.10)" }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  <line x1="11" y1="8" x2="11" y2="14"/>
                  <line x1="8" y1="11" x2="14" y2="11"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--preview-text)" }}>
                Enter a wallet address to begin
              </h3>
              <p className="text-[12px] max-w-md mx-auto leading-relaxed" style={{ color: "var(--preview-text-3)" }}>
                Discover scans every supported platform to find all your token vestings in one go.
                Perfect if you&apos;ve forgotten which platform holds your allocation, or want to
                make sure you haven&apos;t missed any active streams.
              </p>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
