"use client";

// GetTheAppModal
// ─────────────────────────────────────────────────────────────────────────────
// "Get the app" modal – the user-facing half of the magic-link auth bridge.
// Logged-in web user clicks → we mint a single-use handoff token →
//   - desktop: render a QR code; user scans with iPhone camera; iOS opens
//     Safari → Universal Link → app launches → app deep-link handler trades
//     the handoff for a regular bearer → user is in the app, signed-in.
//   - mobile (already on iPhone Safari): a tap-to-open button that fires the
//     same deep link directly. Falls back to the App Store if the app isn't
//     installed (handled by Apple's Universal Links / Smart App Banner).
//
// Why a 5-minute single-use token instead of long-lived: a stolen QR is
// useless after 5 min, and even within the window a single replay locks the
// attacker out. The cookie that authorised this mint can be invalidated
// without affecting any handoff already redeemed (handoffs become regular
// bearers immediately on consume).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { track } from "@/lib/analytics";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GetTheAppModal({ open, onClose }: Props) {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);

  const mintHandoff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mobile-handoff", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Server returned ${res.status}`);
      }
      const data = await res.json() as { deepLink: string };
      setDeepLink(data.deepLink);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate handoff link");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fresh handoff on every open – old token may have expired (5-min TTL)
  // and a new modal session always deserves a new token.
  useEffect(() => {
    if (!open) { setDeepLink(null); setError(null); setCopied(false); return; }
    track("cta_clicked", { cta_id: "get_the_app_open" });
    mintHandoff();
  }, [open, mintHandoff]);

  if (!open) return null;

  const isMobileBrowser = typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="get-app-title"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: "white", borderRadius: 22, padding: "32px 28px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          color: "#1A1D20",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 id="get-app-title" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            Get the Vestream app
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 24, lineHeight: 1, color: "#94a3b8", padding: 0,
            }}
          >×</button>
        </div>
        <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.55, marginBottom: 24 }}>
          {isMobileBrowser
            ? "Tap below to open the app, signed in and ready."
            : "Scan with your iPhone camera. The app opens already signed in – no second OTP."}
        </p>

        {loading && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            Generating your secure link…
          </div>
        )}

        {error && (
          <div style={{
            padding: 14, borderRadius: 12, fontSize: 13,
            background: "rgba(179,50,46,0.08)", color: "#B3322E",
            border: "1px solid rgba(179,50,46,0.2)",
          }}>
            {error}
            <button
              onClick={mintHandoff}
              style={{
                marginLeft: 8, fontSize: 13, color: "#B3322E",
                background: "transparent", border: "none", cursor: "pointer",
                fontWeight: 600, textDecoration: "underline",
              }}
            >Try again</button>
          </div>
        )}

        {deepLink && !loading && !error && (
          <>
            {!isMobileBrowser && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <div style={{
                  padding: 14, borderRadius: 14, background: "white",
                  border: "1px solid rgba(0,0,0,0.08)",
                }}>
                  <QRCodeSVG value={deepLink} size={196} level="H" imageSettings={{ src: "/logo-icon.svg", height: 40, width: 40, excavate: true }} />
                </div>
              </div>
            )}

            {isMobileBrowser && (
              <a
                href={deepLink}
                onClick={() => track("cta_clicked", { cta_id: "get_the_app_taplink" })}
                style={{
                  display: "block", width: "100%", textAlign: "center",
                  padding: "14px 20px", borderRadius: 14,
                  background: "#1CB8B8", color: "white",
                  fontSize: 15, fontWeight: 700, textDecoration: "none",
                  boxShadow: "0 4px 16px rgba(28,184,184,0.35)",
                  marginBottom: 12,
                }}
              >
                Open Vestream →
              </a>
            )}

            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(deepLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* swallow */ }
              }}
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 12,
                background: "rgba(28,184,184,0.08)", color: "#0F8A8A",
                border: "1px solid rgba(28,184,184,0.2)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>

            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16, textAlign: "center", lineHeight: 1.5 }}>
              Link expires in 5 minutes. Single-use – anyone with this link can sign in to your account once.
            </p>
          </>
        )}

        <div style={{
          marginTop: 24, paddingTop: 20,
          borderTop: "1px solid rgba(0,0,0,0.06)",
          display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap",
        }}>
          {/* App Store badge – opens to install if not yet installed.
              We use Apple's apps.apple.com link which Universal Links
              upgrade to "open in app" if installed. */}
          <a
            href="https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("cta_clicked", { cta_id: "get_the_app_appstore" })}
            style={{ fontSize: 13, color: "#0F8A8A", fontWeight: 600 }}
          >
            App Store →
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=io.vestream.app"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("cta_clicked", { cta_id: "get_the_app_playstore" })}
            style={{ fontSize: 13, color: "#0F8A8A", fontWeight: 600 }}
          >
            Google Play →
          </a>
        </div>
      </div>
    </div>
  );
}
