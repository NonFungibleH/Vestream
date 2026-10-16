# Graphics brief: "Vesting Is Crypto's Missing Payment Rail"

Paste everything below this line into Claude Code.

---

## The job

Create seven static images for a long-form article: six in-article figures and one featured image. Build them with code so they're consistent, exact and easy to re-render: one shared HTML/CSS template plus one page per figure, rendered to PNG with Playwright (headless Chromium). Don't use AI image generation or stock imagery. Every figure is a clean, flat, editorial data graphic in the style of a financial research report.

**Output folder:** `~/Desktop/vesting-article-graphics/`

For each figure, write:
- `figure-N.html` (the source, so it can be edited and re-rendered);
- `figure-N.png` at 1600 × 900;
- `figure-N@2x.png` at 3200 × 1800 (deviceScaleFactor 2);
- one shared `styles.css`;
- one `render.mjs` script that renders them all in a single run;
- `alt-text.md`, listing each figure's alt text (given below).

## Hard rules

- **No logos or brand names** anywhere: no Vestream wordmark, no protocol logos, no chain logos. Protocol names appear only as plain text labels in Figure 3.
- **No URLs** in any image.
- **No crypto clichés:** no coins, rockets, padlocks, glowing chains, gradients, 3D, drop shadows heavier than a hairline, or emoji.
- **Light background on every figure** (the article is published on a light site).
- **Charts are drawn to scale.** In Figure 3, bar lengths are exactly proportional to the values on a 0–100% axis. In Figure 5, the split is exactly 87/13.
- **Text must be readable when the image is shown at 800px wide.** No text smaller than 22px on the 1600px canvas.
- **Sentence case** for every title and label. UK English spelling.
- **Every number below is final and has been fact-checked.** Use the numbers and wording exactly as given; don't round, add or invent any.

## Style tokens (put these in `styles.css`)

```
--paper:     #F5F5F3   /* background */
--card:      #FFFFFF   /* boxes */
--ink:       #0B0E12   /* main text and lines */
--ink-2:     #475569   /* secondary text */
--grey:      #8B8E92   /* de-emphasised text, figure numbers, sources */
--grey-line: #D5D8DC   /* de-emphasised lines, bars and borders */
--teal:      #0F8A8A   /* the ONE highlight colour */
--teal-2:    #1CB8B8   /* lighter highlight, used sparingly */
--teal-wash: rgba(15,138,138,0.10)  /* highlight fills */
```

- **Font:** Geist. Download the TTF files (Regular 400, Medium 500, SemiBold 600) from the official Geist release on GitHub (vercel/geist-font), or load them from Google Fonts, and reference them with `@font-face` so the render is offline-safe. Fall back to `system-ui, sans-serif`.
- **Type scale (1600px canvas):** figure title SemiBold 44px; labels Regular 28px; bold labels Medium 28px; small notes Regular 22px. Line height 1.3.
- **Canvas:** 1600 × 900, padding 72px on all sides.
- **Shapes:** strokes 3px, box corner radius 12px, arrows with simple open chevron heads.
- **Highlight:** use teal only for the thing the reader should look at. Everything else is ink or grey.
- **Header on every in-article figure:** "Figure N" in grey, Medium 24px, uppercase with 0.12em letter-spacing, top-left. Directly beneath it, the figure title in ink, SemiBold 44px.
- **Source line:** only on Figures 3 and 5, bottom-left in grey 22px: `Source: author's on-chain study, October 2026.`

---

## Figure 1: One building block, many jobs

**Title:** One building block, many jobs

**Layout:** a hub-and-spoke diagram.
- **The hub, in the centre:** a white card with a teal 3px border, about 420 × 220px. Inside, three stacked rows, each with a small teal dot:
  - "Pot of value"
  - "Schedule"
  - "Recipient"

  Above the card, a small grey caption: "Every vesting contract".
- **Left side, labelled "Today":** five plain text labels, each joined to the hub by a solid ink line:
  - Team and investor vesting
  - Airdrops and community distributions
  - Grants paid over a set period
  - Pay for people working on a project
  - Treasury release schedules
