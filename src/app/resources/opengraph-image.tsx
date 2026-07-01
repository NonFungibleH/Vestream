// Resources index Open Graph image – 1200×630, static.
// Used as the share preview for vestream.io/resources.
// Edge runtime is fine here – no generateStaticParams or DB calls.

import { ImageResponse } from "next/og";

export const runtime  = "edge";
export const alt      = "Vestream Resources – Token Vesting Guides & Insights";
export const size     = { width: 1200, height: 630 };
export const contentType = "image/png";

const CATEGORY_DOTS = [
  { label: "Fundamentals",      color: "#3b82f6" },
  { label: "Tokenomics",        color: "#0F8A8A" },
  { label: "Guides",            color: "#2DB36A" },
  { label: "Market Analysis",   color: "#F0992E" },
  { label: "Research",          color: "#E063A0" },
];

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
        {/* Teal accent halo top-right */}
        <div
          style={{
            position:     "absolute",
            top:          -120,
            right:        -120,
            width:        420,
            height:       420,
            borderRadius: "50%",
            background:   "radial-gradient(circle, rgba(28,184,184,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
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
            display:        "flex",
            flexDirection:  "column",
            gap:            20,
            flex:           1,
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize:      84,
              fontWeight:    800,
              color:         "#1A1D20",
              letterSpacing: "-0.03em",
              lineHeight:    1.05,
            }}
          >
            Resources
          </span>
          <span
            style={{
              fontSize:   30,
              color:      "#475569",
              lineHeight: 1.4,
              maxWidth:   800,
            }}
          >
            Token vesting guides, tokenomics deep-dives, and unlock analysis for investors and project teams.
          </span>
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {CATEGORY_DOTS.map(({ label, color }) => (
            <div
              key={label}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                padding:      "8px 18px",
                borderRadius: 999,
                background:   `${color}14`,
                border:       `1px solid ${color}40`,
                color:        color,
                fontSize:     20,
                fontWeight:   600,
              }}
            >
              <span style={{ width: 8, height: 8, background: color, borderRadius: "50%" }} />
              {label}
            </div>
          ))}
          <span style={{ fontSize: 22, color: "#8B8E92", marginLeft: 4 }}>vestream.io/resources</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
