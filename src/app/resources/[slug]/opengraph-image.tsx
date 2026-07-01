// Per-article Open Graph image – 1200×630, generated per slug at build time
// via generateStaticParams. Same visual language as the protocol OG image:
// warm-paper background, Vestream wordmark, category-coloured accent.
//
// nodejs runtime required because the parent page exports generateStaticParams
// (Edge runtime + generateStaticParams is incompatible in Next.js).

import { ImageResponse } from "next/og";
import { getArticle, getAllArticles } from "@/lib/articles";

export const runtime  = "nodejs";
export const size     = { width: 1200, height: 630 };
export const contentType = "image/png";

const CATEGORY_COLORS: Record<string, string> = {
  Fundamentals:      "#3b82f6",
  Tokenomics:        "#0F8A8A",
  Guides:            "#2DB36A",
  "Market Analysis": "#F0992E",
  Research:          "#E063A0",
};

export function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateImageMetadata({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  return [
    {
      id:          "og",
      contentType: "image/png",
      size,
      alt: article ? `${article.title} – Vestream Resources` : "Vestream Resources",
    },
  ];
}

export default async function OG(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F5F3", fontSize: 64, fontWeight: 800, color: "#1A1D20", fontFamily: "system-ui" }}>
          Vestream Resources
        </div>
      ),
      { ...size },
    );
  }

  const accentColor = CATEGORY_COLORS[article.category] ?? "#1CB8B8";

  // Truncate title at ~72 chars so it wraps cleanly at OG thumbnail sizes
  const title = article.title.length > 80
    ? article.title.slice(0, 77) + "…"
    : article.title;

  // Truncate excerpt so it fits in 2 lines at font-size 28
  const excerpt = article.excerpt.length > 120
    ? article.excerpt.slice(0, 117) + "…"
    : article.excerpt;

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
        {/* Accent-coloured halo top-right */}
        <div
          style={{
            position:     "absolute",
            top:          -140,
            right:        -140,
            width:        480,
            height:       480,
            borderRadius: "50%",
            background:   `radial-gradient(circle, ${accentColor}26 0%, transparent 70%)`,
          }}
        />

        {/* Vestream wordmark */}
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
            · Resources
          </span>
        </div>

        {/* Category badge */}
        <div
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            padding:      "6px 16px",
            borderRadius: 999,
            background:   `${accentColor}14`,
            border:       `1px solid ${accentColor}40`,
            color:        accentColor,
            fontSize:     18,
            fontWeight:   700,
            width:        "fit-content",
            marginBottom: 20,
          }}
        >
          {article.category}
        </div>

        {/* Article title */}
        <div
          style={{
            flex:          1,
            display:       "flex",
            flexDirection: "column",
            justifyContent:"center",
            gap:           16,
          }}
        >
          <span
            style={{
              fontSize:      68,
              fontWeight:    800,
              color:         "#1A1D20",
              letterSpacing: "-0.03em",
              lineHeight:    1.1,
              maxWidth:      1020,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize:  26,
              color:     "#475569",
              lineHeight: 1.4,
              maxWidth:  920,
            }}
          >
            {excerpt}
          </span>
        </div>

        {/* Footer – reading time + URL */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 24 }}>
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              padding:      "10px 20px",
              borderRadius: 999,
              background:   `${accentColor}14`,
              border:       `1px solid ${accentColor}40`,
              color:        accentColor,
              fontSize:     22,
              fontWeight:   600,
            }}
          >
            <span style={{ width: 8, height: 8, background: accentColor, borderRadius: "50%" }} />
            {article.readingTime}
          </div>
          <span style={{ fontSize: 22, color: "#8B8E92" }}>
            vestream.io/resources
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
