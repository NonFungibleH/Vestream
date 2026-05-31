// src/app/developer/quickstart/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// "From zero to first call in 60 seconds" walkthrough.
//
// Three tabs (Claude Desktop / Cursor / ChatGPT) each show a self-contained
// 3-step recipe — get a key, paste a config snippet, ask a question. We
// deliberately keep the setup snippet identical between Claude Desktop and
// Cursor (both speak MCP over stdio with the same JSON shape) and provide
// OpenAPI-Action instructions for ChatGPT.
//
// Tabs run client-side; the page itself is a server component so SEO sees
// every tab's content (good for "how do I add Vestream to Claude" search
// queries).
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { QuickstartTabs } from "./QuickstartTabs";

export const metadata: Metadata = {
  title:       "Quickstart — Vestream API + MCP",
  description: "From zero to first vesting query in 60 seconds. Step-by-step setup for Claude Desktop, Cursor, Windsurf, and ChatGPT.",
  alternates:  { canonical: "https://www.vestream.io/developer/quickstart" },
};

export default function QuickstartPage() {
  return (
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#0d1b35", color: "white" }}>
      <SiteNav theme="navy" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative px-4 md:px-8 pt-24 md:pt-32 pb-12 md:pb-16 max-w-4xl mx-auto w-full">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            <li><Link href="/" className="hover:underline">Home</Link></li>
            <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>›</li>
            <li><Link href="/developer" className="hover:underline">Developer</Link></li>
            <li aria-hidden style={{ color: "rgba(255,255,255,0.2)" }}>›</li>
            <li aria-current="page" style={{ color: "white", fontWeight: 600 }}>Quickstart</li>
          </ol>
        </nav>

        <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#1CB8B8" }}>
          Quickstart · 60 seconds
        </p>
        <h1 className="text-3xl md:text-5xl font-bold mb-5" style={{ letterSpacing: "-0.03em" }}>
          From zero to first vesting query
        </h1>
        <p className="text-base md:text-lg max-w-2xl leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
          Three steps: get a key, paste a config, ask a question. Pick your client below — same recipe works
          for Claude Desktop, Cursor, Windsurf, and any ChatGPT Custom GPT.
        </p>
      </section>

      {/* ── Step 1 — get a key ───────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-12 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-6 md:p-8"
          style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-4">
            <StepBadge n={1} />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-lg mb-2">Get a free API key</h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                The form on <Link href="/developer" className="underline" style={{ color: "#1CB8B8" }}>/developer</Link>{" "}
                issues a free-tier key on submit (no admin approval). Free tier: 30 req/min, 150 req/day.
                The plaintext is shown once and emailed to you for backup.
              </p>
              <Link
                href="/developer#request-access"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
              >
                Get my free API key →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Step 2 — paste a config ─────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-12 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-6 md:p-8"
          style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-4">
            <StepBadge n={2} />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-lg mb-2">Wire up your client</h2>
              <p className="text-sm leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.55)" }}>
                Pick your client below. Replace <code className="font-mono" style={{ color: "#1CB8B8" }}>vstr_live_…</code>{" "}
                with the key you just received.
              </p>
              <QuickstartTabs />
            </div>
          </div>
        </div>
      </section>

      {/* ── Step 3 — ask a question ─────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 max-w-4xl mx-auto w-full">
        <div className="rounded-2xl p-6 md:p-8"
          style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-start gap-4">
            <StepBadge n={3} />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-lg mb-3">Ask your agent a question</h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
                Restart the client (Claude Desktop / Cursor / Windsurf reads MCP config on launch). The Vestream tools should
                appear in the tools panel. Try one of these:
              </p>
              <ul className="space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                <li className="flex gap-3">
                  <span className="font-mono flex-shrink-0" style={{ color: "#1CB8B8" }}>›</span>
                  <span>What vesting positions does <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>vitalik.eth</code> have?</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono flex-shrink-0" style={{ color: "#1CB8B8" }}>›</span>
                  <span>What unlocks for <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>0xd8da6bf26964af9d7eed9e03e53415d37aa96045</code> in the next 30 days?</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono flex-shrink-0" style={{ color: "#1CB8B8" }}>›</span>
                  <span>Pull the full schedule for stream id <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)" }}>sablier-1-12345</code></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trouble + reference ─────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-20 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl p-6"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 className="font-bold text-sm mb-2">Something not working?</h3>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
              The most common issue is a missing or misnamed environment variable. Run the package directly to see startup
              errors:
            </p>
            <pre className="text-[11px] font-mono p-3 rounded-lg overflow-x-auto"
              style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}>
{`VESTREAM_API_KEY=vstr_live_... \\
  npx -y @vestream/mcp`}
            </pre>
            <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.45)" }}>
              Still stuck? <a href="mailto:team@vestream.io" className="underline" style={{ color: "#1CB8B8" }}>team@vestream.io</a>.
            </p>
          </div>
          <div className="rounded-2xl p-6"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 className="font-bold text-sm mb-2">Reference docs</h3>
            <ul className="text-xs space-y-2" style={{ color: "rgba(255,255,255,0.55)" }}>
              <li>
                <Link href="/api-docs" className="underline" style={{ color: "#1CB8B8" }}>Swagger UI</Link>{" "}
                — Try every endpoint live
              </li>
              <li>
                <a href="https://www.vestream.io/openapi.json" className="underline" style={{ color: "#1CB8B8" }}>OpenAPI spec</a>{" "}
                — Drop into ChatGPT Actions
              </li>
              <li>
                <a href="https://www.npmjs.com/package/@vestream/mcp" className="underline" style={{ color: "#1CB8B8" }}>@vestream/mcp on npm</a>{" "}
                — Source + README
              </li>
              <li>
                <Link href="/pricing" className="underline" style={{ color: "#1CB8B8" }}>Pricing</Link>{" "}
                — Pro tier: 5,000 req/day + alerts
              </li>
            </ul>
          </div>
        </div>
      </section>

      <SiteFooter theme="navy" recessed />
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
      style={{
        background:  "linear-gradient(135deg, #1CB8B8, #0F8A8A)",
        color:       "white",
        boxShadow:   "0 2px 8px rgba(28,184,184,0.35)",
      }}
    >
      {n}
    </div>
  );
}
