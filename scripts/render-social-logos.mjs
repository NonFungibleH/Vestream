#!/usr/bin/env node
// scripts/render-social-logos.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-shot renderer that turns the SVG logos in /public into a complete set
// of PNGs sized for every major social channel. Outputs to
// /public/social-logos/ — gitignored if you don't want them in the repo.
//
// Run from anywhere with sharp available:
//   node scripts/render-social-logos.mjs
//
// Why bake these instead of letting Twitter/LinkedIn rescale on upload:
// every platform downsamples differently, and SVG → PNG anti-aliasing is
// crisper when we control it (subpixel-accurate strokes, no compression
// artifacts on the wordmark serifs). Pre-rendering also lets us add
// background fills + radial glows that don't exist in the source SVGs.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pub  = resolve(root, "public");
const out  = resolve(pub, "social-logos");
mkdirSync(out, { recursive: true });

// ── Brand tokens (mirror lib/constants — keep in sync if either changes) ────
const BRAND = {
  inkDark:    "#0d0f14",   // hero-dark background
  inkLight:   "#F5F5F3",   // warm paper
  teal:       "#1CB8B8",
  tealDeep:   "#0F8A8A",
  ink:        "#1A1D20",   // warm ink for text
};

const svgIcon     = readFileSync(resolve(pub, "logo-icon.svg"));
const svgIconDark = readFileSync(resolve(pub, "logo-icon-dark.svg"));
const svgLogoDark = readFileSync(resolve(pub, "logo-dark.svg"));   // horizontal, white wordmark
const svgLogo     = readFileSync(resolve(pub, "logo.svg"));        // horizontal, dark wordmark
const svgWordmark = readFileSync(resolve(pub, "logo-wordmark.svg"));

console.log("[social-logos] Rendering Vestream PNG set →", out);

