import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata = {
  title: "AI Agents — Vestream",
  description:
    "The vesting data layer for AI agents. Native MCP support for Claude, Cursor, and any MCP-compatible agent — query token vesting streams in natural language.",
};

// ── Reusable styled code block ────────────────────────────────────────────────
function Code({ children }: { children: string }) {
  return (
    <pre
      className="rounded-xl p-5 text-xs leading-relaxed overflow-x-auto"
      style={{
        background: "#080a10",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "#a5f3fc",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

// ── Tool card ─────────────────────────────────────────────────────────────────
function ToolCard({
  name, description, params, example,
}: {
  name: string;
  description: string;
  params: { name: string; type: string; required: boolean; desc: string }[];
  example: string;
}) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(37,99,235,0.15)", color: "#60a5fa" }}
          >
            tool
          </span>
          <code className="text-sm font-bold" style={{ color: "white" }}>{name}</code>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{description}</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>Parameters</p>
        <div className="flex flex-col gap-1.5">
          {params.map((p) => (
            <div key={p.name} className="flex items-start gap-2 text-xs">
              <code style={{ color: "#a78bfa", flexShrink: 0 }}>{p.name}</code>
              <span style={{ color: "#4b5563", flexShrink: 0 }}>{p.type}</span>
              {!p.required && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "#6b7280", flexShrink: 0 }}>optional</span>}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>Example call</p>
        <Code>{example}</Code>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AiPage() {
  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#0d0f14", color: "white" }}>
      <SiteNav theme="dark" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-40 md:pb-28 px-4 md:px-8 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 70%)",
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)",
        }} />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: "rgba(124,58,237,0.08)", borderColor: "rgba(124,58,237,0.25)", color: "#a78bfa" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#a78bfa" }} />
            MCP · REST · AI-native
          </div>

          <h1
            className="font-bold tracking-tight mb-6"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }}
          >
            The vesting data layer<br />
            <span style={{
              background: "linear-gradient(135deg, #7c3aed 0%, #2563eb 60%, #6366f1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              for AI agents
            </span>
          </h1>

          <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
            Give your AI agent real-time access to on-chain token vesting data — every wallet, every protocol, every chain.
            Query in natural language via MCP, or call the REST API directly.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white", boxShadow: "0 4px 20px rgba(124,58,237,0.3)" }}
            >
              Get an API key →
            </Link>
            <Link
              href="/api-docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}
            >
              View API docs →
            </Link>
          </div>

          {/* Stats strip */}
          <div className="flex items-center justify-center gap-8 mt-14 flex-wrap">
            {[
              { value: "7",      label: "Protocols indexed" },
              { value: "4",      label: "EVM chains"        },
              { value: "3",      label: "MCP tools"         },
              { value: "MCP",    label: "Native support"    },
              { value: "REST",   label: "API available"     },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-bold text-2xl tracking-tight" style={{ letterSpacing: "-0.02em" }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What is MCP? ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start gap-6"
          style={{ background: "#141720", border: "1px solid rgba(124,58,237,0.15)" }}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#a78bfa" }}>What is MCP?</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              The <strong style={{ color: "white" }}>Model Context Protocol</strong> (MCP) is an open standard by Anthropic that lets AI agents call external tools natively — without writing API glue code.
              Install <code style={{ color: "#a78bfa" }}>@vestream/mcp</code> and your agent can query vesting data the same way it reasons about anything else: in natural language.
            </p>
          </div>
        </div>
      </section>

      {/* ── MCP Tools ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>MCP Tools</p>
          <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Three tools. Everything you need.</h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
            Install the MCP server and your agent immediately has access to all of Vestream's vesting data.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <ToolCard
            name="get_wallet_vestings"
            description="Get all token vesting streams for an EVM wallet across all supported protocols and chains. Returns normalised data: token, locked/claimable/withdrawn amounts, schedule dates, cliff time, and next unlock."
            params={[
              { name: "address", type: "string", required: true,  desc: "EVM wallet in 0x format" },
              { name: "protocol", type: "string", required: false, desc: "Filter by protocol: sablier, uncx, hedgey, team-finance, unvest, superfluid, pinksale" },
              { name: "chain",   type: "string", required: false, desc: "Filter by chain ID: 1 (Ethereum), 56 (BSC), 8453 (Base)" },
              { name: "active_only", type: "boolean", required: false, desc: "Only return streams not yet fully vested" },
            ]}
            example={`get_wallet_vestings({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  active_only: true
})`}
          />

          <ToolCard
            name="get_upcoming_unlocks"
            description="Forecast all token unlock events for a wallet within a future time window. Returns cliff completions, tranche unlocks, and linear stream endings sorted by date — ideal for scheduling claims or building alerts."
            params={[
              { name: "address", type: "string",  required: true,  desc: "EVM wallet in 0x format" },
              { name: "days",    type: "number",  required: false, desc: "Lookahead window in days (default: 30, max: 365)" },
              { name: "protocol", type: "string", required: false, desc: "Filter by protocol" },
            ]}
            example={`get_upcoming_unlocks({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  days: 14
})`}
          />

          <ToolCard
            name="get_stream"
            description="Get full details for a single vesting stream by its composite ID. Use get_wallet_vestings first to discover stream IDs, then drill into a specific stream for complete unlock steps and claim history."
            params={[
              { name: "stream_id", type: "string", required: true, desc: "Format: protocol-chainId-nativeId, e.g. 'sablier-1-12345' or 'uncx-8453-99'" },
            ]}
            example={`get_stream({
  stream_id: "sablier-8453-12345"
})`}
          />
        </div>
      </section>

      {/* ── Example agent conversation ─────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>In action</p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>Your agent, asking the right questions</h2>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Terminal bar */}
          <div className="flex items-center gap-2 px-4 py-3" style={{ background: "#0a0c12", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-3 h-3 rounded-full" style={{ background: "#ef4444" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#f59e0b" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#10b981" }} />
            <span className="ml-2 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Claude · Vestream MCP connected</span>
          </div>

          <div className="p-6 flex flex-col gap-5" style={{ background: "#0d0f14" }}>
            {/* User message */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: "rgba(37,99,235,0.2)", color: "#60a5fa" }}>U</div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm" style={{ background: "#1e2330", color: "white", maxWidth: "80%" }}>
                Check wallet 0x3f5CE96...8b2e for any token unlocks in the next 14 days. Summarise the total USD value and which protocols are involved.
              </div>
            </div>

            {/* Tool call */}
            <div className="ml-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>
                  → calling tool
                </span>
                <code className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>get_upcoming_unlocks</code>
              </div>
              <Code>{`{
  "address": "0x3f5CE96daD0cf8781AB329C5af6D6595beEf9A26",
  "days": 14
}`}</Code>
            </div>

            {/* Tool response */}
            <div className="ml-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: "rgba(16,185,129,0.1)", color: "#34d399" }}>
                  ← result
                </span>
              </div>
              <Code>{`{
  "unlocks": [
    {
      "date": "2025-04-02",
      "token": "NOVA",
      "amount_usd": 18420.00,
      "protocol": "sablier",
      "chain": "base",
      "type": "cliff"
    },
    {
      "date": "2025-04-08",
      "token": "FLUX",
      "amount_usd": 4210.50,
      "protocol": "hedgey",
      "chain": "ethereum",
      "type": "tranche"
    }
  ],
  "total_usd": 22630.50,
  "window_days": 14
}`}</Code>
            </div>

            {/* Agent reply */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed" style={{ background: "#141720", color: "rgba(255,255,255,0.85)", maxWidth: "80%" }}>
                You have <strong style={{ color: "white" }}>2 unlock events</strong> in the next 14 days totalling <strong style={{ color: "#34d399" }}>$22,630.50</strong>:<br /><br />
                • <strong style={{ color: "white" }}>$18,420</strong> NOVA on <strong>Base</strong> via Sablier — cliff unlock on Apr 2<br />
                • <strong style={{ color: "white" }}>$4,210</strong> FLUX on <strong>Ethereum</strong> via Hedgey — tranche unlock on Apr 8<br /><br />
                Would you like me to set a reminder or draft a claim strategy?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Quick-start config ────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Setup</p>
          <h2 className="text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em" }}>Add to your agent in 60 seconds</h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)" }}>
            No SDK to install. No API glue code. Just add to your config and start querying.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Claude Desktop */}
          <div className="rounded-2xl p-6" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <span className="text-sm font-semibold">Claude Desktop</span>
              <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>claude_desktop_config.json</span>
            </div>
            <Code>{`{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": {
        "VESTREAM_API_KEY": "vstr_live_..."
      }
    }
  }
}`}</Code>
          </div>

          {/* Cursor / other */}
          <div className="rounded-2xl p-6" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "rgba(255,255,255,0.07)", color: "white" }}>C</div>
              <span className="text-sm font-semibold">Cursor / Windsurf</span>
              <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>.cursor/mcp.json</span>
            </div>
            <Code>{`{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": {
        "VESTREAM_API_KEY": "vstr_live_..."
      }
    }
  }
}`}</Code>
          </div>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: "rgba(255,255,255,0.3)" }}>
          Replace <code style={{ color: "#a78bfa" }}>vstr_live_...</code> with your API key from{" "}
          <Link href="/developer" className="underline" style={{ color: "rgba(255,255,255,0.5)" }}>the developer portal</Link>.
        </p>
      </section>

      {/* ── Use cases ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Use cases</p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>What agents build with Vestream</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
              color: "#7c3aed", bg: "rgba(124,58,237,0.1)", border: "rgba(124,58,237,0.2)",
              title: "Unlock alert agents",
              body: "Monitor wallets 24/7 and ping Slack, Telegram, or email the moment a cliff or tranche unlock is due — before you'd normally even check.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
              color: "#2563eb", bg: "rgba(37,99,235,0.1)", border: "rgba(37,99,235,0.2)",
              title: "Portfolio analysis agents",
              body: "Ask your agent 'what's my total locked value across all my wallets?' and get a structured, cross-protocol breakdown in seconds.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
              color: "#059669", bg: "rgba(5,150,105,0.1)", border: "rgba(5,150,105,0.2)",
              title: "Token intelligence agents",
              body: "Pull the full global vesting schedule for any token — who's unlocking, when, and how much — to model selling pressure before it hits the market.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              color: "#0891b2", bg: "rgba(8,145,178,0.1)", border: "rgba(8,145,178,0.2)",
              title: "Compliance & reporting agents",
              body: "Generate audit-ready vesting reports for any wallet or team — cliff dates, tranches, claimed amounts — structured and exportable on demand.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.2)",
              title: "DeFi strategy agents",
              body: "Combine upcoming unlock data with on-chain prices to automatically evaluate whether to hold, hedge, or exit a position as vesting cliffs approach.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
              color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.2)",
              title: "Wallet app integrations",
              body: "Embed Vestream vesting data inside any product — wallets, portfolio trackers, DAO tools — with a single API call and zero normalisation work.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl p-5" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}>
                {c.icon}
              </div>
              <h3 className="text-sm font-semibold mb-2">{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── npm / registry ────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Find us</p>
          <h2 className="text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>Available where you build</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "npm",
              name: "@vestream/mcp",
              desc: "Install via npx — no global install required. Works anywhere Node.js runs.",
              cmd: "npx -y @vestream/mcp",
              color: "#f97316",
            },
            {
              label: "MCP Registry",
              name: "modelcontextprotocol/servers",
              desc: "Listed in the official Anthropic MCP server registry for Claude users.",
              cmd: "github.com/modelcontextprotocol/servers",
              color: "#7c3aed",
            },
            {
              label: "Smithery",
              name: "smithery.ai",
              desc: "Discoverable in the Smithery MCP marketplace for agent builders.",
              cmd: "smithery.ai/server/vestream",
              color: "#2563eb",
            },
          ].map((r) => (
            <div key={r.label} className="rounded-2xl p-6" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                  style={{ background: r.color + "20", color: r.color, border: `1px solid ${r.color}30` }}>
                  {r.label}
                </span>
              </div>
              <p className="text-sm font-semibold mb-2">{r.name}</p>
              <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>{r.desc}</p>
              <code className="text-xs block truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{r.cmd}</code>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-3xl p-8 md:p-12 text-center relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1a1040 0%, #0f1525 100%)", border: "1px solid rgba(124,58,237,0.2)" }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 70%)",
          }} />
          <div className="relative">
            <h2 className="text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Ready to give your agent vesting superpowers?</h2>
            <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              Get an API key, add the MCP server to your config, and start querying on-chain vesting data in minutes.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/developer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white", boxShadow: "0 4px 24px rgba(124,58,237,0.35)" }}
              >
                Get an API key →
              </Link>
              <Link
                href="/api-docs"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
              >
                Browse API docs →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter theme="dark" recessed />
    </div>
  );
}
