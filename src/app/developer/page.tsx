import Link from "next/link";
import { ApiAccessForm } from "@/components/ApiAccessForm";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function Check() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="8" fill="#10b981" fillOpacity={0.12} />
      <path d="M5 8l2 2 4-4" stroke="#10b981" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DeveloperPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#0d1b35", color: "white" }}>

      {/* ── Nav ── */}
      <SiteNav theme="navy" />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-40 md:pb-28 px-4 md:px-8 text-center">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(37,99,235,0.12) 0%, transparent 70%)"
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.4), transparent)" }} />

        <div className="relative max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: "rgba(37,99,235,0.06)", borderColor: "rgba(37,99,235,0.2)", color: "#2563eb" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#2563eb" }} />
            Developer API · Invite-only Beta
          </div>

          <h1 className="font-bold tracking-tight mb-6"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", lineHeight: 1.08, letterSpacing: "-0.03em", color: "white" }}>
            The vesting data layer<br />
            <span style={{
              background: "linear-gradient(135deg, #2563eb 0%, #7c3aed 60%, #6366f1 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>
              for AI agents and platforms
            </span>
          </h1>

          <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
            Normalised, chain-indexed vesting data from Sablier, UNCX, Hedgey, Unvest, Team Finance, Superfluid, and PinkSale —
            served via clean REST API with OpenAPI spec and native MCP support.
            One integration, every protocol.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href="#request-access"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 4px 20px rgba(37,99,235,0.3)" }}>
              Request API Access
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <Link href="/api-docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa" }}>
              View API Docs →
            </Link>
          </div>

          {/* Stats bar */}
          <div className="flex items-center justify-center gap-8 mt-14 flex-wrap">
            {[
              { value: "7",     label: "Protocols indexed" },
              { value: "5",     label: "EVM chains" },
              { value: "3",     label: "API endpoints" },
              { value: "JSON",  label: "Normalised output" },
              { value: "MCP",   label: "Agent-native" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className="font-bold text-2xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What we index ── */}
      <section className="px-4 md:px-8 pb-16 md:pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Indexed protocols</p>
            <h2 className="font-bold text-2xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
              One API. Every major vesting protocol.
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { name: "Sablier",       color: "#f97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.18)",  note: "Linear + tranched" },
              { name: "UNCX",          color: "#2563eb", bg: "rgba(37,99,235,0.08)",   border: "rgba(37,99,235,0.18)",   note: "Token locks" },
              { name: "Hedgey",        color: "#7c3aed", bg: "rgba(124,58,237,0.08)",  border: "rgba(124,58,237,0.18)",  note: "NFT-based vesting" },
              { name: "Unvest",        color: "#0891b2", bg: "rgba(8,145,178,0.08)",   border: "rgba(8,145,178,0.18)",   note: "Multi-chain" },
              { name: "Team Finance",  color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.18)",  note: "Team vesting" },
              { name: "Superfluid",    color: "#1db954", bg: "rgba(29,185,84,0.08)",   border: "rgba(29,185,84,0.18)",   note: "Streaming vesting" },
              { name: "PinkSale",      color: "#ec4899", bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.18)",  note: "PinkLock V2" },
            ].map(p => (
              <div key={p.name} className="rounded-2xl p-5 text-center"
                style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: p.bg, border: `1px solid ${p.border}` }}>
                  <span className="font-bold text-base" style={{ color: p.color }}>{p.name[0]}</span>
                </div>
                <div className="font-semibold text-sm mb-1" style={{ color: "white" }}>{p.name}</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{p.note}</div>
              </div>
            ))}
          </div>
          {/* Shared chain coverage — applies to all protocols above */}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>Available on</span>
            {["Ethereum", "BNB Chain", "Base", "Polygon"].map((chain) => (
              <span key={chain} className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                {chain}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Three pillars ── */}
      <section className="px-4 md:px-8 py-16 md:py-20" style={{ background: "#122040", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Why Vestream API</p>
            <h2 className="font-bold text-2xl md:text-3xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Built for the next generation of financial infrastructure
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "⬡",
                color: "#2563eb",
                bg: "rgba(37,99,235,0.08)",
                border: "rgba(37,99,235,0.18)",
                title: "Normalised schema",
                description: "Every protocol speaks a different language on-chain. We translate everything into one consistent VestingStream format — same field names, same units, same structure, regardless of protocol.",
                points: ["Unified token amounts (raw + USD)", "Consistent cliff, start, end timestamps", "Cross-protocol claim history", "Protocol-agnostic stream IDs"],
              },
              {
                icon: "⬡",
                color: "#7c3aed",
                bg: "rgba(124,58,237,0.08)",
                border: "rgba(124,58,237,0.18)",
                title: "REST API + OpenAPI",
                description: "Three clean endpoints that return structured JSON instantly from our persistent index. Interactive Swagger docs, full OpenAPI 3.1 spec, and standard Bearer auth — exactly what developers and integrations expect.",
                points: ["Instant responses from DB cache", "Standard Bearer token auth", "Rate limit headers on every response", "Interactive Swagger UI at /api-docs"],
              },
              {
                icon: "⬡",
                color: "#0891b2",
                bg: "rgba(8,145,178,0.08)",
                border: "rgba(8,145,178,0.18)",
                title: "AI agent-native (MCP)",
                description: "Published as an MCP server so AI agents — Claude, GPT, LangChain, CrewAI — can call our API as a native tool with zero custom integration code. One config block and your agent understands vesting.",
                points: ["Anthropic MCP server included", "OpenAPI spec for function calling", "Structured JSON for LLM parsing", "Forecast + unlock tools built in"],
              },
            ].map(p => (
              <div key={p.title} className="rounded-2xl p-7"
                style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                  style={{ background: p.bg, border: `1px solid ${p.border}`, color: p.color, fontSize: 20 }}>
                  <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                    <path d="M10 2L17.5 6.5V13.5L10 18L2.5 13.5V6.5L10 2Z"
                      stroke={p.color} strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3 className="font-bold text-lg mb-2 tracking-tight" style={{ color: "white", letterSpacing: "-0.01em" }}>{p.title}</h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.5)" }}>{p.description}</p>
                <ul className="flex flex-col gap-2">
                  {p.points.map(pt => (
                    <li key={pt} className="flex items-start gap-2.5">
                      <Check />
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API endpoints showcase ── */}
      <section className="px-4 md:px-8 py-16 md:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>API reference</p>
            <h2 className="font-bold text-3xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Three endpoints. Everything you need.
            </h2>
          </div>

          <div className="flex flex-col gap-5">
            {[
              {
                method: "GET",
                path: "/api/v1/wallet/{address}/vestings",
                description: "All vesting streams for a wallet across every indexed protocol and chain.",
                params: ["?protocol=sablier,uncx", "?chain=1,8453", "?active_only=true"],
                example: `{
  "wallet": "0xd8da...6045",
  "count": 4,
  "streams": [
    {
      "id": "sablier-8453-12345",
      "protocol": "sablier",
      "chainId": 8453,
      "tokenSymbol": "UNI",
      "totalAmount": "10000000000000000000000",
      "claimableNow": "1250000000000000000000",
      "endTime": 1798761600,
      "isFullyVested": false
    }
  ]
}`,
              },
              {
                method: "GET",
                path: "/api/v1/wallet/{address}/upcoming-unlocks",
                description: "All unlock events (cliffs, tranches, linear endings) due within a time window. Ideal for AI forecasting and alerts.",
                params: ["?days=30", "?days=365", "?protocol=hedgey"],
                example: `{
  "wallet": "0xd8da...6045",
  "window_days": 30,
  "count": 2,
  "unlocks": [
    {
      "stream_id": "sablier-1-9876",
      "token_symbol": "ARB",
      "unlock_time": 1750291200,
      "unlock_type": "cliff",
      "amount_unlocking": "5000000000000000000000"
    }
  ]
}`,
              },
              {
                method: "GET",
                path: "/api/v1/stream/{streamId}",
                description: "Full details for a single stream including claim history, unlock steps, and index timestamps.",
                params: ["streamId: sablier-1-12345", "streamId: uncx-56-9876"],
                example: `{
  "stream": {
    "id": "uncx-56-9876",
    "protocol": "uncx",
    "chainId": 56,
    "tokenSymbol": "CAKE",
    "totalAmount": "500000000000000000000",
    "withdrawnAmount": "125000000000000000000",
    "cliffTime": 1746057600,
    "endTime": 1777593600,
    "shape": "linear"
  },
  "last_indexed": "2026-03-18T14:22:00Z",
  "first_seen": "2026-01-04T09:11:00Z"
}`,
              },
            ].map(ep => (
              <div key={ep.path} className="rounded-2xl overflow-hidden"
                style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-start gap-4 p-6 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb", fontFamily: "monospace" }}>
                    GET
                  </span>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono font-semibold break-all" style={{ color: "white" }}>{ep.path}</code>
                    <p className="text-sm mt-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>{ep.description}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {ep.params.map(p => (
                        <span key={p} className="text-xs font-mono px-2 py-1 rounded-md"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-5" style={{ background: "#0a1628" }}>
                  <pre className="text-xs leading-relaxed overflow-x-auto" style={{ color: "#94a3b8", fontFamily: "monospace" }}>
                    <code>{ep.example}</code>
                  </pre>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link href="/api-docs"
              className="inline-flex items-center gap-2 text-sm font-semibold transition-all"
              style={{ color: "#60a5fa" }}>
              View full interactive documentation →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section className="px-4 md:px-8 py-16 md:py-20" style={{ background: "#122040", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Use cases</p>
            <h2 className="font-bold text-3xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Who builds with Vestream API
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: "🤖",
                title: "AI Portfolio Agents",
                description: "Give your agent real-time vesting intelligence. Ask \"when does my next unlock happen?\" or \"how much have I claimed this year?\" — answered instantly from structured data.",
                tags: ["MCP-native", "OpenAPI spec", "Unlock forecasting"],
              },
              {
                icon: "👛",
                title: "Wallet Applications",
                description: "Show users their complete vesting picture without building protocol-specific integrations for each chain. One API call replaces five.",
                tags: ["Multi-protocol", "Multi-chain", "Normalised schema"],
              },
              {
                icon: "📊",
                title: "Analytics Platforms",
                description: "Enrich your on-chain analytics with structured vesting data. Track team and investor unlock schedules, historical claims, and token release patterns.",
                tags: ["Historical data", "Claim events", "Protocol breakdown"],
              },
              {
                icon: "🏛️",
                title: "Compliance & Fund Tools",
                description: "Monitor vesting obligations across a portfolio. Flag upcoming unlocks, track claimed amounts, and generate structured reports for investors or regulators.",
                tags: ["Compliance flags", "Audit trail", "Structured export"],
              },
              {
                icon: "⚙️",
                title: "DeFi Protocol Integrations",
                description: "Build vesting-aware features into your protocol — show users their locked/claimable balances without reinventing the indexing layer.",
                tags: ["REST API", "Bearer auth", "Rate limit headers"],
              },
              {
                icon: "🪙",
                title: "Token Issuers & DAOs",
                description: "Give your team and investors a transparent view of the vesting schedule. No custom dashboard needed — your data is already indexed.",
                tags: ["Team vesting", "Investor tracking", "Unlock calendar"],
              },
            ].map(u => (
              <div key={u.title} className="rounded-2xl p-6"
                style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="text-2xl mb-4">{u.icon}</div>
                <h3 className="font-bold text-base mb-2" style={{ color: "white" }}>{u.title}</h3>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>{u.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {u.tags.map(t => (
                    <span key={t} className="text-xs px-2 py-1 rounded-md font-medium"
                      style={{ background: "rgba(37,99,235,0.12)", color: "#60a5fa", border: "1px solid rgba(37,99,235,0.25)" }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MCP callout ── */}
      <section className="px-4 md:px-8 py-16 md:py-20">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-3xl p-10 relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0d1b3e 0%, #1a0e40 100%)", boxShadow: "0 24px 64px rgba(15,23,42,0.18)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "28px 28px"
            }} />
            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-5"
                  style={{ background: "rgba(99,102,241,0.15)", borderColor: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#6366f1" }} />
                  MCP Server included
                </div>
                <h2 className="font-bold text-2xl mb-3 tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
                  Works natively with Claude and any MCP-compatible agent
                </h2>
                <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Add Vestream to any AI agent in seconds. Our MCP server exposes three tools —
                  get vestings, upcoming unlocks, and stream details — that agents call natively
                  without any custom glue code.
                </p>
                <div className="rounded-xl p-4 font-mono text-xs leading-relaxed"
                  style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.07)", color: "#94a3b8" }}>
                  {/* Inline JSON snippet — wrapping the raw ASCII comment in a JSX expression
                      prevents eslint's react/jsx-no-comment-textnodes rule from mistaking it
                      for a misplaced JS comment, and escaping the quotes satisfies
                      react/no-unescaped-entities. */}
                  <span style={{ color: "#475569" }}>{"// Claude Desktop config"}</span>{"\n"}
                  <span style={{ color: "#6366f1" }}>{'"mcpServers"'}</span>
                  {": { "}<span style={{ color: "#6366f1" }}>{'"vestream"'}</span>{": {"}{"\n"}
                  {"  "}<span style={{ color: "#6366f1" }}>{'"command"'}</span>
                  {": "}<span style={{ color: "#10b981" }}>{'"npx"'}</span>{","}{"\n"}
                  {"  "}<span style={{ color: "#6366f1" }}>{'"args"'}</span>
                  {": ["}<span style={{ color: "#10b981" }}>{'"-y"'}</span>{", "}<span style={{ color: "#10b981" }}>{'"@vestream/mcp"'}</span>{"],"}{"\n"}
                  {"  "}<span style={{ color: "#6366f1" }}>{'"env"'}</span>
                  {": { "}<span style={{ color: "#6366f1" }}>{'"VESTREAM_API_KEY"'}</span>
                  {": "}<span style={{ color: "#10b981" }}>{'"vstr_live_..."'}</span>{" }"}{"\n"}
                  {" } }"}
                </div>
              </div>
              <div className="flex-shrink-0 hidden xl:block">
                <div className="w-32 h-32 rounded-3xl flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <svg width={52} height={52} viewBox="0 0 52 52" fill="none">
                    <path d="M26 6L44 16.5V35.5L26 46L8 35.5V16.5L26 6Z"
                      stroke="rgba(165,180,252,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M26 14L38 20.5V33.5L26 40L14 33.5V20.5L26 14Z"
                      fill="rgba(99,102,241,0.15)" stroke="rgba(165,180,252,0.4)" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="26" cy="27" r="5" fill="rgba(165,180,252,0.6)" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="px-4 md:px-8 py-16 md:py-20" style={{ background: "#122040", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Pricing</p>
            <h2 className="font-bold text-3xl tracking-tight" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Simple, transparent access
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Free */}
            <div className="rounded-2xl p-8"
              style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#4b5563" }}>Free</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "white", letterSpacing: "-0.03em" }}>$0</span>
                <span className="text-sm" style={{ color: "#4b5563" }}>/month</span>
              </div>
              <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>For builders and prototyping</p>
              <ul className="flex flex-col gap-3 mb-8">
                {["1,000 API requests / month", "All 3 endpoints", "5 protocols indexed", "Standard JSON responses", "Community support"].map(f => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check />
                    <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="#request-access"
                className="block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all"
                style={{ background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.3)", color: "#60a5fa" }}>
                Request Access
              </a>
            </div>

            {/* Pro */}
            <div className="rounded-2xl p-8 relative"
              style={{ background: "#0a1628", border: "2px solid #2563eb", boxShadow: "0 8px 32px rgba(37,99,235,0.25)" }}>
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}>
                  Most popular
                </span>
              </div>
              <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#60a5fa" }}>Pro</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-bold tracking-tight" style={{ color: "white", letterSpacing: "-0.03em" }}>Custom</span>
              </div>
              <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>For production applications</p>
              <ul className="flex flex-col gap-3 mb-8">
                {["100,000+ API requests / month", "All 3 endpoints", "5 protocols · 6 chains", "Priority response SLA", "Dedicated support", "Custom rate limits on request", "Early access to new endpoints"].map(f => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check />
                    <span className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>{f}</span>
                  </li>
                ))}
              </ul>
              <a href="#request-access"
                className="block w-full text-center py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}>
                Request Pro Access
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Request access form ── */}
      <section id="request-access" className="px-4 md:px-8 py-16 md:py-24" style={{ background: "#0a1628", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#94a3b8" }}>Get started</p>
            <h2 className="font-bold text-3xl tracking-tight mb-3" style={{ color: "white", letterSpacing: "-0.02em" }}>
              Request API access
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              Tell us what you&apos;re building and we&apos;ll send your API key within 1–2 business days.
              Every application is reviewed — we&apos;re keeping early access intentional.
            </p>
          </div>

          <div className="rounded-2xl p-8"
            style={{ background: "#122040", border: "1px solid rgba(255,255,255,0.08)" }}>
            <ApiAccessForm />
          </div>

          <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.3)" }}>
            Already have an API key?{" "}
            <Link href="/developer/portal" className="font-semibold transition-colors hover:opacity-80" style={{ color: "#60a5fa" }}>
              Access the docs →
            </Link>
          </p>
        </div>
      </section>

      <SiteFooter theme="navy" recessed />
    </div>
  );
}
