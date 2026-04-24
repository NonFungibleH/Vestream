// src/components/TokenFAQ.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FAQ section rendered at the bottom of /token/[chainId]/[address].
//
// Two jobs:
//   1. Render an accessible accordion of Q&A pairs for human visitors.
//      Uses native <details>/<summary> so it works without JS and is
//      keyboard-friendly out of the box.
//   2. Emit `<script type="application/ld+json">` with schema.org FAQPage
//      markup. Google reads this and can promote matching Q&A into rich
//      search results — the primary SEO lever here.
//
// Pure Server Component. No client-side state, no hooks. The `<details>`
// element handles open/close entirely in the browser.
// ─────────────────────────────────────────────────────────────────────────────

import type { FAQItem } from "@/lib/vesting/token-faq";

interface Props {
  /** Ordered FAQ list from buildTokenFAQ(). Rendered verbatim and also
   *  serialised into the JSON-LD block. */
  items: FAQItem[];
  /** Passed to the heading so the section has a token-specific title that
   *  matches the rest of the page. */
  symbol: string;
}

export function TokenFAQ({ items, symbol }: Props) {
  if (items.length === 0) return null;

  // JSON-LD for Google's FAQPage rich result. Important: `name` is the
  // question, `acceptedAnswer.text` is the answer as plain text. Google
  // will NOT render HTML inside answer.text — always keep this plain.
  const jsonLd = {
    "@context":  "https://schema.org",
    "@type":     "FAQPage",
    mainEntity:  items.map((it) => ({
      "@type": "Question",
      name:    it.question,
      acceptedAnswer: {
        "@type": "Answer",
        text:    it.answer,
      },
    })),
  };

  return (
    <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
      {/* Rich-snippet payload. Rendered first so crawlers see it before
          any client-side JS could alter the DOM. */}
      <script
        type="application/ld+json"
        // Dangerously-set is safe here: we control both the shape and the
        // string contents (the FAQ builder produces plain text only).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Heading stack: H2 on one line, supporting caption on a dedicated
          row below. On 375px the old inline layout caused the caption to
          orphan under the H2 with awkward wrapping — a proper two-row
          structure reads cleaner. */}
      <div className="mb-4">
        <h2
          className="text-xl md:text-2xl font-bold"
          style={{ color: "#0f172a", letterSpacing: "-0.02em" }}
        >
          {symbol} token FAQ
        </h2>
        <p className="mt-1 text-xs" style={{ color: "#94a3b8" }}>
          Answers generated from TokenVest&rsquo;s indexed data · updated each seed-cache run.
        </p>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "white",
          border:     "1px solid rgba(0,0,0,0.07)",
          boxShadow:  "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {items.map((it, idx) => (
          <details
            key={it.question}
            className="group"
            style={{
              borderBottom: idx < items.length - 1 ? "1px solid rgba(0,0,0,0.05)" : undefined,
            }}
          >
            <summary
              className="px-4 md:px-6 py-4 cursor-pointer select-none flex items-center justify-between gap-4 transition-colors hover:bg-slate-50/60"
              style={{ color: "#0f172a" }}
            >
              <span className="text-sm md:text-base font-semibold">
                {it.question}
              </span>
              {/* Chevron rotates when the details is open, native CSS
                  sibling selector handles the transform. */}
              <span
                className="flex-shrink-0 text-xs transition-transform group-open:rotate-180"
                style={{ color: "#94a3b8" }}
                aria-hidden
              >
                ▼
              </span>
            </summary>
            <div
              className="px-4 md:px-6 pb-5 text-sm leading-relaxed"
              style={{ color: "#475569" }}
            >
              {it.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