- **Right side, labelled "Next":** three labels, each joined by a dashed teal line:
  - Stablecoin salaries
  - Tokenised equity awards
  - On-chain bonuses
- Put the "Today" and "Next" column headings in grey, Medium 24px, uppercase.

**Alt text:** "Diagram: every vesting contract is a pot of value, a schedule and a recipient. Today it powers team vesting, airdrops, grants, project pay and treasury schedules; next it can power stablecoin salaries, tokenised equity awards and on-chain bonuses."

## Figure 2: The life of a vesting schedule

**Title:** The life of a vesting schedule, and where it breaks

**Layout:** a left-to-right flow of rounded white boxes, joined by ink arrows.
- **The main flow:** "Created" → "Unlocks" → splits into three endings stacked vertically on the right:
  - "Claimed" (ink border);
  - "Never claimed" (teal border, teal-wash fill);
  - "Cancelled" (grey border).
- **A fourth ending:** a branch from "Unlocks" going down to "Token stops trading" (grey border).
- **Problem tags:** small numbered circles, 44px, in teal with white numerals, each with a short label next to it in ink 24px:
  - **1. Pull money:** on the arrow from "Unlocks" to "Never claimed".
  - **2. Earned vs received:** on the arrow from "Unlocks" to "Claimed".
  - **3. Ledger vs record:** a thin grey band running underneath the whole flow, labelled "What most tools actually read: indexes and APIs, not the chain". Put the tag at the band's left end.
  - **4. Hidden obligations:** attached to "Created", with the note "recipients may be off-chain until they claim".
  - **5. Outliving the asset:** attached to "Token stops trading".

**Alt text:** "Flow diagram of a vesting schedule from created to unlocked, ending in claimed, never claimed, cancelled or a token that stops trading, with five problems marked: pull money, earned vs received, ledger vs record, hidden obligations and outliving the asset."

## Figure 3: Unclaimed share by protocol (the data chart)

**Title:** Share of finished vesting schedules still unclaimed

**Subtitle** (ink-2, 26px): By protocol, as measured in October 2026

**Layout:** a horizontal bar chart.
- **Rows:** eight, sorted lowest to highest, top to bottom.
- **Labels:** protocol name on the left, in ink 28px, right-aligned in a column about 260px wide.
- **Bars:** on a 0–100% scale, about 1,000px wide.
- **Value labels:** at the end of each bar, in ink Medium 28px.
- **Gridlines:** light, in grey-line, at 0%, 25%, 50%, 75% and 100%, with axis labels in grey 22px along the bottom.

| Protocol | Value | Note shown in grey after the value |
|---|---|---|
| Jupiter Lock | 2.9% | sample |
| Streamflow | 26.1% | sample |
| Sablier | 30.3% | excl. one airdrop |
| Hedgey | 40.9% | |
| UNCX | 48.1% | excl. two mass distributions |
| Smithii | 60.7% | |
| Team Finance | 66.3% | of allocations, excl. mass distributions |
| Unvest | 87.0% | |

- **Bar colours:** full-census protocols in solid teal; the two sampled protocols (Jupiter Lock, Streamflow) in teal-2 with diagonal hatching, so "sample" reads at a glance.
- **Legend, top-right:** "Full census" (solid swatch) and "Random sample of 6,000" (hatched swatch).
- **Footnote** (grey 22px), above the source line: "Rates reflect how each protocol is used (airdrops vs team grants), not its quality."
- **Source line:** as specified in the style tokens.

**Alt text:** "Bar chart: the share of finished vesting schedules still unclaimed ranges from 2.9% on Jupiter Lock to 87% on Unvest, with Streamflow 26.1%, Sablier 30.3%, Hedgey 40.9%, UNCX 48.1%, Smithii 60.7% and Team Finance 66.3%."

## Figure 4: Two dates

**Title:** Earning it and receiving it are different moments

