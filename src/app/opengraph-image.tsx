// Site-default Open Graph image — 1200×630 generated from JSX via next/og.
// Used as the share preview anywhere we don't override with a per-route
// opengraph-image.tsx (see src/app/protocols/[protocol]/opengraph-image.tsx
// for the dynamic per-protocol variant).
//
// Design choices:
//   - Warm-paper background (#F5F5F3) matches the homepage hero
//   - Single-line headline so the image reads at thumbnail sizes (320px
//     wide is common in WhatsApp / iMessage previews)
//   - Teal pill chip for the value-prop — same component family used
//     on /protocols cards so the visual language carries through
//   - System-stack typography (no custom font load) to keep cold-build
//     edge time predictable

import { ImageResponse } from "next/og";

export const runtime  = "edge";
export const alt      = "Vestream — Free Token Vesting Tracker for 9 Protocols";
export const size     = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width:           "100%",
          height:          "100%",
          display:         "flex",
          flexDirection:   "column",
          background:      "#F5F5F3",
          padding:         "80px 96px",
          fontFamily:      "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          position:        "relative",
        }}
      >
        {/* Subtle teal accent halo top-right */}
        <div
          style={{
            position: "absolute",
            top:      -120,
            right:    -120,
            width:    420,
            height:   420,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(28,184,184,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          {/* V-mark slabs (matches /public/logo-icon.svg) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ width: 56, height: 8, background: "#1A1D20", opacity: 0.35, borderRadius: 2 }} />
            <div style={{ width: 56, height: 8, background: "#1A1D20", opacity: 0.65, borderRadius: 2 }} />
            <div style={{ width: 56, height: 8, background: "#1CB8B8", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 40, fontWeight: 800, color: "#1A1D20", letterSpacing: "-0.02em" }}>
            Vestream
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           20,
            flex:          1,
            justifyContent:"center",
          }}
        >
          <span
            style={{
              fontSize:      88,
              fontWeight:    800,
              color:         "#1A1D20",
              letterSpacing: "-0.03em",
              lineHeight:    1.05,
              maxWidth:      900,
            }}
          >
            Track every token unlock.
          </span>
          <span
            style={{
              fontSize:      32,
              color:         "#475569",
              maxWidth:      900,
              lineHeight:    1.4,
            }}
          >
            Across Sablier, Hedgey, UNCX, Streamflow + 5 more protocols. Free, no signup.
          </span>
        </div>

        {/* Footer pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              padding:      "10px 20px",
              borderRadius: 999,
              background:   "rgba(28,184,184,0.10)",
              border:       "1px solid rgba(28,184,184,0.25)",
              color:        "#0F8A8A",
              fontSize:     22,
              fontWeight:   600,
            }}
          >
            <span style={{ width: 10, height: 10, background: "#0F8A8A", borderRadius: "50%" }} />
            9 protocols · 5 chains · Live indexing
          </div>
          <span style={{ fontSize: 22, color: "#8B8E92" }}>vestream.io</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
