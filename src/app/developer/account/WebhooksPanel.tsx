"use client";

// src/app/developer/account/WebhooksPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Webhook subscription manager for /developer/account.
//
// Free tier: shows a soft locked-state with a pointer to upgrade.
// Pro tier:  list current subscriptions + a small create form below.
//
// Talks to /api/developer/webhooks (cookie-authed proxy) — that endpoint
// runs the same DB ops as the public /api/v1/webhooks but uses the
// vestr_api_access cookie instead of a Bearer token, since this panel
// has the cookie session, not the plaintext key.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

interface Subscription {
  id:              string;
  url:             string;
  secret_prefix:   string;
  wallet_filter:   string[] | null;
  protocol_filter: string[] | null;
  chain_filter:    number[] | null;
  events:          string[];
  hours_before:    number;
  last_fired_at:   string | null;
  failure_count:   number;
  disabled_at:     string | null;
  created_at:      string;
}

interface CreateResponse {
  subscription: Subscription;
  secret:       string;
}

const PROTOCOLS = ["sablier", "hedgey", "uncx", "unvest", "team-finance", "superfluid", "pinksale", "streamflow", "jupiter-lock"] as const;
const CHAINS    = [
  { id: 1,    label: "Ethereum" },
  { id: 56,   label: "BNB Chain" },
  { id: 137,  label: "Polygon" },
  { id: 8453, label: "Base" },
  { id: 101,  label: "Solana" },
];

