// Auto-link mentions in article HTML to internal pages.
// Runs at render time on every <p>, <ul>, <ol> item — no build-time
// content mutation, so the source articles stay clean prose.
//
// Behaviour:
// - Whole-word, case-sensitive match on each entry.
// - Skips spans already inside <a>...</a> (no double-linking).
// - Skips matches inside HTML tags / attributes.
// - Only links the FIRST occurrence of each entry per HTML fragment —
//   any more and the page would look spammy. Subsequent mentions stay plain.
//
// Two link tables:
//   PROTOCOL_LINKS — protocol names → /protocols/{slug}
//   TOOL_LINKS     — feature-page phrases → tool/feature routes

import { listProtocols } from "./protocol-constants";

// Build the protocol → slug map ONCE at module load. listProtocols() filters
// out disabled protocols by default, which matches what we want: we don't
// want to link the reader to a 404 (e.g. Team Finance pause).
const PROTOCOL_LINKS: Array<{ name: string; slug: string }> = (() => {
  const out: Array<{ name: string; slug: string }> = [];
  for (const p of listProtocols()) {
    // Skip if any name is too generic to whole-word match safely (none today,
    // but guard for future single-word protocols like "Vault" or "Lock").
    if (p.name.length < 3) continue;
    out.push({ name: p.name, slug: p.slug });
  }
  // Sort longest-first so "Team Finance" matches before "Team" if any future
  // protocol name overlaps. Defence in depth.
  out.sort((a, b) => b.name.length - a.name.length);
  return out;
})();

// Tool-page phrases — exact string match, longest first.
// Only link phrases that appear naturally in article prose and where the
// link genuinely helps the reader take the next step.
const TOOL_LINKS: Array<{ phrase: string; href: string }> = [
  // Specific feature mentions (most precise — link first)
  { phrase: "Vestream's Discover feature",  href: "/find-vestings" },
  { phrase: "Discover feature on Vestream", href: "/find-vestings" },
  // Calendar / unlocks surface
  { phrase: "token unlock calendar",        href: "/unlocks"       },
  { phrase: "unlock calendar",              href: "/unlocks"       },
].sort((a, b) => b.phrase.length - a.phrase.length); // longest match first

// Escapes characters with regex meaning so a protocol name with a period or
// dash (e.g. future "Sablier Flow") still matches literally.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Core linkifier: replaces the first whole-word occurrence of each entry in
 * `links` within `html` with an anchor, skipping text already inside <a>
 * tags or HTML tag attributes.
 *
 * `useWordBoundary` — set true for single-word protocol names (whole-word \b
 * guards are safe). Set false for multi-word phrases where the surrounding
 * context already makes them phrase-specific (e.g. "Vestream's Discover
 * feature") and \b on the phrase boundary would mis-fire on apostrophes.
 */
function linkifyEntries(
  html: string,
  links: Array<{ phrase: string; href: string; style?: string }>,
  useWordBoundary = true,
): string {
  if (!html) return html;

  let result = html;
  const linked = new Set<string>();

  for (const { phrase, href, style } of links) {
    if (linked.has(phrase)) continue;

    const escaped = escapeRegex(phrase);
    const re = useWordBoundary
      ? new RegExp(`\\b(${escaped})\\b`, "")
      : new RegExp(`(${escaped})`, "");

    const anchorStyle = style ??
      "color:#0F8A8A;text-decoration:underline;text-decoration-color:rgba(28,184,184,0.4);text-underline-offset:2px";

    // Walk non-anchor segments, replace only in plain-text nodes.
    const parts = result.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/i);
    let replaced = false;
    for (let i = 0; i < parts.length; i++) {
      if (replaced) break;
      if (i % 2 === 1) continue; // skip existing anchor content
      const subParts = parts[i].split(/(<[^>]+>)/);
      for (let j = 0; j < subParts.length; j++) {
        if (replaced) break;
        if (j % 2 === 1) continue; // skip tag strings
        const text = subParts[j];
        if (!text) continue;
        if (re.test(text)) {
          subParts[j] = text.replace(
            re,
            `<a href="${href}" style="${anchorStyle}">$1</a>`,
          );
          replaced = true;
          linked.add(phrase);
        }
      }
      parts[i] = subParts.join("");
    }
    if (replaced) result = parts.join("");
  }

  return result;
}

/**
 * Replace the first whole-word occurrence of each protocol name in `html`
 * with an anchor to /protocols/{slug}, unless that occurrence is already
 * inside an anchor or HTML tag.
 *
 * Performance note: the protocol list is ~10-12 entries, the regex runs
 * once per article paragraph during SSR (or once per ISR revalidation),
 * and articles render at the edge cache anyway. Don't pre-build per
 * article — the source HTML can change at deploy time and we want zero
 * extra config to keep this fresh.
 */
export function linkifyProtocols(html: string): string {
  if (!html) return html;

  let result = html;
  const linkedSlugs = new Set<string>();

  for (const { name, slug } of PROTOCOL_LINKS) {
    if (linkedSlugs.has(slug)) continue;

    // Whole-word boundary on both sides. Negative lookbehinds for HTML
    // contexts where we MUST NOT inject an anchor:
    //   (?<!<a [^>]*>[^<]*) — inside an existing <a>...</a>
    //   (?<!<[^>]*)         — inside a tag's attributes
    //   (?<!>[^<]*<\/a>)    — between closing of an <a> and another tag
    // JS regex doesn't allow variable-length lookbehinds in older engines
    // but Node 20+ (which we target) supports them. The simpler approach
    // is: walk the string, skip anchor contents, replace only in plain text.
    const re = new RegExp(`\\b(${escapeRegex(name)})\\b`, "");

    // Manual tokenisation: split on <a ...>...</a> blocks, only mutate
    // the non-anchor segments. Avoids the lookbehind correctness landmines.
    const parts = result.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/i);
    let replaced = false;
    for (let i = 0; i < parts.length; i++) {
      if (replaced) break;
      // Even indices are non-anchor; odd indices are anchor contents.
      if (i % 2 === 1) continue;
      const segment = parts[i];
      // Strip HTML tags from the search region — replace ONLY in text nodes.
      // We can do this by alternating tag/text regions:
      const subParts = segment.split(/(<[^>]+>)/);
      for (let j = 0; j < subParts.length; j++) {
        if (replaced) break;
        // Odd indices are tags; even are text.
        if (j % 2 === 1) continue;
        const text = subParts[j];
        if (!text) continue;
        if (re.test(text)) {
          subParts[j] = text.replace(
            re,
            `<a href="/protocols/${slug}" style="color:#0F8A8A;text-decoration:underline;text-decoration-color:rgba(28,184,184,0.4);text-underline-offset:2px">$1</a>`,
          );
          replaced = true;
          linkedSlugs.add(slug);
        }
      }
      parts[i] = subParts.join("");
    }
    if (replaced) {
      result = parts.join("");
    }
  }

  return result;
}

/**
 * Full content linkifier — protocol names + feature-page phrases.
 * Preferred over bare linkifyProtocols for article renderers: it adds
 * one extra pass over TOOL_LINKS without touching already-linked text.
 */
export function linkifyContent(html: string): string {
  // Pass 1: protocol names → /protocols/{slug}
  const withProtocols = linkifyProtocols(html);
  // Pass 2: feature-page phrases — exact multi-word match, no word boundary
  return linkifyEntries(withProtocols, TOOL_LINKS, false);
}