**Layout:** one horizontal timeline across the middle of the canvas, an ink line 4px thick, with two markers.
- **Left marker, "Unlocks":** a filled teal circle, 28px. Above it, in ink Medium 28px: "Unlocks". Below it, in ink-2 24px, two lines: "The value is yours." and "In the UK, usually the taxable point."
- **Right marker, "Claimed":** an ink outline circle, 28px, about 900px to the right. Above it: "Claimed". Below it: "The tokens reach your wallet."
- **The gap:** between the two markers, a teal-wash band, with a bracket above it labelled in teal Medium 28px: "Can be months or years".
- **Bottom note** (grey 24px), centred: "On the largest protocol measured, about 1 in 3 finished schedules never reach the second date."

**Alt text:** "Timeline: a vesting schedule unlocks, which is when the value becomes yours and usually the UK taxable point, then later is claimed, when tokens reach the wallet. The gap can be months or years, and on the largest protocol about 1 in 3 finished schedules are never claimed."

## Figure 5: Where the unclaimed tokens sit

**Title:** Most unclaimed tokens are worthless, but not all of them

**Layout:** two parts side by side.
- **Left (about 60% of the width):** one horizontal stacked bar, 100% wide within its area, 120px tall, drawn exactly to scale.
  - **87% segment:** grey-line fill, labelled underneath in ink-2: "87% in tokens with no market at all".
  - **13% segment:** solid teal, labelled underneath in teal Medium: "13% in tokens that still trade".
  - Above the bar, in ink Medium 28px: "Unclaimed Sablier streams".
- **Right (about 40%):** a callout card (white, 12px radius, teal 3px left border).
  - **The figure:** "$4.9M–$9.5M" in teal SemiBold 64px.
  - **Beneath it, in ink 26px:** "still unclaimed in tokens that trade, across six protocols".
  - **Beneath that, in grey 22px:** "Range depends on how strictly positions larger than their own market are discounted."
- **Source line:** as specified in the style tokens.

**Alt text:** "Chart: 87% of unclaimed Sablier streams are in tokens with no market and 13% in tokens that still trade. Across six protocols, between $4.9 million and $9.5 million is still unclaimed in tokens that trade."

## Figure 6: The missing layer

**Title:** The missing layer

**Layout:** a stacked infrastructure diagram, centred.
- **Base:** a wide ink-outline band, labelled in ink Medium 28px: "Vesting contracts on Ethereum, Solana and other chains". Mark it as "Built" in a small ink tag on the right.
- **Above the base:** five stacked bands of equal height, each with a dashed teal border and a teal-wash fill, numbered 1–5 from the bottom up, in ink 28px:
  1. Common read standard
  2. Verified record
  3. Payments that complete
  4. Both dates recorded
  5. Lifecycle handling
- Mark the five-band group as "Missing" with a small teal tag on the right.
- **Top:** a row of four plain ink-outline chips, all the same width: "Token compensation", "Airdrops", "Stablecoin payroll" and "Tokenised equity awards". Above them, a grey caption: "What it serves".
- Thin ink arrows run upward from the stack to the chips.

**Alt text:** "Stacked diagram: vesting contracts exist, but five layers on top are missing: a common read standard, a verified record, payments that complete, both dates recorded and lifecycle handling. Together they would serve token compensation, airdrops, stablecoin payroll and tokenised equity awards."

## Featured image (the article card image)

**Files:** `featured.png` (1600 × 900) and `featured@2x.png`.

- **Content:** an abstract, text-free version of Figure 1. The central three-row card, as plain rounded rectangles with no words, and spokes radiating outward: solid ink spokes to the left, dashed teal spokes to the right, ending in small rounded nodes.
- **Text:** only the article title, "Vesting is crypto's missing payment rail", in ink SemiBold 64px, top-left inside the padding.
- No figure number, no source line, no logo.

## Check before finishing

1. Render every figure, then open each PNG and confirm:
   - no text is clipped or overlapping;
   - nothing sits outside the 72px padding;
   - bars and splits are to scale (check Figure 3's Unvest bar is about 30× the length of Jupiter Lock's, and Figure 5's split is 87/13).
2. Make a quick contact sheet of all seven images at 800px wide, and confirm every label is still readable.
3. Search the HTML for the words "Vestream", "http" and "www", and confirm there are no matches.
4. List the output files with their pixel sizes.
