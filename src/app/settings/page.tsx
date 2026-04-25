"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isValidWalletAddress } from "@/lib/address-validation";
import Link from "next/link";
import { UpsellModal } from "@/components/UpsellModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Wallet {
  id: string;
  address: string;
  label: string | null;
  chains:       string[] | null;
  protocols:    string[] | null;
  tokenAddress: string | null;
}

interface Prefs {
  emailEnabled: boolean;
  email: string | null;
  hoursBeforeUnlock: number;
  notifyCliff: boolean;
  notifyStreamEnd: boolean;
}

const HOURS_OPTIONS = [1, 6, 12, 24, 48, 72];

// ─── Chain / Protocol options (shared by wallet card + add form) ──────────────

// Four production mainnets — mirrors the chain list the dashboard and
// Discover page scan against. Polygon was previously missing here, and
// Sepolia was included in its place — meaning users couldn't enable
// Polygon scans from Settings even though everything below the UI
// supported them. Dropped Sepolia (testnet, not relevant for consumer
// wallet tracking) and restored Polygon.
const CHAIN_OPTIONS = [
  { id: "1",    label: "Ethereum",  short: "ETH"   },
  { id: "56",   label: "BNB Chain", short: "BSC"   },
  { id: "137",  label: "Polygon",   short: "MATIC" },
  { id: "8453", label: "Base",      short: "Base"  },
  { id: "101",  label: "Solana",    short: "SOL"   },
];

// UI-visible protocols (UNCX covers both uncx + uncx-vm on the backend)
const PROTOCOL_OPTIONS = [
  { id: "sablier",      label: "Sablier"      },
  { id: "uncx",         label: "UNCX"         },
  { id: "team-finance", label: "Team Finance" },
  { id: "hedgey",       label: "Hedgey"       },
  { id: "unvest",       label: "Unvest"       },
  { id: "superfluid",   label: "Superfluid"   },
  { id: "pinksale",     label: "PinkSale"     },
];

// All backend protocol IDs (includes uncx-vm which is hidden in UI but treated as part of UNCX)
const ALL_BACKEND_PROTOCOL_IDS = ["sablier", "uncx", "uncx-vm", "team-finance", "hedgey", "unvest", "superfluid", "pinksale"];

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function IconWallet() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <circle cx="12" cy="14" r="1" fill="currentColor"/>
    </svg>
  );
}

function IconBell() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function IconUser() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

// ─── StyledInput ──────────────────────────────────────────────────────────────

