"use client";

// src/app/developer/account/KeyManagement.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Rotate / Revoke buttons for the developer account page.
//
// Rotate: revokes the current key + issues a fresh one of the same tier.
// The new plaintext key is shown ONCE in this component (modal-ish inline
// panel) – same UX as the initial issuance flow.
//
// Revoke: terminal. Sets revokedAt, clears the portal cookie, redirects
// the user back to /developer/portal. They'll need a new key from
// /developer to come back.
//
// Both actions hit `/api/developer/keys/{rotate,revoke}` which gate on the
// `vestr_api_access` cookie (same session that loaded the page).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RotateResponse {
  ok:     boolean;
  key?:   string;
  prefix?: string;
  tier?:  string;
  error?: string;
}

export function KeyManagement() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "rotating" | "revoking" | "rotated" | "error">("idle");
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [issued, setIssued] = useState<{ key: string; prefix: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  async function rotate() {
    setPhase("rotating");
    setErrorMsg("");
    try {
      const res = await fetch("/api/developer/keys/rotate", { method: "POST" });
      const data: RotateResponse = await res.json();
      if (!res.ok || !data.key || !data.prefix) {
        setErrorMsg(data.error ?? "Rotation failed.");
        setPhase("error");
        return;
      }
      setIssued({ key: data.key, prefix: data.prefix });
      setPhase("rotated");
      setConfirmRotate(false);
    } catch {
      setErrorMsg("Network error. Try again.");
      setPhase("error");
    }
  }

  async function revoke() {
    setPhase("revoking");
    setErrorMsg("");
    try {
      const res = await fetch("/api/developer/keys/revoke", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.error ?? "Revocation failed.");
        setPhase("error");
        return;
      }
      // Cookie was cleared server-side – bounce to portal.
      router.push("/developer/portal");
    } catch {
      setErrorMsg("Network error. Try again.");
      setPhase("error");
    }
  }

  async function copyKey() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard refused */ }
  }

  // ── Rotated success state ────────────────────────────────────────────────
  if (phase === "rotated" && issued) {
    return (
      <div className="rounded-2xl p-6"
        style={{ background: "rgba(45,179,106,0.06)", border: "1px solid rgba(45,179,106,0.25)" }}>
        <div className="flex items-center gap-2.5 mb-3">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <path d="M5 12l4 4 10-10" stroke="#2DB36A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm font-bold" style={{ color: "white" }}>New key issued</p>
        </div>
        <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
          Your old key is now revoked. Replace it in your MCP config / API client
          with the new one below. <strong style={{ color: "white" }}>This is the only time we&apos;ll show the plaintext.</strong>
        </p>
        <div className="rounded-xl p-3 mb-3 flex items-center gap-2"
          style={{ background: "#0d0f14", border: "1px solid rgba(28,184,184,0.30)" }}>
          <code className="flex-1 text-xs font-mono break-all" style={{ color: "#1CB8B8" }}>{issued.key}</code>
          <button
            onClick={copyKey}
            type="button"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap flex-shrink-0 transition-colors"
            style={{
              background: copied ? "rgba(45,179,106,0.15)" : "rgba(28,184,184,0.15)",
              color:      copied ? "#2DB36A" : "#1CB8B8",
              border:     copied ? "1px solid rgba(45,179,106,0.30)" : "1px solid rgba(28,184,184,0.30)",
            }}
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          The page header still shows the old prefix until you reload – refresh after pasting the new key
          into your config to see {issued.prefix} reflected here.
        </p>
      </div>
    );
  }

  // ── Idle / confirm states ────────────────────────────────────────────────
  return (
    <div className="rounded-2xl p-6"
      style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
        Key management
      </p>
      <p className="text-sm leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
        If you suspect this key has leaked, rotate it now. If you&rsquo;re done with the API entirely, revoke
        it – both are immediate.
      </p>

      {errorMsg && (
        <p className="text-xs px-3 py-2 mb-4 rounded-lg"
          style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.20)" }}>
          {errorMsg}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {/* Rotate row */}
        {!confirmRotate ? (
          <button
            onClick={() => { setConfirmRotate(true); setConfirmRevoke(false); setErrorMsg(""); }}
            type="button"
            disabled={phase === "rotating"}
            className="text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "rgba(28,184,184,0.08)", border: "1px solid rgba(28,184,184,0.25)", color: "#1CB8B8" }}
          >
            <span>Rotate key</span>
            <span className="text-xs" style={{ color: "rgba(28,184,184,0.7)" }}>→</span>
          </button>
        ) : (
          <div className="rounded-xl p-4"
            style={{ background: "rgba(28,184,184,0.05)", border: "1px solid rgba(28,184,184,0.25)" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "white" }}>Rotate this key?</p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
              The current key will be revoked immediately. Any client using it will start failing with 401
              until you paste in the replacement.
            </p>
            <div className="flex gap-2">
              <button
                onClick={rotate}
                type="button"
                disabled={phase === "rotating"}
                className="text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                style={{ background: "#1CB8B8", color: "white" }}
              >
                {phase === "rotating" ? "Rotating…" : "Rotate now"}
              </button>
              <button
                onClick={() => setConfirmRotate(false)}
                type="button"
                className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Revoke row */}
        {!confirmRevoke ? (
          <button
            onClick={() => { setConfirmRevoke(true); setConfirmRotate(false); setErrorMsg(""); }}
            type="button"
            disabled={phase === "revoking"}
            className="text-left flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.20)", color: "#fca5a5" }}
          >
            <span>Revoke key permanently</span>
            <span className="text-xs" style={{ color: "rgba(252,165,165,0.7)" }}>→</span>
          </button>
        ) : (
          <div className="rounded-xl p-4"
            style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <p className="text-sm font-semibold mb-1" style={{ color: "white" }}>Revoke permanently?</p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
              The key stops working immediately and we won&rsquo;t reissue it. To come back you&rsquo;ll need to
              request a new key via <code className="font-mono" style={{ color: "rgba(255,255,255,0.75)" }}>/developer</code>.
            </p>
            <div className="flex gap-2">
              <button
                onClick={revoke}
                type="button"
                disabled={phase === "revoking"}
                className="text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                style={{ background: "#ef4444", color: "white" }}
              >
                {phase === "revoking" ? "Revoking…" : "Revoke this key"}
              </button>
              <button
                onClick={() => setConfirmRevoke(false)}
                type="button"
                className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
