"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useChainId, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { SiweMessage } from "siwe";

type Method    = "email" | "wallet";
type EmailStep = "email" | "code";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── AuthCard ──────────────────────────────────────────────────────────────────
export function AuthCard() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");

  // ── Email state ──────────────────────────────────────────────────────────
  const [emailStep,    setEmailStep]    = useState<EmailStep>("email");
  const [email,        setEmail]        = useState("");
  const [code,         setCode]         = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError,   setEmailError]   = useState<string | null>(null);

  // ── Wallet state ─────────────────────────────────────────────────────────
  const { address, isConnected }      = useAccount();
  const chainId                       = useChainId();
  const { disconnect }                = useDisconnect();
  const { signMessageAsync }          = useSignMessage();
  const { connect, connectors }       = useConnect();

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector       = connectors.find((c) => c.id === "walletConnect");
  const [walletLoading,        setWalletLoading]        = useState(false);
  const [walletError,          setWalletError]          = useState<string | null>(null);
  const [showConnectorPicker,  setShowConnectorPicker]  = useState(false);

  // ── Email handlers ───────────────────────────────────────────────────────
  async function handleSendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", email }),
      });
      if (!res.ok) {
        let errMsg = "Failed to send code";
        try { const j = await res.json(); errMsg = j.error ?? errMsg; } catch {}
        setEmailError(errMsg);
        return;
      }
      setEmailStep("code");
    } catch {
      setEmailError("Network error. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleVerifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    setEmailError(null);
    setEmailLoading(true);
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", email, code }),
      });
      if (!res.ok) {
        let errMsg = "Invalid code";
        try { const j = await res.json(); errMsg = j.error ?? errMsg; } catch {}
        setEmailError(errMsg);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setEmailError("Network error. Please try again.");
    } finally {
      setEmailLoading(false);
    }
  }

  // ── Wallet / SIWE handler ────────────────────────────────────────────────
  async function handleWalletSignIn() {
    if (!address) return;
    setWalletError(null);
    setWalletLoading(true);
    try {
      // 1. Fetch nonce — check for errors before destructuring
      const nonceRes = await fetch("/api/auth/nonce");
      if (!nonceRes.ok) {
        let errMsg = "Failed to start sign-in. Please try again.";
        try { const j = await nonceRes.json(); errMsg = j.error ?? errMsg; } catch {}
        setWalletError(errMsg);
        return;
      }
      const { nonce } = await nonceRes.json();
      if (!nonce) {
        setWalletError("Failed to get sign-in nonce. Please try again.");
        return;
      }

      // 2. Build and sign SIWE message
      const message = new SiweMessage({
        domain:    window.location.host,
        address,
        statement: "Sign in to Vestream - read-only, no transactions.",
        uri:       window.location.origin,
        version:   "1",
        chainId,
        nonce,
      });
      const prepared  = message.prepareMessage();
      const signature = await signMessageAsync({ message: prepared });

      // 3. Verify on server
      const verifyRes = await fetch("/api/auth/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: prepared, signature }),
      });
      if (!verifyRes.ok) {
        let errMsg = "Verification failed. Please try again.";
        try {
          const j = await verifyRes.json();
          errMsg = j.error ?? errMsg;
        } catch {
          // Response wasn't JSON (e.g. HTML 500 from server) — use default message
        }
        setWalletError(errMsg);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      // Wagmi v2 wraps the provider error inside err.cause — check both levels
      const e    = err as { code?: number; message?: string; cause?: { code?: number; message?: string } };
      const code = e?.code ?? e?.cause?.code;
      const msg  = (e?.message ?? e?.cause?.message ?? "").toLowerCase();
      if (code === 4001 || msg.includes("rejected") || msg.includes("denied") || msg.includes("user rejected")) {
        setWalletError("Signature rejected. Please approve in your wallet.");
      } else if (msg.includes("network") || msg.includes("fetch")) {
        setWalletError("Network error. Please check your connection and try again.");
      } else {
        setWalletError("Sign-in failed. Please try again.");
      }
    } finally {
      setWalletLoading(false);
    }
  }

  // ── Shared button styles ─────────────────────────────────────────────────
  const primaryBtn: React.CSSProperties = {
    background: "linear-gradient(135deg, #2563eb, #7c3aed)",
    boxShadow:  "0 4px 16px rgba(37,99,235,0.25)",
  };

  const tabActive: React.CSSProperties = {
    color:        "#1d4ed8",
    background:   "#eff6ff",
    borderBottom: "2px solid #3b82f6",
  };

  const tabInactive: React.CSSProperties = {
    color:        "#9ca3af",
    background:   "transparent",
    borderBottom: "2px solid transparent",
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-white"
        style={{ border: "1px solid #e5e7eb", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

        {/* ── Method tabs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2" style={{ borderBottom: "1px solid #e5e7eb" }}>
          {([
            { id: "email",  label: "Email",  icon: "✉" },
            { id: "wallet", label: "Wallet", icon: "◈" },
          ] as { id: Method; label: string; icon: string }[]).map(({ id, label, icon }) => (
            <button key={id} onClick={() => { setMethod(id); setShowConnectorPicker(false); }}
              className="py-3.5 text-sm font-semibold transition-all duration-150"
              style={method === id ? tabActive : tabInactive}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="px-7 pt-6 pb-5">

          {/* ── Email ── */}
          {method === "email" && emailStep === "email" && (
            <form onSubmit={handleSendCode} className="flex flex-col gap-3">
              <p className="text-sm text-center text-gray-500 mb-1">
                Enter your email — we&apos;ll send a sign-in code.<br />
                <span className="text-xs text-gray-400">New users get a free account automatically.</span>
              </p>
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" width={14} height={14}
                  viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth={2} strokeLinecap="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                <input type="email" required autoFocus
                  placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none text-gray-900"
                  style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }} />
              </div>
              {emailError && <p className="text-xs text-red-500 text-center">{emailError}</p>}
              <button type="submit" disabled={emailLoading || !email}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 hover:brightness-110"
                style={primaryBtn}>
                {emailLoading ? "Sending…" : "Send sign-in code →"}
              </button>
            </form>
          )}

          {method === "email" && emailStep === "code" && (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
              <p className="text-sm text-center text-gray-500 mb-1">
                Code sent to{" "}
                <span className="font-semibold text-gray-800">{email}</span>
              </p>
              <input type="text" required autoFocus inputMode="numeric"
                placeholder="● ● ● ● ● ●" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full px-4 py-3.5 rounded-xl text-center tracking-[0.4em] font-mono outline-none text-gray-900"
                style={{ background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: "1.3rem" }} />
              {emailError && <p className="text-xs text-red-500 text-center">{emailError}</p>}
              <button type="submit" disabled={emailLoading || code.length < 6}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 hover:brightness-110"
                style={primaryBtn}>
                {emailLoading ? "Signing in…" : "Verify code →"}
              </button>
              <button type="button"
                onClick={() => { setEmailStep("email"); setCode(""); setEmailError(null); }}
                className="text-xs text-center mt-1 text-gray-400 hover:text-gray-600">
                ← Use a different email
              </button>
            </form>
          )}

          {/* ── Wallet ── */}
          {method === "wallet" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-center text-gray-500 mb-1">
                Connect your wallet and sign a message to authenticate.
                <br />
                <span className="text-xs text-gray-400">Read-only — no transactions, no funds access.</span>
              </p>

              {!isConnected ? (
                !showConnectorPicker ? (
                  <button
                    onClick={() => setShowConnectorPicker(true)}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-gray-800 transition-all duration-150 hover:bg-gray-100 flex items-center justify-center gap-2"
                    style={{ background: "#f3f4f6", border: "1px solid #e5e7eb" }}>
                    <span className="text-base">◈</span> Connect Wallet
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl p-3" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                    <p className="text-[11px] text-center text-gray-400 mb-0.5">Choose a wallet</p>

                    {/* MetaMask / Browser wallet */}
                    {injectedConnector && (
                      <button
                        onClick={() => { connect({ connector: injectedConnector }); setShowConnectorPicker(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-colors"
                        style={{ border: "1px solid #e5e7eb" }}>
                        {/* MetaMask fox icon */}
                        <svg width={20} height={20} viewBox="0 0 318.6 318.6" className="flex-shrink-0">
                          <polygon fill="#e2761b" stroke="#e2761b" strokeLinecap="round" strokeLinejoin="round" points="274.1,35.5 174.6,109.4 193,65.8"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="44.4,35.5 143.1,110.1 125.6,65.8"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="214.9,138.2 175.9,103.4 174.6,164.6 230.8,162.1"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="106.8,247.4 140.6,230.9 111.4,208.1"/>
                          <polygon fill="#e4761b" stroke="#e4761b" strokeLinecap="round" strokeLinejoin="round" points="177.9,230.9 211.8,247.4 207.1,208.1"/>
                        </svg>
                        <span className="flex-1 text-left">MetaMask / Browser Wallet</span>
                        <span className="text-xs text-gray-400">→</span>
                      </button>
                    )}

                    {/* WalletConnect */}
                    {wcConnector && (
                      <button
                        onClick={() => { connect({ connector: wcConnector }); setShowConnectorPicker(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-colors"
                        style={{ border: "1px solid #e5e7eb" }}>
                        {/* WalletConnect icon */}
                        <svg width={20} height={20} viewBox="0 0 300 185" fill="none" className="flex-shrink-0">
                          <path d="M61.4385 36.2562C107.932 -10.237 182.917 -10.237 229.41 36.2562L234.932 41.7785C237.178 44.0246 237.178 47.6895 234.932 49.9356L215.616 69.2518C214.493 70.3748 212.66 70.3748 211.537 69.2518L203.888 61.6026C171.496 29.2108 119.353 29.2108 86.9612 61.6026L78.7504 69.8134C77.6274 70.9364 75.7942 70.9364 74.6712 69.8134L55.3551 50.4973C53.109 48.2512 53.109 44.5862 55.3551 42.3401L61.4385 36.2562ZM269.021 75.8678L286.274 93.121C288.52 95.3671 288.52 99.032 286.274 101.278L210.565 176.987C208.319 179.233 204.654 179.233 202.408 176.987L148.687 123.266C148.125 122.704 147.209 122.704 146.647 123.266L92.9255 176.987C90.6793 179.233 87.0144 179.233 84.7682 176.987L9.05997 101.278C6.81382 99.032 6.81382 95.3671 9.05997 93.121L26.3131 75.8678C28.5592 73.6217 32.2242 73.6217 34.4703 75.8678L88.1919 129.589C88.7538 130.151 89.6694 130.151 90.2314 129.589L143.953 75.8678C146.199 73.6217 149.864 73.6217 152.11 75.8678L205.832 129.589C206.393 130.151 207.309 130.151 207.871 129.589L261.593 75.8678C263.839 73.6217 267.504 73.6217 269.021 75.8678Z" fill="#3B99FC"/>
                        </svg>
                        <span className="flex-1 text-left">WalletConnect</span>
                        <span className="text-xs text-gray-400">→</span>
                      </button>
                    )}

                    <button
                      onClick={() => setShowConnectorPicker(false)}
                      className="text-xs text-center mt-1 text-gray-400 hover:text-gray-600">
                      Cancel
                    </button>
                  </div>
                )
              ) : (
                <>
                  {/* Connected address chip */}
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                    style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
                    <span className="text-xs font-mono flex-1 truncate text-gray-700">
                      {shortAddr(address!)}
                    </span>
                    <button onClick={() => { disconnect(); setShowConnectorPicker(false); }}
                      className="text-[10px] font-medium text-gray-400 hover:text-gray-600">
                      change
                    </button>
                  </div>

                  {walletError && <p className="text-xs text-red-500 text-center">{walletError}</p>}

                  <button onClick={handleWalletSignIn} disabled={walletLoading}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 hover:brightness-110"
                    style={primaryBtn}>
                    {walletLoading ? "Waiting for signature…" : "Sign in with Wallet →"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer note ───────────────────────────────────────────────── */}
        <div className="px-7 pb-5 text-center">
          <p className="text-[11px] text-gray-400">
            No credit card required · free account on sign-up · upgrade anytime
          </p>
        </div>
    </div>
  );
}