function StyledInput({ placeholder, value, onChange, type = "text", fontMono = false }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  fontMono?: boolean;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all${fontMono ? " font-mono" : ""}`}
      style={{
        background: "var(--preview-muted-2)",
        border: "1px solid var(--preview-border)",
        color: "var(--preview-text)",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#1CB8B8")}
      onBlur={(e) => (e.currentTarget.style.borderColor = "var(--preview-border)")}
    />
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-6"
      style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div className="mb-5" style={{ borderBottom: "1px solid var(--preview-border-2)", paddingBottom: "1.25rem" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>{title}</h2>
        {description && <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── TogglePill ───────────────────────────────────────────────────────────────

function TogglePill({ label, active, onClick, saving }: {
  label: string; active: boolean; onClick: () => void; saving?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-100 flex-shrink-0 disabled:opacity-60"
      style={{
        background: active ? "rgba(28,184,184,0.12)" : "var(--preview-muted-2)",
        color:      active ? "#1CB8B8"               : "var(--preview-text-3)",
        border:     active ? "1px solid rgba(28,184,184,0.3)" : "1px solid var(--preview-border-2)",
      }}
    >
      {label}
    </button>
  );
}

// ─── WalletCard (settings) ────────────────────────────────────────────────────

function WalletCard({
  wallet, tier, onRemove, onUpdated,
}: {
  wallet:      Wallet;
  tier:        string;
  onRemove:    () => void;
  onUpdated:   (updated: Wallet) => void;
}) {
  // Label editing
  const [editingLabel,      setEditingLabel]      = useState(false);
  const [labelValue,        setLabelValue]        = useState(wallet.label ?? "");
  const [savingLabel,       setSavingLabel]       = useState(false);

  // Chain / protocol config — mirror wallet values, all = null stored as "all selected"
  const allChainIds    = CHAIN_OPTIONS.map(c => c.id);
  const allProtocolIds = ALL_BACKEND_PROTOCOL_IDS;
  const [selChains,    setSelChains]    = useState<Set<string>>(
    () => new Set(wallet.chains ?? allChainIds)
  );
  const [selProtocols, setSelProtocols] = useState<Set<string>>(
    () => new Set(wallet.protocols ?? allProtocolIds)
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved,  setConfigSaved]  = useState(false);

  // Token address filter
  const [editingTokenAddr, setEditingTokenAddr] = useState(false);
  const [tokenAddrValue,   setTokenAddrValue]   = useState(wallet.tokenAddress ?? "");
  const [savingTokenAddr,  setSavingTokenAddr]  = useState(false);

  // Per-wallet scan config (chains, platforms, token filter) is available
  // to every tier — differentiation lives on wallet count, Discover, alerts
  // and API access, not on the wallet-add flow. `tier` is received so this
  // component's prop signature stays aligned with future tier gating
  // without touching the call sites when we eventually need it.
  void tier;

  async function saveLabel() {
    setSavingLabel(true);
    try {
      const res = await fetch(`/api/wallets/${wallet.address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelValue || null }),
      });
      if (res.ok) {
        const { wallet: updated } = await res.json();
        onUpdated(updated);
        setEditingLabel(false);
      }
    } finally { setSavingLabel(false); }
  }

  async function saveConfig(newChains: Set<string>, newProtocols: Set<string>) {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const allChainsSelected    = newChains.size    === allChainIds.length;
      const allProtocolsSelected = newProtocols.size === allProtocolIds.length;
      const chains    = allChainsSelected    ? null : [...newChains].map(Number);
      const protocols = allProtocolsSelected ? null : [...newProtocols];

      const res = await fetch(`/api/wallets/${wallet.address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chains, protocols }),
      });
      if (res.ok) {
        const { wallet: updated } = await res.json();
        onUpdated(updated);
        setConfigSaved(true);
        setTimeout(() => setConfigSaved(false), 2000);
      }
    } finally { setSavingConfig(false); }
  }

  async function saveTokenAddrRaw(val: string | null) {
    setSavingTokenAddr(true);
    try {
      const res = await fetch(`/api/wallets/${wallet.address}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: val }),
      });
      if (res.ok) {
        const { wallet: updated } = await res.json();
        onUpdated(updated);
        setEditingTokenAddr(false);
        if (!val) setTokenAddrValue("");
      }
    } finally { setSavingTokenAddr(false); }
  }

  async function saveTokenAddr() {
    const trimmed = tokenAddrValue.trim();
    await saveTokenAddrRaw(trimmed || null);
  }

  function toggleChain(id: string) {
    setSelChains(prev => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size === 1) return prev; next.delete(id); }
      else next.add(id);
      saveConfig(next, selProtocols);
      return next;
    });
  }

  function toggleProtocol(id: string) {
    setSelProtocols(prev => {
      const next = new Set(prev);
      // UNCX UI pill controls both uncx and uncx-vm together
      const ids = id === "uncx" ? ["uncx", "uncx-vm"] : [id];
      const allPresent = ids.every(i => next.has(i));
      if (allPresent) {
        // Don't allow deselecting if it would leave nothing enabled
        const afterRemove = ids.reduce((s, i) => { s.delete(i); return s; }, new Set(next));
        if (afterRemove.size === 0) return prev;
        ids.forEach(i => next.delete(i));
      } else {
        ids.forEach(i => next.add(i));
      }
      saveConfig(selChains, next);
      return next;
    });
  }

  return (
    <li className="rounded-xl overflow-hidden"
      style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>

      {/* ── Header: label + address + remove ── */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {editingLabel ? (
            <div className="flex items-center gap-2 mb-1">
              <input
                autoFocus
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveLabel(); if (e.key === "Escape") setEditingLabel(false); }}
                placeholder="Label (e.g. Portfolio Co A)"
                className="flex-1 text-xs rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: "var(--preview-card)", border: "1px solid #1CB8B8", color: "var(--preview-text)" }}
              />
              <button onClick={saveLabel} disabled={savingLabel}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white disabled:opacity-60"
                style={{ background: "#1CB8B8" }}>
                {savingLabel ? "…" : "Save"}
              </button>
              <button onClick={() => { setEditingLabel(false); setLabelValue(wallet.label ?? ""); }}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{ color: "var(--preview-text-3)", background: "var(--preview-muted)" }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-0.5">
              {wallet.label
                ? <p className="text-xs font-semibold truncate" style={{ color: "var(--preview-text)" }}>{wallet.label}</p>
                : <p className="text-xs italic" style={{ color: "var(--preview-text-3)" }}>No label</p>
              }
              <button onClick={() => { setEditingLabel(true); setLabelValue(wallet.label ?? ""); }}
                title="Edit label"
                className="flex-shrink-0 flex items-center justify-center w-4 h-4 rounded transition-colors"
                style={{ color: "var(--preview-text-3)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--preview-text)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--preview-text-3)")}>
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          )}
          <p className="text-[11px] font-mono truncate" style={{ color: "var(--preview-text-3)" }}>{wallet.address}</p>
        </div>
        <button onClick={onRemove}
          className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors mt-0.5"
          style={{ color: "#f87171", background: "rgba(248,113,113,0.1)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.18)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)")}>
          Remove
        </button>
      </div>

      {/* ── Config: chains + platforms + token filter ── */}
      <div className="px-4 pb-3 space-y-2.5" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}>

        {/* Chains / platforms multi-select — available on every tier. */}
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--preview-text-3)" }}>
            Chains to scan
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CHAIN_OPTIONS.map((c) => (
              <TogglePill key={c.id} label={c.short} active={selChains.has(c.id)} onClick={() => toggleChain(c.id)} saving={savingConfig} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--preview-text-3)" }}>
            Platforms to scan
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROTOCOL_OPTIONS.map((p) => {
              // UNCX pill is active if either uncx or uncx-vm is selected
              const isActive = p.id === "uncx"
                ? (selProtocols.has("uncx") || selProtocols.has("uncx-vm"))
                : selProtocols.has(p.id);
              return (
                <TogglePill key={p.id} label={p.label} active={isActive} onClick={() => toggleProtocol(p.id)} saving={savingConfig} />
              );
            })}
          </div>
        </div>

        {/* Status + summary */}
        <div className="flex items-center gap-2">
          {savingConfig ? (
            <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>Saving…</span>
          ) : configSaved ? (
            <span className="text-[10px] text-emerald-500">✓ Saved</span>
          ) : (
            <span className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
              {selChains.size === CHAIN_OPTIONS.length && selProtocols.size === ALL_BACKEND_PROTOCOL_IDS.length
                ? "Scanning all chains & platforms"
                : `Scanning ${selChains.size} chain${selChains.size !== 1 ? "s" : ""} · ${[...selProtocols].filter(p => p !== "uncx-vm").length} platform${[...selProtocols].filter(p => p !== "uncx-vm").length !== 1 ? "s" : ""}`
              }
            </span>
          )}
        </div>

        {/* ── Discover link ── */}
        <div className="flex items-center gap-2.5 pt-1" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.625rem" }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
            Not sure which platforms this wallet uses?{" "}
            <a href="/dashboard/discover" className="font-semibold underline" style={{ color: "#1CB8B8" }}>
              Scan all platforms in Discover →
            </a>
          </p>
        </div>

        {/* ── Token address filter ── */}
        <div className="pt-2.5" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "var(--preview-text-3)" }}>
              Token filter
              <span className="normal-case font-normal tracking-normal"> (optional)</span>
            </p>
            {wallet.tokenAddress && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(52,211,153,0.10)", color: "#34d399", border: "1px solid rgba(52,211,153,0.2)" }}>
                active
              </span>
            )}
          </div>
          {editingTokenAddr ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={tokenAddrValue}
                onChange={(e) => setTokenAddrValue(e.target.value)}
                placeholder="Token contract address (0x… or Solana mint)"
                className="flex-1 text-xs font-mono rounded-lg px-2.5 py-1.5 outline-none"
                style={{ background: "var(--preview-card)", border: "1px solid #1CB8B8", color: "var(--preview-text)" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTokenAddr();
                  if (e.key === "Escape") { setEditingTokenAddr(false); setTokenAddrValue(wallet.tokenAddress ?? ""); }
                }}
              />
              <button onClick={saveTokenAddr} disabled={savingTokenAddr}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white disabled:opacity-60"
                style={{ background: "#1CB8B8" }}>
                {savingTokenAddr ? "…" : "Save"}
              </button>
              <button onClick={() => { setEditingTokenAddr(false); setTokenAddrValue(wallet.tokenAddress ?? ""); }}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{ color: "var(--preview-text-3)", background: "var(--preview-muted)" }}>✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {wallet.tokenAddress ? (
                <>
                  <p className="text-[10px] font-mono flex-1 truncate" style={{ color: "var(--preview-text-2)" }}>{wallet.tokenAddress}</p>
                  <button onClick={() => { setEditingTokenAddr(true); setTokenAddrValue(wallet.tokenAddress ?? ""); }}
                    className="text-[10px] flex-shrink-0 underline" style={{ color: "#1CB8B8" }}>Edit</button>
                  <button onClick={() => saveTokenAddrRaw(null)} disabled={savingTokenAddr}
                    className="text-[10px] flex-shrink-0 underline disabled:opacity-60" style={{ color: "#f87171" }}>Clear</button>
                </>
              ) : (
                <>
                  <p className="text-[10px] italic" style={{ color: "var(--preview-text-3)" }}>
                    None — scanning all tokens
                  </p>
                  <button onClick={() => setEditingTokenAddr(true)}
                    className="text-[10px] flex-shrink-0 underline" style={{ color: "#1CB8B8" }}>
                    Set filter
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-[9px] mt-1" style={{ color: "var(--preview-text-3)" }}>
            Narrows dashboard to one specific token on this wallet. Use Discover to find token addresses.
          </p>
        </div>
      </div>
    </li>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const router = useRouter();
  const [dark, setDark]                   = useState(false);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [tier, setTier]                   = useState<string>("free");
  const [walletLimit, setWalletLimit]     = useState<number | null>(1);
  // Push-alert credit counter — Free has 3 lifetime credits, paid tiers are
  // unmetered (pushAlertsLimit === null). Surfaces the same counter the
  // mobile app shows so users see the same number on every surface.
  const [pushAlertsSent,  setPushAlertsSent]  = useState<number>(0);
  const [pushAlertsLimit, setPushAlertsLimit] = useState<number | null>(null);
  const [upsell, setUpsell]               = useState<{ featureName: string; requiredTier: "pro" | "fund" } | null>(null);
  const [activeSection, setActiveSection] = useState<"wallets" | "notifications" | "account">("wallets");

  // Keep dark mode in sync with the shared localStorage key
  useEffect(() => {
    try { if (localStorage.getItem("vestr-dark") === "1") setDark(true); } catch { /* ignore */ }
  }, []);

  function toggleDark() {
    setDark((v) => {
      const next = !v;
      try { localStorage.setItem("vestr-dark", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  const [wallets, setWallets]             = useState<Wallet[]>([]);
  const [removingId, setRemovingId]       = useState<string | null>(null);

  // Add wallet form
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel]     = useState("");
  const [addError, setAddError]     = useState<string | null>(null);
  const [adding, setAdding]         = useState(false);
  // Required single chain + single platform for new wallet
  const [newSelChain,    setNewSelChain]    = useState<string>("");
  const [newSelProtocol, setNewSelProtocol] = useState<string>("");
  const [newTokenAddr,   setNewTokenAddr]   = useState<string>("");

  // Notification prefs
  const [prefs, setPrefs]       = useState<Prefs>({ emailEnabled: false, email: null, hoursBeforeUnlock: 24, notifyCliff: true, notifyStreamEnd: true });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveOk, setSaveOk]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadWallets = useCallback(async () => {
    const res = await fetch("/api/wallets");
    if (res.status === 401) { router.push("/login"); return; }
    if (res.ok) {
      const json = await res.json();
      setWallets(json.wallets ?? []);
      setSessionAddress(json.sessionAddress ?? null);
      setTier(json.tier ?? "free");
      setWalletLimit(json.walletLimit ?? 1);
      setPushAlertsSent(json.pushAlertsSent ?? 0);
      setPushAlertsLimit(json.pushAlertsLimit ?? null);
    }
  }, [router]);

  useEffect(() => {
    loadWallets();
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then(({ preferences }) => {
        if (preferences) setPrefs((p) => ({
          ...p,
          emailEnabled:      preferences.emailEnabled      ?? false,
          email:             preferences.email             ?? null,
          hoursBeforeUnlock: preferences.hoursBeforeUnlock ?? 24,
          notifyCliff:       preferences.notifyCliff       ?? true,
          notifyStreamEnd:   preferences.notifyStreamEnd   ?? true,
        }));
      });
  }, [loadWallets]);

  async function handleAddWallet(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!isValidWalletAddress(newAddress)) { setAddError("Enter a valid wallet address (EVM 0x… or Solana pubkey)"); return; }
    setAdding(true);
    try {
      // All optional — wallet-add defaults to auto-scan all chains + platforms.
      // Users can narrow chains/platforms/token afterwards from the wallet card.
      const chains =
        newSelChain ? [parseInt(newSelChain)] : undefined;
      const protocols = newSelProtocol
        ? (newSelProtocol === "uncx" ? ["uncx", "uncx-vm"] : [newSelProtocol])
        : undefined;
      const tokenAddress = newTokenAddr.trim() && isValidWalletAddress(newTokenAddr.trim()) ? newTokenAddr.trim() : undefined;
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newAddress, label: newLabel || undefined, chains, protocols, tokenAddress }),
      });
      if (res.status === 409) { setAddError("Wallet already tracked"); return; }
      if (!res.ok) { const j = await res.json(); setAddError(j.error ?? "Failed"); return; }
      setNewAddress(""); setNewLabel("");
      setNewSelChain(""); setNewSelProtocol(""); setNewTokenAddr("");
      await loadWallets();
    } catch { setAddError("Network error"); }
    finally { setAdding(false); }
  }

  async function handleRemoveWallet(wallet: Wallet) {
    setRemovingId(wallet.id);
    try {
      await fetch(`/api/wallets/${wallet.address}`, { method: "DELETE" });
      await loadWallets();
    } finally { setRemovingId(null); }
  }

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveOk(false); setSaveError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled:      prefs.emailEnabled,
          email:             prefs.email,
          hoursBeforeUnlock: prefs.hoursBeforeUnlock,
          notifyCliff:       prefs.notifyCliff,
          notifyStreamEnd:   prefs.notifyStreamEnd,
        }),
      });
      if (!res.ok) { const j = await res.json(); setSaveError(j.error ?? "Failed to save"); return; }
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (!res.ok) { alert("Failed to delete account. Please try again."); return; }
      router.push("/");
      router.refresh();
    } catch { alert("Network error. Please try again."); }
    finally { setDeleting(false); }
  }

  const shortAddr = (addr: string) => {
    if (addr.includes("@")) return addr.length > 16 ? addr.slice(0, 14) + "…" : addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  };
  const initials = sessionAddress
    ? (sessionAddress.includes("@") ? sessionAddress.slice(0, 2).toUpperCase() : sessionAddress.slice(2, 4).toUpperCase())
    : "??";

  return (
    <div className={`flex h-screen overflow-hidden${dark ? " dark" : ""}`}
      style={{ background: "var(--preview-bg)" }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 h-screen flex flex-col"
        style={{ background: "var(--preview-card)", borderRight: "1px solid var(--preview-border)" }}>

        {/* Logo */}
        <Link href="/dashboard" className="px-5 h-14 flex items-center gap-3 flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ borderBottom: "1px solid var(--preview-border)" }}>
          <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7 flex-shrink-0" />
          <div>
            <span className="font-bold text-sm tracking-tight leading-none" style={{ color: "var(--preview-text)" }}>Vestream</span>
            <p className="text-[9px] mt-0.5 leading-none" style={{ color: "var(--preview-text-3)" }}>Track every token unlock</p>
          </div>
        </Link>

        {/* Nav */}
        <nav className="px-3 py-3 space-y-0.5 flex-shrink-0">
          {[
            { icon: <IconGrid />,     label: "Dashboard", href: "/dashboard",         active: false },
            { icon: <IconSearch />,   label: "Discover",  href: "/dashboard/discover", active: false },
            { icon: <IconSettings />, label: "Settings",  href: "/settings",           active: true  },
          ].map((item) => (
            <Link key={item.label} href={item.href}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150"
              style={item.active
                ? { background: "linear-gradient(135deg, rgba(28,184,184,0.12), rgba(15,138,138,0.08))", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.15)", display: "flex" }
                : { color: "var(--preview-text-2)", border: "1px solid transparent", display: "flex" }}
              onMouseEnter={(e) => { if (!item.active) (e.currentTarget as HTMLElement).style.background = "var(--preview-muted)"; }}
              onMouseLeave={(e) => { if (!item.active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span className="opacity-80 flex-shrink-0">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Settings section nav */}
        <div className="px-3 pb-2 flex-shrink-0" style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "0.75rem" }}>
          <p className="text-[9px] font-bold tracking-widest uppercase px-3 mb-1.5" style={{ color: "var(--preview-text-3)" }}>Settings</p>
          {([
            { id: "wallets"       as const, label: "Tracked Wallets",     icon: <IconWallet /> },
            { id: "notifications" as const, label: "Notifications",       icon: <IconBell />   },
            { id: "account"       as const, label: "Account",             icon: <IconUser />   },
          ]).map((sec) => (
            <button key={sec.id} type="button"
              onClick={() => setActiveSection(sec.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 text-left"
              style={activeSection === sec.id
                ? { background: "rgba(28,184,184,0.08)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.12)" }
                : { color: "var(--preview-text-2)", border: "1px solid transparent" }}
              onMouseEnter={(e) => { if (activeSection !== sec.id) (e.currentTarget as HTMLElement).style.background = "var(--preview-muted)"; }}
              onMouseLeave={(e) => { if (activeSection !== sec.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span className="opacity-70 flex-shrink-0">{sec.icon}</span>
              {sec.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
          <p className="text-[9px]" style={{ color: "var(--preview-text-3)" }}>Read-only · No funds access</p>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header */}
        <header className="h-14 px-6 flex items-center justify-between flex-shrink-0"
          style={{ background: "var(--preview-card)", borderBottom: "1px solid var(--preview-border)" }}>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>
              {activeSection === "wallets" ? "Tracked Wallets" : activeSection === "notifications" ? "Notifications" : "Account"}
            </h1>
            <p className="text-[11px]" style={{ color: "var(--preview-text-3)" }}>
              {activeSection === "wallets" ? "Manage wallets, chains and platforms to scan" : activeSection === "notifications" ? "Email alert preferences" : "Account settings and data"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Dark toggle */}
            <button onClick={toggleDark} title={dark ? "Light mode" : "Dark mode"}
              className="w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200"
              style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--preview-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--preview-card)")}>
              {dark ? (
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--preview-text-2)" }}>
                  <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--preview-text-2)" }}>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>

            {/* Wallet chip */}
            {sessionAddress && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border"
                style={{ background: "var(--preview-card)", borderColor: "var(--preview-border)" }}>
                <div className="w-5 h-5 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[8px] font-bold text-white">{initials}</div>
                <span className="text-xs font-medium" style={{ color: "var(--preview-text-2)", fontFamily: sessionAddress?.includes("@") ? "inherit" : "monospace" }}>{shortAddr(sessionAddress)}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-w-2xl">

          {/* ── Tracked Wallets ──────────────────────────────────────────── */}
          {activeSection === "wallets" && <Section
            title="Tracked Wallets"
            description="Choose which chains and platforms to scan for each wallet — Vestream only loads what you need, keeping the dashboard fast."
          >
            {/* Wallet list */}
            {wallets.length === 0 ? (
              <p className="text-sm mb-5" style={{ color: "var(--preview-text-3)" }}>No wallets tracked yet.</p>
            ) : (
              <ul className="space-y-3 mb-5">
                {wallets.map((w) => (
                  <WalletCard
                    key={w.id}
                    wallet={w}
                    tier={tier}
                    onRemove={() => handleRemoveWallet(w)}
                    onUpdated={(updated) =>
                      setWallets((prev) => prev.map((x) => x.id === updated.id ? { ...x, ...updated } : x))
                    }
                  />
                ))}
              </ul>
            )}

            {/* Add wallet form — gated for free plan at limit */}
            {walletLimit !== null && wallets.length >= walletLimit && tier === "free" ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl"
                style={{ background: "rgba(28,184,184,0.05)", border: "1px solid rgba(28,184,184,0.18)", borderTop: "1px solid var(--preview-border-2)", marginTop: "0.25rem" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔒</span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Add another wallet</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                      Free plan includes 1 wallet. Upgrade to Pro for up to 3.
                    </p>
                  </div>
                </div>
                <a href="/pricing"
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                  style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)" }}>
                  Upgrade →
                </a>
              </div>
            ) : (
            <div style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "1.25rem" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--preview-text-2)" }}>Add a wallet</p>
              <p className="text-[11px] mb-3" style={{ color: "var(--preview-text-3)" }}>
                We&apos;ll scan every supported chain &amp; platform for you. Narrow scope later if you want to.
              </p>
              <form onSubmit={handleAddWallet} className="flex flex-col gap-2.5">
                <StyledInput placeholder="Wallet address (0x… or Solana pubkey)" value={newAddress} onChange={setNewAddress} fontMono />
                <StyledInput placeholder="Label (optional — e.g. Team vesting)" value={newLabel} onChange={setNewLabel} />

                {/* Optional advanced filters */}
                <details className="mt-1">
                  <summary className="text-[11px] cursor-pointer select-none" style={{ color: "var(--preview-text-3)" }}>
                    Advanced — narrow chains / platforms / token (optional)
                  </summary>
                  <div className="mt-3 flex flex-col gap-2.5">
                    <div className="flex gap-3 flex-wrap">
                      <div className="flex-1 min-w-[130px]">
                        <p className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--preview-text-3)" }}>Chain</p>
                        <select
                          value={newSelChain}
                          onChange={(e) => setNewSelChain(e.target.value)}
                          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                          style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
                        >
                          <option value="">All chains</option>
                          {CHAIN_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <p className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--preview-text-3)" }}>Platform</p>
                        <select
                          value={newSelProtocol}
                          onChange={(e) => setNewSelProtocol(e.target.value)}
                          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                          style={{ background: "var(--preview-muted-2)", border: "1px solid var(--preview-border)", color: "var(--preview-text)" }}
                        >
                          <option value="">All platforms</option>
                          {PROTOCOL_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--preview-text-3)" }}>
                        Token contract address <span className="normal-case font-normal">(optional)</span>
                      </p>
                      <StyledInput placeholder="0x… or Solana mint" value={newTokenAddr} onChange={setNewTokenAddr} fontMono />
                      <p className="text-[9px] mt-1" style={{ color: "var(--preview-text-3)" }}>
                        Narrows tracking to a single token. Leave blank to auto-scan all.
                      </p>
                    </div>
                  </div>
                </details>

                <p className="text-[10px]" style={{ color: "var(--preview-text-3)" }}>
                  Not sure?{" "}
                  <a href="/dashboard/discover" className="underline font-medium" style={{ color: "#1CB8B8" }}>
                    Scan all platforms in Discover →
                  </a>
                </p>

                {addError && <p className="text-xs text-red-400">{addError}</p>}
                <button type="submit"
                  disabled={adding || !newAddress}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 self-start"
                  style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: "0 2px 8px rgba(28,184,184,0.3)" }}>
                  <IconPlus /> {adding ? "Adding…" : "Track wallet"}
                </button>
              </form>
            </div>
            )}
          </Section>}

          {/* ── Email Notifications ──────────────────────────────────────── */}
          {activeSection === "notifications" && <Section
            title="Email Notifications"
            description="Get alerted before your tokens unlock so you never miss a claim."
          >
            <form onSubmit={handleSavePrefs} className="space-y-4">

              {/* Enable toggle */}
              <div className="flex items-center justify-between gap-4">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => {
                    setPrefs((p) => ({ ...p, emailEnabled: !p.emailEnabled }));
                  }}>
                  <p className="text-sm font-medium" style={{ color: "var(--preview-text)" }}>Enable unlock alerts</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>Receive an email before each token unlock event.</p>
                </div>
                {/* Toggle switch — standalone button so clicks don't double-fire */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.emailEnabled}
                  onClick={() => {
                    setPrefs((p) => ({ ...p, emailEnabled: !p.emailEnabled }));
                  }}
                  className="relative w-10 h-6 rounded-full flex items-center transition-all duration-200 cursor-pointer px-0.5 flex-shrink-0"
                  style={{ background: prefs.emailEnabled ? "#1CB8B8" : "var(--preview-border)", border: "none", outline: "none" }}>
                  <span className="w-5 h-5 rounded-full bg-white shadow transition-all duration-200 block"
                    style={{ transform: prefs.emailEnabled ? "translateX(16px)" : "translateX(0)" }} />
                </button>
              </div>

              {prefs.emailEnabled && (
                <>
                  <div style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "1rem" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--preview-text-2)" }}>Email address</p>
                    <StyledInput
                      type="email"
                      placeholder="you@example.com"
                      value={prefs.email ?? ""}
                      onChange={(v) => setPrefs((p) => ({ ...p, email: v }))}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--preview-text-2)" }}>Notify me this far before each unlock</p>
                    <div className="flex flex-wrap gap-2">
                      {HOURS_OPTIONS.map((h) => {
                        const isActive = prefs.hoursBeforeUnlock === h;
                        return (
                          <button key={h} type="button"
                            onClick={() => setPrefs((p) => ({ ...p, hoursBeforeUnlock: h }))}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-150"
                            style={{
                              background: isActive ? "#1CB8B818" : "var(--preview-muted-2)",
                              borderColor: isActive ? "#1CB8B855" : "var(--preview-border-2)",
                              color: isActive ? "#1CB8B8" : "var(--preview-text-3)",
                            }}>
                            {h < 24 ? `${h}h` : `${h / 24}d`} before
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notification type selection */}
                  <div style={{ borderTop: "1px solid var(--preview-border-2)", paddingTop: "1rem" }}>
                    <p className="text-xs font-semibold mb-3" style={{ color: "var(--preview-text-2)" }}>Alert types</p>
                    <div className="space-y-2.5">
                      {([
                        { key: "notifyCliff"     as const, label: "Cliff approaching", desc: "Alert when a cliff unlock date is near." },
                        { key: "notifyStreamEnd" as const, label: "Stream ending soon", desc: "Alert when a vesting stream is about to fully vest." },
                      ] as { key: keyof Pick<Prefs, "notifyCliff" | "notifyStreamEnd">; label: string; desc: string }[]).map(({ key, label, desc }) => (
                        <div key={key} className="flex items-start justify-between gap-4">
                          <div
                            className="flex-1 cursor-pointer"
                            onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}>
                            <p className="text-sm font-medium" style={{ color: "var(--preview-text)" }}>{label}</p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>{desc}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={prefs[key]}
                            onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}
                            className="w-10 h-6 rounded-full flex items-center transition-all duration-200 cursor-pointer px-0.5 flex-shrink-0 mt-0.5"
                            style={{ background: prefs[key] ? "#1CB8B8" : "var(--preview-border)", border: "none", outline: "none" }}>
                            <span className="w-5 h-5 rounded-full bg-white shadow transition-all duration-200 block"
                              style={{ transform: prefs[key] ? "translateX(16px)" : "translateX(0)" }} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              {saveOk && <p className="text-xs text-emerald-500">Settings saved.</p>}

              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #1CB8B8, #0F8A8A)", boxShadow: "0 2px 8px rgba(28,184,184,0.25)" }}>
                  {saving ? "Saving…" : "Save preferences"}
                </button>
              </div>
            </form>

            {/* ── Mobile push notifications ── */}
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
              <div className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
                style={{ background: "rgba(28,184,184,0.04)", border: "1px solid rgba(28,184,184,0.14)" }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#1CB8B8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                  <line x1="12" y1="18" x2="12.01" y2="18"/>
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--preview-text)" }}>Mobile push notifications</p>
                  <p className="text-xs mt-1 mb-3" style={{ color: "var(--preview-text-3)", lineHeight: 1.5 }}>
                    Get instant push notifications the moment a token unlocks — straight to your phone. Available in the Vestream app.
                  </p>

                  {/* Push-credit counter — Free is 3 lifetime, paid is
                      unmetered. Same counter the mobile app surfaces so
                      users see the identical number on every platform
                      (pushAlertsLimit === null ⇒ unmetered). */}
                  {pushAlertsLimit !== null ? (
                    <div className="mb-3 px-3 py-2 rounded-lg"
                      style={{
                        background: pushAlertsSent >= pushAlertsLimit ? "rgba(245,158,11,0.08)" : "rgba(28,184,184,0.06)",
                        border: `1px solid ${pushAlertsSent >= pushAlertsLimit ? "rgba(245,158,11,0.25)" : "rgba(28,184,184,0.18)"}`,
                      }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold" style={{ color: pushAlertsSent >= pushAlertsLimit ? "#C47A1A" : "#1CB8B8" }}>
                          {pushAlertsSent >= pushAlertsLimit
                            ? `${pushAlertsLimit} of ${pushAlertsLimit} lifetime push alerts used`
                            : `${pushAlertsSent} of ${pushAlertsLimit} lifetime push alerts used`}
                        </p>
                        {pushAlertsSent >= pushAlertsLimit && (
                          <a href="/pricing" className="text-[10px] font-semibold underline" style={{ color: "#C47A1A" }}>
                            Upgrade →
                          </a>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(0,0,0,0.05)" }}>
                        <div className="h-full transition-all"
                          style={{
                            width: `${Math.min(100, (pushAlertsSent / pushAlertsLimit) * 100)}%`,
                            background: pushAlertsSent >= pushAlertsLimit ? "#C47A1A" : "#1CB8B8",
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 px-3 py-2 rounded-lg inline-block"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "#059669" }}>
                        ✓ Unlimited push alerts ({tier === "fund" ? "Enterprise" : "Pro"})
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <a href="https://apps.apple.com/app/vestream" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110"
                      style={{ background: "#000", color: "#fff" }}>
                      {/* Apple logo glyph */}
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                      </svg>
                      App Store
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=io.vestream" target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:brightness-110"
                      style={{ background: "linear-gradient(135deg, #2D8A4A, #059669)", color: "#fff" }}>
                      {/* Google Play triangle glyph */}
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M3 20.5V3.5c0-.35.2-.65.5-.8l10.04 9.3L3.5 21.3c-.3-.15-.5-.45-.5-.8zM14.4 12l2.96 2.96-8.9 5.08 5.94-8.04zm0 0L8.46 3.96l8.9 5.08L14.4 12zM20.5 12c0 .4-.2.8-.6 1.02l-2.2 1.26L14.4 12l3.3-2.28 2.2 1.26c.4.22.6.62.6 1.02z"/>
                      </svg>
                      Google Play
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </Section>}

          {/* ── Account ──────────────────────────────────────────────────── */}
          {activeSection === "account" && <Section title="Account">
            {/* Sign out */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--preview-text)" }}>Sign out</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                  You&apos;ll need to reconnect your wallet to access the dashboard.
                </p>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.push("/login");
                  router.refresh();
                }}
                className="flex-shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
                style={{ color: "#f87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.18)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.1)")}>
                Sign out
              </button>
            </div>

            {/* Delete account */}
            <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--preview-border-2)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium" style={{ color: "#f87171" }}>Delete account</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--preview-text-3)" }}>
                    Permanently removes your account, all tracked wallets, and notification settings. This cannot be undone.
                  </p>
                </div>
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex-shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors"
                    style={{ color: "#f87171", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.12)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.06)")}>
                    Delete account
                  </button>
                ) : (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium" style={{ color: "var(--preview-text-3)" }}>Are you sure?</span>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      className="text-xs px-2.5 py-1.5 rounded-lg"
                      style={{ color: "var(--preview-text-3)", background: "var(--preview-muted-2)", border: "1px solid var(--preview-border-2)" }}>
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                      style={{ background: "#B3322E" }}>
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Section>}

        </main>
      </div>

      {upsell && (
        <UpsellModal
          featureName={upsell.featureName}
          requiredTier={upsell.requiredTier}
          onClose={() => setUpsell(null)}
        />
      )}
    </div>
  );
}
