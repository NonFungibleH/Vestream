// Per-token Open Graph image – 1200×630, generated at request time per
// (chainId, address). Pulls live overview from the streams cache so a fresh
// share preview shows: symbol, chain, locked tokens, protocol count, and a
// 30-day unlock-pressure hint. Falls back to a generic Vestream card if the
// token isn't indexed yet or the DB call blips – never let a fetch failure
// break a share preview.
//
// Why per-token OG (the highest-volume surface): we serve thousands of token
// URLs; without per-token cards every share preview looks identical. A
// branded card showing $TOKEN + locked amount lifts CTR from Twitter, Discord,
// and Google's social-graph fallback.

import { ImageResponse } from "next/og";
import { CHAIN_NAMES } from "@/lib/vesting/types";
import { getTokenOverview, getTokenMarketData } from "@/lib/vesting/token-aggregates";
import { getProtocol } from "@/lib/protocol-constants";

export const runtime     = "nodejs";
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

function compactNumber(n: number): string {
  if (!isFinite(n) || n <= 0) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function compactUsd(n: number | null): string | null {
  if (n == null || !isFinite(n) || n <= 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function truncate(addr: string | null | undefined): string {
  if (!addr || addr.length < 10) return addr ?? "–";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export async function generateImageMetadata({
  params,
}: { params: Promise<{ chainId: string; address: string }> }) {
  const { chainId, address } = await params;
  const cid = Number(chainId);
  const chain = (CHAIN_NAMES as Record<number, string>)[cid] ?? "Unknown chain";
  return [
    {
      id:          "og",
      contentType: "image/png",
      size,
      alt:         `Token unlock tracker for ${truncate(address)} on ${chain} – Vestream`,
    },
  ];
}

export default async function OG(
  { params }: { params: Promise<{ chainId: string; address: string }> },
) {
  const { chainId, address } = await params;
  const cid  = Number(chainId);
  const addr = address.toLowerCase();
  const chain = (CHAIN_NAMES as Record<number, string>)[cid];

  // Bail to generic card on invalid chain – keeps share fetcher happy
  // while the page itself 404s.
  if (!chain) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F3", fontSize: 64, fontWeight: 800, color: "#1A1D20", fontFamily: "system-ui" }}>
          Vestream
        </div>
      ),
      { ...size },
    );
  }

  // Live stats – fail-soft to a minimal card if either DB or DexScreener errors
  const [overviewRes, marketRes] = await Promise.allSettled([
    getTokenOverview(cid, addr),
    getTokenMarketData(cid, addr),
  ]);
  const overview = overviewRes.status === "fulfilled" ? overviewRes.value : null;
  const market   = marketRes.status   === "fulfilled" ? marketRes.value   : null;

  const symbol  = market?.tokenName || overview?.tokenSymbol || truncate(addr);
  const locked  = overview ? compactNumber(overview.lockedTokensWhole) : "0";
  const protoCount = overview?.protocolMix.length ?? 0;
  const upcoming30 = overview?.upcoming30dTokens ?? 0;
  const upcomingUsd = market?.priceUsd && upcoming30 > 0 ? upcoming30 * market.priceUsd : null;
  const lockedUsd   = market?.priceUsd && overview ? overview.lockedTokensWhole * market.priceUsd : null;

  // Top protocol gets to colour the accent
  const topProto = overview?.protocolMix[0]?.protocol;
  const accent   = (topProto ? getProtocol(topProto)?.color : null) ?? "#1CB8B8";

  // Initial = first non-address char of the symbol
  const initial = (symbol[0] || "?").toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width:           "100%",
          height:          "100%",
          display:         "flex",
          flexDirection:   "column",
          background:      "#F5F5F3",
          padding:         "72px 88px",
          fontFamily:      "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          position:        "relative",
        }}
      >
        {/* Brand-accent halo */}
        <div
          style={{
            position: "absolute",
            top:      -140,
            right:    -140,
            width:    480,
            height:   480,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accent}26 0%, transparent 70%)`,
          }}
        />

        {/* Header – Vestream wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ width: 44, height: 6, background: "#1A1D20", opacity: 0.35, borderRadius: 2 }} />
            <div style={{ width: 44, height: 6, background: "#1A1D20", opacity: 0.65, borderRadius: 2 }} />
            <div style={{ width: 44, height: 6, background: "#1CB8B8", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#1A1D20", letterSpacing: "-0.02em" }}>
            Vestream
          </span>
          <span style={{ fontSize: 22, color: "#B8BABD", marginLeft: 8 }}>
            · Token unlock tracker
          </span>
        </div>

        {/* Body – token symbol badge + name + chain */}
        <div style={{ display: "flex", alignItems: "center", gap: 36, flex: 1 }}>
          <div
            style={{
              width:         180,
              height:        180,
              borderRadius:  32,
              background:    `${accent}1F`,
              border:        `2px solid ${accent}66`,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              fontSize:      96,
              fontWeight:    800,
              color:         accent,
              flexShrink:    0,
            }}
          >
            {initial}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <span
              style={{
                fontSize:      88,
                fontWeight:    800,
                color:         "#1A1D20",
                letterSpacing: "-0.03em",
                lineHeight:    1.0,
              }}
            >
              ${symbol}
            </span>
            <span style={{ fontSize: 28, color: "#475569", lineHeight: 1.35 }}>
              {lockedUsd
                ? `${compactUsd(lockedUsd)} locked across ${protoCount} protocol${protoCount === 1 ? "" : "s"} · ${chain}`
                : overview
                  ? `${locked} ${symbol} locked across ${protoCount} protocol${protoCount === 1 ? "" : "s"} · ${chain}`
                  : `Vesting tracker · ${chain}`}
            </span>
          </div>
        </div>

        {/* Footer – upcoming pill + URL */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 24 }}>
          {upcomingUsd || upcoming30 > 0 ? (
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      "10px 20px",
                borderRadius: 999,
                background:   `${accent}14`,
                border:       `1px solid ${accent}40`,
                color:        accent,
                fontSize:     22,
                fontWeight:   600,
              }}
            >
              <span style={{ width: 10, height: 10, background: accent, borderRadius: "50%" }} />
              {upcomingUsd
                ? `${compactUsd(upcomingUsd)} unlocking next 30 days`
                : `${compactNumber(upcoming30)} ${symbol} unlocking next 30 days`}
            </div>
          ) : (
            <div
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      "10px 20px",
                borderRadius: 999,
                background:   `${accent}14`,
                border:       `1px solid ${accent}40`,
                color:        accent,
                fontSize:     22,
                fontWeight:   600,
              }}
            >
              <span style={{ width: 10, height: 10, background: accent, borderRadius: "50%" }} />
              Live unlock tracker
            </div>
          )}
          <span style={{ fontSize: 22, color: "#8B8E92" }}>
            vestream.io/token/{cid}/{truncate(addr)}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
