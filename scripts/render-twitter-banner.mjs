#!/usr/bin/env node
// scripts/render-twitter-banner.mjs
// ─────────────────────────────────────────────────────────────────────────────
// One-shot custom Twitter/X banner with the headline "Never miss a token
// unlock." styled to match the homepage hero — same ink colour, teal accent,
// letter-spacing and weight. Run via:
//   node scripts/render-twitter-banner.mjs
// Output: /public/social-logos/banner-twitter-headline-1500x500.png
//
// Why a separate script: this one is hand-tuned for a specific message,
// so it lives outside the bulk renderer in render-social-logos.mjs which
// produces the whole programmatic set.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pub  = resolve(root, "public");
const out  = resolve(pub, "social-logos");

const BRAND = {
  ink:      "#1A1D20",
  teal:     "#1CB8B8",
  tealDeep: "#0F8A8A",
  textMuted:"#8B8E92",
};

// Twitter/X header guidance: "safe area" centred on the canvas — the avatar
// overlaps the bottom-left, mobile crops the sides. We keep all critical
// content (headline + logo + tagline) in the central 1300×400 area.
const W = 1500;
const H = 500;

// Hand-tuned background SVG that mirrors the homepage hero:
// - warm paper #F5F5F3 NO — homepage actually uses pure white in the hero
//   block; the surrounding sections use #F5F5F3. We mirror the hero so this
//   banner shares its aesthetic with the most-seen frame on the site.
// - subtle teal radial glow upper-right to break the flat white
// - hairline bottom rule in brand teal at low opacity for a "magazine" feel
const bgSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
     <defs>
       <radialGradient id="glow" cx="92%" cy="20%" r="60%">
         <stop offset="0%"  stop-color="${BRAND.teal}" stop-opacity="0.16"/>
         <stop offset="60%" stop-color="${BRAND.teal}" stop-opacity="0.03"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </radialGradient>
       <linearGradient id="ruleGrad" x1="0" y1="0" x2="1" y2="0">
         <stop offset="0%"   stop-color="${BRAND.teal}" stop-opacity="0"/>
         <stop offset="35%"  stop-color="${BRAND.teal}" stop-opacity="0.45"/>
         <stop offset="65%"  stop-color="${BRAND.teal}" stop-opacity="0.45"/>
         <stop offset="100%" stop-color="${BRAND.teal}" stop-opacity="0"/>
       </linearGradient>
     </defs>

     <!-- Base -->
     <rect width="${W}" height="${H}" fill="#ffffff"/>
     <rect width="${W}" height="${H}" fill="url(#glow)"/>

     <!-- Bottom hairline rule (brand teal, fading to transparent at edges) -->
     <rect x="0" y="${H - 1}" width="${W}" height="1" fill="url(#ruleGrad)"/>

     <!-- Headline — pure type, centred, two-line treatment so the keyword
          pair "token unlock" gets its own line and full visual weight.
          "unlock" carries the brand teal accent (same treatment as the
          homepage hero). Vertically balanced: y=190 + y=294 means a 104px
          line gap, sized so the block sits centred-ish in the visible
          banner area with the website mark anchored beneath. -->
     <text
       x="${W / 2}" y="200"
       text-anchor="middle"
       font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Geist', 'Inter', system-ui, sans-serif"
       font-size="100"
       font-weight="800"
       fill="${BRAND.ink}"
       letter-spacing="-3.4"
     >Never miss a</text>
     <text
       x="${W / 2}" y="310"
       text-anchor="middle"
       font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Geist', 'Inter', system-ui, sans-serif"
       font-size="100"
       font-weight="800"
       fill="${BRAND.ink}"
       letter-spacing="-3.4"
     >token <tspan fill="${BRAND.teal}">unlock</tspan></text>

     <!-- Website — the single anchor that tells viewers where to go.
          Letter-spaced for confidence. Centred and rendered in deep teal
          to read as "official destination" rather than incidental text. -->
     <text
       x="${W / 2}" y="400"
       text-anchor="middle"
       font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Geist', 'Inter', system-ui, sans-serif"
       font-size="30"
       font-weight="700"
       fill="${BRAND.tealDeep}"
       letter-spacing="3"
     >VESTREAM.IO</text>
   </svg>`
);

// No icon composite — pure typography. The V-mark icon is the avatar's
// job; the banner backs it up with the headline + website only. Cleaner,
// more premium, more confident.
await sharp(bgSvg)
  .png({ compressionLevel: 9 })
  .toFile(resolve(out, "banner-twitter-headline-1500x500.png"));

console.log("[twitter-banner] ✅", resolve(out, "banner-twitter-headline-1500x500.png"));