// ── Helper: render the icon SVG to a transparent PNG, then trim its
// surrounding empty space so the actual logo paths fill the bounding box.
// The source SVG uses a 100×100 viewBox but the slabs only occupy roughly
// x=22→86, y=30→70 — without trim the icon swims in negative space.
async function renderTrimmedIcon(svg, density = 1200) {
  const raw = await sharp(svg, { density })
    .resize(2400, 2400, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(raw).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
}

const trimmedIconLight = await renderTrimmedIcon(svgIcon);
const trimmedIconDark  = await renderTrimmedIcon(svgIconDark);

// ── 1. Square profile icon — TRANSPARENT bg, 1024×1024 ──────────────────────
// Universal: works on every platform that lets you upload a square avatar.
// Padded so the icon fills 75% of the canvas — feels right at small sizes
// (Twitter avatar circle, Discord) while leaving breathing room.
async function squareProfile(iconBuf, sizeBefore, finalSize, bgColor, outName) {
  const fitted = await sharp(iconBuf)
    .resize(sizeBefore, sizeBefore, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: finalSize, height: finalSize, channels: 4,
      background: bgColor ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fitted, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(out, outName));
}

await squareProfile(trimmedIconLight, 760, 1024, undefined, "profile-square-1024-transparent.png");
await squareProfile(trimmedIconLight, 600, 800,  undefined, "profile-square-800-transparent.png");
await squareProfile(trimmedIconLight, 300, 400,  undefined, "profile-square-400-transparent.png");

// ── 2. Square profile icon on DARK brand bg, 1024×1024 ──────────────────────
// For platforms that look better with full bleed (Discord, X dark mode).
// Same aesthetic as the iOS app icon — generous padding around the mark.
await squareProfile(trimmedIconDark, 760, 1024, BRAND.inkDark, "profile-square-1024-dark.png");

// ── 3. Square profile icon on LIGHT brand bg, 1024×1024 ─────────────────────
await squareProfile(trimmedIconLight, 760, 1024, BRAND.inkLight, "profile-square-1024-light.png");

// ── 4. Open Graph image, 1200×630 — for link previews (FB, X, LinkedIn) ─────
// PRIMARY chosen colourway: white background, ink wordmark — matches the
// vestream.io homepage. Dark variant produced too as a fallback for
// platforms that look better with full-bleed dark.
//
// Light (primary) — matches the homepage aesthetic.
const ogLight = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <radialGradient id="g" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
         <stop offset="0%" stop-color="${BRAND.teal}" stop-opacity="0.10"/>
         <stop offset="60%" stop-color="${BRAND.teal}" stop-opacity="0.02"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1200" height="630" fill="#ffffff"/>
     <ellipse cx="600" cy="315" rx="520" ry="320" fill="url(#g)"/>
     <text x="600" y="540" text-anchor="middle"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="22" font-weight="500" fill="${BRAND.ink}" opacity="0.70"
           letter-spacing="0.05em">
       TRACK EVERY TOKEN UNLOCK · 9 PROTOCOLS · 5 CHAINS
     </text>
   </svg>`,
);
await sharp(ogLight)
  .composite([
    {
      input: await sharp(svgLogo, { density: 600 }).resize(720, null, { fit: "inside" }).png().toBuffer(),
      top: 200, left: 240,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "og-image-1200x630.png"));

// Dark variant — kept as alternate for platforms that look better dark.
const ogDark = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <radialGradient id="g" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
         <stop offset="0%" stop-color="${BRAND.teal}" stop-opacity="0.22"/>
         <stop offset="60%" stop-color="${BRAND.teal}" stop-opacity="0.04"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1200" height="630" fill="${BRAND.inkDark}"/>
     <ellipse cx="600" cy="315" rx="520" ry="320" fill="url(#g)"/>
     <text x="600" y="540" text-anchor="middle"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="22" font-weight="500" fill="rgba(255,255,255,0.55)"
           letter-spacing="0.05em">
       TRACK EVERY TOKEN UNLOCK · 9 PROTOCOLS · 5 CHAINS
     </text>
   </svg>`,
);
await sharp(ogDark)
  .composite([
    {
      input: await sharp(svgLogoDark, { density: 600 }).resize(720, null, { fit: "inside" }).png().toBuffer(),
      top: 200, left: 240,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "og-image-1200x630-dark.png"));

// ── 5. Twitter / X banner, 1500×500 — light primary + dark fallback ─────────
const bannerLight = Buffer.from(
  `<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <radialGradient id="glow" cx="80%" cy="50%" r="50%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.10"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1500" height="500" fill="#ffffff"/>
     <rect width="1500" height="500" fill="url(#glow)"/>
     <text x="100" y="380"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="22" font-weight="500" fill="${BRAND.ink}" opacity="0.62"
           letter-spacing="0.04em">
       Sablier · Hedgey · UNCX · Streamflow · Team Finance · Superfluid · PinkSale · Unvest · Jupiter Lock
     </text>
   </svg>`,
);
await sharp(bannerLight)
  .composite([
    {
      input: await sharp(svgLogo, { density: 600 }).resize(680, null, { fit: "inside" }).png().toBuffer(),
      top: 180, left: 100,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "banner-twitter-x-1500x500.png"));

const bannerDark = Buffer.from(
  `<svg width="1500" height="500" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%"  stop-color="${BRAND.inkDark}"/>
         <stop offset="100%" stop-color="#0a0c12"/>
       </linearGradient>
       <radialGradient id="glow" cx="80%" cy="50%" r="50%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.18"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1500" height="500" fill="url(#bg)"/>
     <rect width="1500" height="500" fill="url(#glow)"/>
     <text x="100" y="380"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="22" font-weight="500" fill="rgba(255,255,255,0.55)"
           letter-spacing="0.04em">
       Sablier · Hedgey · UNCX · Streamflow · Team Finance · Superfluid · PinkSale · Unvest · Jupiter Lock
     </text>
   </svg>`,
);
await sharp(bannerDark)
  .composite([
    {
      input: await sharp(svgLogoDark, { density: 600 }).resize(680, null, { fit: "inside" }).png().toBuffer(),
      top: 180, left: 100,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "banner-twitter-x-1500x500-dark.png"));

// ── 6. LinkedIn cover, 1584×396 — light primary + dark fallback ─────────────
const liBannerLight = Buffer.from(
  `<svg width="1584" height="396" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <radialGradient id="glow" cx="80%" cy="50%" r="50%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.10"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1584" height="396" fill="#ffffff"/>
     <rect width="1584" height="396" fill="url(#glow)"/>
     <text x="120" y="290"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="20" font-weight="500" fill="${BRAND.ink}" opacity="0.62"
           letter-spacing="0.04em">
       The token vesting tracker for serious holders. 9 protocols · 5 chains · alerts before every unlock.
     </text>
   </svg>`,
);
await sharp(liBannerLight)
  .composite([
    {
      input: await sharp(svgLogo, { density: 600 }).resize(560, null, { fit: "inside" }).png().toBuffer(),
      top: 130, left: 120,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "banner-linkedin-1584x396.png"));

const liBannerDark = Buffer.from(
  `<svg width="1584" height="396" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%"  stop-color="${BRAND.inkDark}"/>
         <stop offset="100%" stop-color="#0a0c12"/>
       </linearGradient>
       <radialGradient id="glow" cx="80%" cy="50%" r="50%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.18"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="1584" height="396" fill="url(#bg)"/>
     <rect width="1584" height="396" fill="url(#glow)"/>
     <text x="120" y="290"
           font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
           font-size="20" font-weight="500" fill="rgba(255,255,255,0.55)"
           letter-spacing="0.04em">
       The token vesting tracker for serious holders. 9 protocols · 5 chains · alerts before every unlock.
     </text>
   </svg>`,
);
await sharp(liBannerDark)
  .composite([
    {
      input: await sharp(svgLogoDark, { density: 600 }).resize(560, null, { fit: "inside" }).png().toBuffer(),
      top: 130, left: 120,
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "banner-linkedin-1584x396-dark.png"));

// ── 7. Horizontal lockup, transparent — utility export, 2000px wide ─────────
// For everywhere else (press kits, partner pages, embed in slide decks).
await sharp(svgLogo, { density: 600 })
  .resize(2000, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "logo-horizontal-light-2000.png"));

await sharp(svgLogoDark, { density: 600 })
  .resize(2000, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "logo-horizontal-dark-2000.png"));

// ── 8. Wordmark only, transparent ───────────────────────────────────────────
await sharp(svgWordmark, { density: 600 })
  .resize(1500, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "wordmark-1500.png"));

console.log("[social-logos] ✅ Done. Files in", out);
