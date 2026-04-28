"use client";

// MobileAppBanner — dismissible card on the dashboard pointing users at the
// iOS app. Clicking opens GetTheAppModal which mints a single-use handoff
// token, so the app launches already signed-in.
//
// Doubles as the "two-surface mental model" affordance: explicitly frames
// mobile as the alerts surface, web as research/discovery, so users don't
// feel like the split is friction — they feel like there's "another half
// of the product" waiting on their phone.
//
// Visual: solid teal gradient with white text + a phone glyph in a frosted
// pill on the left. The previous low-contrast version (rgba(28,184,184,0.07)
// background + 75% white text) read as decorative chrome that users
// scrolled past — this version reads as a clear secondary action.

import { useState, useEffect } from "react";
import { GetTheAppModal } from "./GetTheAppModal";
import { track } from "@/lib/analytics";

const STORAGE_KEY = "mobile_banner_dismissed";

export function MobileAppBanner() {
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
    track("cta_clicked", { cta_id: "mobile_app_banner_dismiss" });
  }

  function openModal() {
    setModalOpen(true);
  }

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          // Solid brand gradient — reads on both light and dark dashboard
          // surfaces. White text + frosted pill icon = high contrast in
          // every theme without theme-conditional colour logic.
          background: "linear-gradient(135deg, #1CB8B8 0%, #0F8A8A 100%)",
          borderRadius: "14px",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "16px",
          boxShadow: "0 4px 16px rgba(28,184,184,0.28)",
        }}
      >
        {/* Phone glyph — frosted-glass pill on the gradient */}
        <div
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "white", lineHeight: 1.3, marginBottom: 2 }}>
            Get push alerts for every unlock
          </div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.82)", lineHeight: 1.35 }}>
            Sign in to the iOS app with one tap — no second OTP.
          </div>
        </div>

        <button
          type="button"
          onClick={openModal}
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#0F8A8A",
            whiteSpace: "nowrap",
            flexShrink: 0,
            background: "white",
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}
        >
          Get the app →
        </button>

        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 8,
            border: "none",
            background: "rgba(255,255,255,0.16)",
            cursor: "pointer",
            color: "rgba(255,255,255,0.85)",
            flexShrink: 0,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.16)")}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <GetTheAppModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
