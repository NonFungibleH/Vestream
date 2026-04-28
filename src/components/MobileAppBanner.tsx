"use client";

// MobileAppBanner — dismissible card on the dashboard pointing users at the
// iOS app. Clicking opens GetTheAppModal which mints a single-use handoff
// token, so the app launches already signed-in.
//
// Doubles as the "two-surface mental model" affordance (Fix 5): explicitly
// frames mobile as the alerts surface, web as research/discovery, so users
// don't feel like the split is friction — they feel like there's "another
// half of the product" waiting on their phone.

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
          background: "rgba(28,184,184,0.07)",
          border: "1px solid rgba(28,184,184,0.15)",
          borderRadius: "12px",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(96,165,250,0.9)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden="true"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>

        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
          Get push alerts for every unlock — sign in to the app with one tap
        </span>

        <button
          type="button"
          onClick={openModal}
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "#1CB8B8",
            whiteSpace: "nowrap",
            textDecoration: "none",
            flexShrink: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Get the app →
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "rgba(255,255,255,0.35)",
            flexShrink: 0,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <GetTheAppModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
