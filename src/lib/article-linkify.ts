// Auto-link protocol mentions in article HTML to their /protocols/{slug} page.
// Lifts internal PageRank to long-tail protocol pages and gives the reader a
// one-click path from "Sablier supports cliff vesting" to the Sablier protocol
// hub. Runs at render time on every <p>, <ul>, <ol> item — no build-time
// content mutation, so the source articles stay clean prose.
//
// Behaviour:
// - Whole-word, case-sensitive match on each protocol's display name.
// - Skips spans already inside <a>...</a> (no double-linking).
// - Skips matches inside HTML tags / attributes.
// - Only links the FIRST occurrence of each protocol per HTML fragment —
//   any more and the page would look spammy. Subsequent mentions stay plain.

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

// Escapes characters with regex meaning so a protocol name with a period or
// dash (e.g. future "Sablier Flow") still matches literally.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
