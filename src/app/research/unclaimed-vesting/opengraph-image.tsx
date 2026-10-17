// Unclaimed-vesting study Open Graph image – 1200×630, static.
// The share preview for vestream.io/research/unclaimed-vesting, the page that
// external articles and posts link to. Every figure comes from
// lib/unclaimed-research.ts, the same source as the page, the CSV and the
// protocol pages, so the card can't disagree with them.

import { ImageResponse } from "next/og";
import { VestreamMark } from "@/lib/og/vestream-mark";
import { UNCLAIMED_SUMMARY } from "@/lib/unclaimed-research";

export const runtime  = "edge";
export const alt      = "Vestream research: unclaimed token vesting across 8 protocols, October 2026";
export const size     = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK   = "#1A1D20";
const INK_2 = "#475569";
const GREY  = "#8B8E92";
const LINE  = "#D5D8DC";
const TEAL  = "#0F8A8A";

// The rate published for each protocol: the adjusted rate where removing a
// dominant mass distribution LOWERS it (Sablier, UNCX, Team Finance), else the
// raw rate. This is the same table the articles and Figure 3 use.
const ROWS = UNCLAIMED_SUMMARY
  .map((r) => ({
    name: r.protocol,
    pct: r.unclaimedPctAdj && r.unclaimedPctAdj.pct < r.unclaimedPct ? r.unclaimedPctAdj.pct : r.unclaimedPct,
  }))
  .sort((a, b) => a.pct - b.pct);

// Upper end of the valued range, summed across protocols ("up to $9.5M").
const VALUE_HIGH_M = UNCLAIMED_SUMMARY.reduce((s, r) => s + (r.valueUsd?.high ?? 0), 0) / 1_000_000;

const BAR_W = 170;

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width:         "100%",
          height:        "100%",
          display:       "flex",
          flexDirection: "column",
          background:    "#F5F5F3",
          padding:       "56px 72px",
          fontFamily:    "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        {/* Wordmark + eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <VestreamMark width={44} />
          <span style={{ fontSize: 28, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>Vestream</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: TEAL, letterSpacing: "0.12em", marginLeft: 12 }}>
            RESEARCH · OCTOBER 2026
          </span>
        </div>

        <div style={{ display: "flex", flex: 1, marginTop: 36, gap: 56 }}>
          {/* Left: headline + two stats */}
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <span style={{ fontSize: 64, fontWeight: 800, color: INK, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Unlocked.
            </span>
            <span style={{ fontSize: 64, fontWeight: 800, color: TEAL, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              Never claimed.
            </span>
            <span style={{ fontSize: 24, color: INK_2, lineHeight: 1.35, marginTop: 18 }}>
              What happens to vested tokens after they unlock, from 1.28 million finished schedules read on‑chain.
            </span>

            <div style={{ display: "flex", gap: 30, marginTop: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", width: 300 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>Nearly 9 in 10</span>
                <span style={{ fontSize: 19, color: INK_2, lineHeight: 1.3 }}>
                  unclaimed schedules were never claimed even once
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", width: 230 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: INK, letterSpacing: "-0.02em" }}>
                  {`Up to $${VALUE_HIGH_M.toFixed(1)}M`}
                </span>
                <span style={{ fontSize: 19, color: INK_2, lineHeight: 1.3 }}>
                  still unclaimed in tokens that still trade
                </span>
              </div>
            </div>
          </div>

          {/* Right: unclaimed share by protocol, to scale on 0–100% */}
          <div
            style={{
              display:       "flex",
              flexDirection: "column",
              flex:          1,
              background:    "white",
              border:        `1px solid ${LINE}`,
              borderRadius:  16,
              padding:       "24px 28px",
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 600, color: INK, marginBottom: 14 }}>
              Finished schedules still unclaimed
            </span>
            {ROWS.map((r) => (
              <div key={r.name} style={{ display: "flex", alignItems: "center", height: 40 }}>
                <span style={{ width: 128, flexShrink: 0, fontSize: 17, color: INK }}>{r.name}</span>
                <div style={{ display: "flex", flexShrink: 0, width: BAR_W, height: 16, background: "#EEF0F2", borderRadius: 4 }}>
                  <div style={{ width: Math.round((BAR_W * r.pct) / 100), height: 16, background: TEAL, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 17, fontWeight: 600, color: INK, marginLeft: 12 }}>{`${r.pct.toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
          <span style={{ fontSize: 18, color: GREY }}>8 protocols · Ethereum, other EVM chains and Solana</span>
          <span style={{ fontSize: 18, color: GREY }}>vestream.io/research/unclaimed-vesting</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
