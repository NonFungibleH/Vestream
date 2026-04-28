#!/usr/bin/env node
// scripts/render-twitter-icon.mjs
// ─────────────────────────────────────────────────────────────────────────────
// 400×400 profile picture for X/Twitter (and any other circle-cropped
// avatar surface). Composition: V-mark icon stacked on top, "Vestream"
// wordmark beneath, both centred inside the visible circle.
//
// Twitter masks profile pics to a circle. The visible circle on a 400×400
// upload is ~360px diameter (centred, ~20px edge buffer to absorb the
// circular crop on different clients). Anything outside that diameter
// gets clipped, so the icon+wordmark stack is sized to fit a 320×320
// inscribed square (worst-case-readable region) inside the circle.
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

const SIZE = 400;
const BRAND = {
  ink:  "#1A1D20",
  teal: "#1CB8B8",
};

// Render the V-mark icon SVG to a trimmed PNG so we know exactly how big
// the actual logo paths are (the icon SVG has ~36% empty padding inside
// its 100×100 viewBox).
async function renderTrimmedIcon() {
  const svg = readFileSync(resolve(pub, "logo-icon.svg"));
  const raw = await sharp(svg, { density: 1200 })
    .resize(2400, 2400, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(raw).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
}

const trimmedIcon = await renderTrimmedIcon();

// Pre-render the icon at the size it will appear in the avatar — slightly
// less than half the circle diameter, leaving room for the wordmark below.
const ICON_W = 220;     // icon target width inside the circle
const ICON_H = Math.round(ICON_W * 0.42);  // matches the trimmed icon's aspect (~64×40 from 100 viewbox → ratio ~0.625)
                                          // empirically the trimmed PNG is wider than tall — sharp will fit.
const iconPng = await sharp(trimmedIcon)
  .resize(ICON_W, ICON_H, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const iconMeta = await sharp(iconPng).metadata();

// Background — pure white with a faint radial teal glow so the avatar
// doesn't look totally flat against Twitter's dark UI. Subtle: 6% peak
// opacity so the white still reads white.
const bgSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
     <defs>
       <radialGradient id="g" cx="50%" cy="38%" r="60%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.10"/>
         <stop offset="60%" stop-color="${BRAND.teal}" stop-opacity="0.02"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>
     <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>

     <!-- Wordmark text — "Vestream", weight 800, letter-spacing -0.02em.
          Centred horizontally and positioned ~258px from top so it sits
          just below the icon (which is rendered separately via composite). -->
     <text
       x="${SIZE / 2}" y="278"
       text-anchor="middle"
       font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Geist', 'Inter', system-ui, sans-serif"
       font-size="46"
       font-weight="800"
       fill="${BRAND.ink}"
       letter-spacing="-1.5"
     >Vestream</text>
   </svg>`
);

// Composite: bg → icon centred horizontally at y=128 (so the
// icon+wordmark stack sits visually centred in the avatar circle).
const iconLeft = Math.round((SIZE - (iconMeta.width ?? ICON_W)) / 2);
const iconTop  = 138;

await sharp(bgSvg)
  .composite([{ input: iconPng, top: iconTop, left: iconLeft }])
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "profile-icon-twitter-400x400.png"));

console.log("[twitter-icon] ✅", resolve(out, "profile-icon-twitter-400x400.png"));
