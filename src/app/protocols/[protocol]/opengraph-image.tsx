// Per-protocol Open Graph image — 1200×630, generated at request time per
// {protocol} slug. Pulls live stream count and TVL from the snapshot table
// so a fresh share preview reflects current data, not the build-time
// snapshot. Falls back gracefully to placeholder values if the DB call
// fails — never let a snapshot outage break a share preview.
//
// Why per-protocol OG instead of a single site-wide one for these pages:
// the share preview is the only thing many people see on Twitter/Discord
// before deciding to click. A protocol-branded card with live numbers
// converts measurably better than a generic Vestream card.

import { ImageResponse } from "next/og";
import { getProtocol } from "@/lib/protocol-constants";
import { getProtocolStats } from "@/lib/vesting/protocol-stats";

// Runtime: nodejs (NOT edge) — required because the parent page exports
// generateStaticParams to pre-render every protocol slug at build time, and
// Next.js inherits that contract for the opengraph-image route under the same
// dynamic segment. Edge runtime + generateStaticParams is incompatible (the
// build fails with "Edge runtime is not supported with `generateStaticParams`").
// Node runtime here is fine: Drizzle/Supabase reads work natively, social
// platforms cache OG images aggressively so per-request latency rarely matters,
// and the image is regenerated only when the protocol slug changes.
export const runtime  = "nodejs";
export const size     = { width: 1200, height: 630 };
export const contentType = "image/png";

function compactUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// `generateImageMetadata` lets us set a per-protocol alt-text. Each entry's
// `id` becomes the last URL segment (`/opengraph-image/{id}`), so we use a
// stable id ("og") rather than the slug — Next.js takes care of routing the
// request to the matching protocol via the `params` we receive.
export async function generateImageMetadata({
  params,
}: { params: Promise<{ protocol: string }> }) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  return [
    {
      id:          "og",
      contentType: "image/png",
      size,
      alt:         meta ? `${meta.name} unlock tracker — Vestream` : "Vestream",
    },
  ];
}

export default async function OG(
  { params }: { params: Promise<{ protocol: string }> },
) {
  const { protocol } = await params;
  const meta = getProtocol(protocol);
  if (!meta) {
    // Fall back to a generic Vestream card for unknown slugs (Next.js
    // would normally 404 the page itself; the OG fetcher might still
    // hit this for a moment during deploys).
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F3", fontSize: 64, fontWeight: 800, color: "#1A1D20", fontFamily: "system-ui" }}>
          Vestream
        </div>
      ),
      { ...size },
    );
  }

  // Live stats — fail-soft to "—" if DB is unreachable
  let totalStreams = 0;
  try {
    const stats = await getProtocolStats(meta.adapterIds);
    totalStreams = stats?.totalStreams ?? 0;
  } catch {
    /* swallow — share preview still useful without the live count */
  }

  const initial = meta.name.charAt(0);

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
        {/* Brand-coloured halo top-right */}
        <div
          style={{
            position: "absolute",
            top:      -140,
            right:    -140,
            width:    480,
            height:   480,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${meta.color}26 0%, transparent 70%)`,
          }}
        />

        {/* Header — Vestream wordmark */}
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

        {/* Body — protocol initial badge + name + tagline */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            gap:            36,
            flex:           1,
          }}
        >
          {/* Brand-coloured square initial */}
          <div
            style={{
              width:         180,
              height:        180,
              borderRadius:  32,
              background:    `${meta.color}1F`,
              border:        `2px solid ${meta.color}66`,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              fontSize:      96,
              fontWeight:    800,
              color:         meta.color,
              flexShrink:    0,
            }}
          >
            {initial}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <span
              style={{
                fontSize:      80,
                fontWeight:    800,
                color:         "#1A1D20",
                letterSpacing: "-0.03em",
                lineHeight:    1.0,
              }}
            >
              {meta.name}
            </span>
            <span
              style={{
                fontSize:      28,
                color:         "#475569",
                lineHeight:    1.35,
                maxWidth:      750,
              }}
            >
              {meta.tagline}
            </span>
          </div>
        </div>

        {/* Footer — live stats pill + URL */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 24 }}>
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              padding:      "10px 20px",
              borderRadius: 999,
              background:   `${meta.color}14`,
              border:       `1px solid ${meta.color}40`,
              color:        meta.color,
              fontSize:     22,
              fontWeight:   600,
            }}
          >
            <span style={{ width: 10, height: 10, background: meta.color, borderRadius: "50%" }} />
            {totalStreams > 0
              ? `${totalStreams.toLocaleString()} streams indexed`
              : "Live indexing"}
          </div>
          <span style={{ fontSize: 22, color: "#8B8E92" }}>
            vestream.io/protocols/{meta.slug}
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}