export function WebhooksPanel({ tier }: { tier: string }) {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [url,         setUrl]         = useState("");
  const [hoursBefore, setHoursBefore] = useState(24);
  const [protocols,   setProtocols]   = useState<string[]>([]);
  const [chains,      setChains]      = useState<number[]>([]);
  const [wallets,     setWallets]     = useState("");
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState("");
  const [issued,      setIssued]      = useState<CreateResponse | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const isFree = tier === "free";

  useEffect(() => {
    if (isFree) return; // Don't bother listing for free tier.
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFree]);

  async function refresh() {
    setLoadError("");
    try {
      const r = await fetch("/api/developer/webhooks");
      if (r.status === 402) {
        setLoadError("Pro tier required.");
        setSubs([]);
        return;
      }
      const data = await r.json();
      if (!r.ok) {
        setLoadError(data.error ?? "Failed to load webhooks.");
        return;
      }
      setSubs(data.subscriptions ?? []);
    } catch {
      setLoadError("Network error.");
    }
  }

  function toggleArrayValue<T>(set: T[], value: T): T[] {
    return set.includes(value) ? set.filter((v) => v !== value) : [...set, value];
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    setIssued(null);
    try {
      const walletFilter = wallets
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch("/api/developer/webhooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          url:             url.trim(),
          hours_before:    hoursBefore,
          wallet_filter:   walletFilter.length > 0 ? walletFilter : undefined,
          protocol_filter: protocols.length     > 0 ? protocols     : undefined,
          chain_filter:    chains.length        > 0 ? chains        : undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setCreateError(data.error ?? "Couldn't create the subscription.");
        return;
      }
      setIssued(data as CreateResponse);
      setUrl("");
      setProtocols([]);
      setChains([]);
      setWallets("");
      refresh();
    } catch {
      setCreateError("Network error. Try again.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteSub(id: string) {
    if (!confirm("Delete this subscription? Vestream will stop calling its URL immediately.")) return;
    try {
      const r = await fetch(`/api/developer/webhooks/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        alert(data.error ?? "Couldn't delete.");
        return;
      }
      refresh();
    } catch {
      alert("Network error. Try again.");
    }
  }

  async function copySecret() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch { /* clipboard refused */ }
  }

  // ── Free-tier locked state ─────────────────────────────────────────────
  if (isFree) {
    return (
      <div className="rounded-2xl p-6"
        style={{ background: "#141720", border: "1px dashed rgba(255,255,255,0.12)" }}>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Webhooks
          </p>
          <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
            style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}>
            Pro · early access
          </span>
        </div>
        <h3 className="text-base font-bold mb-2" style={{ color: "white" }}>
          Server-to-server unlock alerts
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
          Register a URL and we&rsquo;ll POST to it whenever a matching unlock fires — no polling required.
          Filter by wallet, protocol, chain, or lookahead window. HMAC-signed for verification.
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
          Online checkout for Pro is being set up — until it goes live, email{" "}
          <a href="mailto:hello@vestream.io?subject=Vestream%20Pro%20-%20webhooks" className="underline" style={{ color: "#1CB8B8" }}>
            hello@vestream.io
          </a>{" "}
          and we&rsquo;ll enable webhooks on your key manually.
        </p>
      </div>
    );
  }

  // ── Pro state — list + create ─────────────────────────────────────────
  return (
    <div className="rounded-2xl p-6"
      style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Webhooks
        </p>
        <button
          onClick={() => { setShowCreate((v) => !v); setIssued(null); setCreateError(""); }}
          type="button"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "rgba(28,184,184,0.10)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.25)" }}
        >
          {showCreate ? "Cancel" : "+ New webhook"}
        </button>
      </div>
      <p className="text-xs leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>
        Vestream POSTs an event to the URL on each matching upcoming unlock. Verify each request via the
        {" "}<code className="font-mono px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#1CB8B8" }}>X-Vestream-Signature</code>{" "}
        header (HMAC-SHA256 of the raw body using your subscription secret).
      </p>

      {loadError && (
        <p className="text-xs px-3 py-2 mb-3 rounded-lg"
          style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.20)" }}>
          {loadError}
        </p>
      )}

      {/* Newly-issued subscription one-time secret display */}
      {issued && (
        <div className="rounded-xl p-4 mb-5"
          style={{ background: "rgba(45,179,106,0.06)", border: "1px solid rgba(45,179,106,0.30)" }}>
          <p className="text-xs font-bold mb-1" style={{ color: "white" }}>
            Subscription created
          </p>
          <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
            Your signing secret is shown once. Vestream will use it to sign every delivery — keep it safe.
          </p>
          <div className="rounded-lg p-2 mb-2 flex items-center gap-2"
            style={{ background: "#0d0f14", border: "1px solid rgba(28,184,184,0.30)" }}>
            <code className="flex-1 text-xs font-mono break-all" style={{ color: "#1CB8B8" }}>
              {issued.secret}
            </code>
            <button
              onClick={copySecret}
              type="button"
              className="text-xs font-semibold px-2.5 py-1 rounded flex-shrink-0 transition-colors"
              style={{
                background: secretCopied ? "rgba(45,179,106,0.15)" : "rgba(28,184,184,0.15)",
                color:      secretCopied ? "#2DB36A" : "#1CB8B8",
              }}
            >
              {secretCopied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setIssued(null)}
            type="button"
            className="text-xs underline"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Existing list */}
      {subs && subs.length > 0 && (
        <div className="flex flex-col gap-2 mb-5">
          {subs.map((s) => (
            <SubscriptionRow key={s.id} sub={s} onDelete={() => deleteSub(s.id)} />
          ))}
        </div>
      )}
      {subs && subs.length === 0 && !showCreate && (
        <p className="text-xs text-center py-6" style={{ color: "rgba(255,255,255,0.4)" }}>
          No webhooks yet. Create one to get started.
        </p>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={create} className="flex flex-col gap-3 pt-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {createError && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.20)" }}>
              {createError}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Destination URL *
            </label>
            <input
              type="url"
              required
              placeholder="https://your.app/webhooks/vestream"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-sm px-3 py-2.5 rounded-lg outline-none"
              style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.10)", color: "white" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Lookahead window (hours): {hoursBefore}
            </label>
            <input
              type="range"
              min={1} max={168}
              value={hoursBefore}
              onChange={(e) => setHoursBefore(Number(e.target.value))}
              className="w-full accent-teal-400"
              style={{ accentColor: "#1CB8B8" }}
            />
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              Fire when an unlock is within this many hours. Range 1–168 (7 days).
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Protocol filter (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PROTOCOLS.map((p) => (
                <FilterChip
                  key={p}
                  label={p}
                  active={protocols.includes(p)}
                  onClick={() => setProtocols(toggleArrayValue(protocols, p))}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Chain filter (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CHAINS.map((c) => (
                <FilterChip
                  key={c.id}
                  label={c.label}
                  active={chains.includes(c.id)}
                  onClick={() => setChains(toggleArrayValue(chains, c.id))}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Wallet filter (optional)
            </label>
            <textarea
              rows={2}
              placeholder="0xabc... 0xdef... (comma or whitespace separated)"
              value={wallets}
              onChange={(e) => setWallets(e.target.value)}
              className="text-sm px-3 py-2.5 rounded-lg outline-none resize-none font-mono"
              style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.10)", color: "white" }}
            />
          </div>

          <button
            type="submit"
            disabled={creating}
            className="text-sm font-bold py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60 mt-1"
            style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.30)" }}
          >
            {creating ? "Creating…" : "Create webhook"}
          </button>
        </form>
      )}
    </div>
  );
}

function SubscriptionRow({ sub, onDelete }: { sub: Subscription; onDelete: () => void }) {
  const filterChips: string[] = [];
  if (sub.wallet_filter && sub.wallet_filter.length)     filterChips.push(`${sub.wallet_filter.length} wallet${sub.wallet_filter.length === 1 ? "" : "s"}`);
  if (sub.protocol_filter && sub.protocol_filter.length) filterChips.push(sub.protocol_filter.join(","));
  if (sub.chain_filter && sub.chain_filter.length)       filterChips.push(`chain ${sub.chain_filter.join(",")}`);
  if (filterChips.length === 0) filterChips.push("any unlock");

  return (
    <div className="rounded-xl p-3"
      style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono break-all mb-1" style={{ color: "white" }}>
            {sub.url}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {filterChips.map((f) => (
              <span key={f} className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "rgba(28,184,184,0.10)", color: "#1CB8B8" }}>
                {f}
              </span>
            ))}
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              · {sub.hours_before}h ahead
            </span>
            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.3)" }}>
              · {sub.secret_prefix}…
            </span>
            {sub.disabled_at && (
              <span className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                disabled
              </span>
            )}
            {sub.failure_count > 0 && !sub.disabled_at && (
              <span className="text-[10px]" style={{ color: "rgba(245,158,11,0.7)" }}>
                · {sub.failure_count} fail{sub.failure_count === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          type="button"
          className="text-[11px] font-semibold px-2 py-1 rounded transition-colors flex-shrink-0"
          style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.20)" }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors"
      style={
        active
          ? { background: "rgba(28,184,184,0.15)", color: "#1CB8B8", border: "1px solid rgba(28,184,184,0.40)" }
          : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }
      }
    >
      {label}
    </button>
  );
}
