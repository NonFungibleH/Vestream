import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { CopyableCode } from "@/components/CopyableCode";

// 2026-05-17 SEO/AI-search pass: previously this page only exported title +
// description, missing OG/Twitter cards + canonical. That meant share links
// rendered with the root-layout fallback (generic homepage card) and search
// engines had no per-page canonical, which can dilute /ai's ranking signal
// into the homepage's. Aligned with /developer's metadata shape — same
// pattern, theme-specific copy.
export const metadata = {
  title: "AI Agents — Vestream",
  description:
    "The vesting data layer for AI agents. Native MCP support for Claude, Cursor, and any MCP-compatible agent — query token vesting streams in natural language.",
  alternates: { canonical: "https://vestream.io/ai" },
  openGraph: {
    title:       "AI Agents — Vestream",
    description: "The vesting data layer for AI agents. Native MCP support for Claude, Cursor, and any MCP-compatible agent — query token vesting streams in natural language.",
    url:         "https://vestream.io/ai",
    siteName:    "Vestream",
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image" as const,
    title:       "AI Agents — Vestream",
    description: "The vesting data layer for AI agents. Native MCP support for Claude, Cursor, and any MCP-compatible agent — query token vesting streams in natural language.",
  },
};

// ── Showcase card: a single "user → agent" conversation snippet ─────────────
function ShowcaseCard({ user, agent }: { user: string; agent: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>
          You
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
          {user}
        </p>
      </div>
      <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#1CB8B8" }}>
          Claude · via Vestream MCP
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
          {agent}
        </p>
      </div>
    </div>
  );
}

// ── Reusable styled code block ────────────────────────────────────────────────
function Code({ children }: { children: string }) {
  return (
    <pre
      className="rounded-xl p-3 sm:p-5 text-[11px] sm:text-xs leading-relaxed overflow-x-auto"
      style={{
        background: "#080a10",
        border: "1px solid rgba(255,255,255,0.06)",
        color: "#a5f3fc",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        whiteSpace: "pre",
        // iOS smooth-scroll for the horizontal overflow.
        WebkitOverflowScrolling: "touch",
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
      className="rounded-2xl p-4 sm:p-6 flex flex-col gap-4 sm:gap-5 min-w-0"
      style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(28,184,184,0.15)", color: "#1CB8B8" }}
          >
            tool
          </span>
          <code className="text-sm font-bold break-all" style={{ color: "white" }}>{name}</code>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{description}</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>Parameters</p>
        <div className="flex flex-col gap-1.5">
          {params.map((p) => (
            // flex-wrap so the parameter row reflows cleanly on narrow
            // screens — `desc` was overflowing horizontally previously.
            <div key={p.name} className="flex items-start gap-2 text-xs flex-wrap">
              <code style={{ color: "#1CB8B8", flexShrink: 0 }}>{p.name}</code>
              <span style={{ color: "#4b5563", flexShrink: 0 }}>{p.type}</span>
              {!p.required && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "#6b7280", flexShrink: 0 }}>optional</span>}
              <span style={{ color: "rgba(255,255,255,0.35)", minWidth: 0, flex: "1 1 100%" }}>{p.desc}</span>
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
    <div className="min-h-screen overflow-x-hidden flex flex-col" style={{ background: "#0d0f14", color: "white" }}>
      <SiteNav theme="dark" />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-40 md:pb-28 px-4 md:px-8 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(15,138,138,0.14) 0%, transparent 70%)",
        }} />
        <div className="absolute top-0 left-0 right-0 h-px" style={{
          background: "linear-gradient(90deg, transparent, rgba(15,138,138,0.5), transparent)",
        }} />

        <div className="relative max-w-4xl mx-auto">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold mb-8"
            style={{ background: "rgba(15,138,138,0.08)", borderColor: "rgba(15,138,138,0.25)", color: "#1CB8B8" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#1CB8B8" }} />
            MCP · REST · AI-native
          </div>

          <h1
            className="font-bold tracking-tight mb-6"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.75rem)", lineHeight: 1.08, letterSpacing: "-0.03em" }}
          >
            The vesting data layer<br />
            <span style={{
              color: "#1CB8B8",
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
              style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 20px rgba(15,138,138,0.3)" }}
            >
              Get an API key →
            </Link>
            <Link
              href="/api-docs"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "rgba(15,138,138,0.1)", border: "1px solid rgba(15,138,138,0.3)", color: "#1CB8B8" }}
            >
              View API docs →
            </Link>
          </div>

          {/* Stats strip — on mobile, 5 items in a 2-col grid leaves a
              dangling 5th item taking the full width, which reads as
              broken layout. We use a 3-col mobile grid (so 5 items reflow
              as 3+2 — visibly intentional) and switch to flex on sm+
              where horizontal space allows the natural row. */}
          <div className="grid grid-cols-3 sm:flex sm:items-center sm:justify-center gap-x-4 sm:gap-x-6 gap-y-5 sm:gap-8 mt-10 sm:mt-14 sm:flex-wrap">
            {[
              { value: "9",      label: "Protocols indexed" },
              { value: "5",      label: "Chains (EVM + Solana)"  },
              { value: "3 + 3",  label: "Tools (Free + Pro)" },
              { value: "MCP",    label: "Native support"    },
              { value: "REST",   label: "API available"     },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-bold text-xl sm:text-2xl tracking-tight" style={{ letterSpacing: "-0.02em" }}>{s.value}</div>
                <div className="text-[11px] sm:text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What is MCP? ──────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div
          className="rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start gap-6"
          style={{ background: "#141720", border: "1px solid rgba(15,138,138,0.15)" }}
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(15,138,138,0.15)", color: "#1CB8B8" }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "#1CB8B8" }}>What is MCP?</p>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              The <strong style={{ color: "white" }}>Model Context Protocol</strong> (MCP) is an open standard by Anthropic that lets AI agents call external tools natively — without writing API glue code.
              Install <code style={{ color: "#1CB8B8" }}>@vestream/mcp</code> and your agent can query vesting data the same way it reasons about anything else: in natural language.
            </p>
          </div>
        </div>
      </section>

      {/* ── MCP Tools ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-6">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>MCP Tools</p>
          <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Three free tools, three Pro webhook tools.</h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
            Install the MCP server and your agent immediately has read access to every wallet, stream, and
            upcoming unlock on the free tier — plus webhook subscription management on Pro.
          </p>
        </div>

        {/* What's-new ribbon for the v1.2 webhook tools. Sits between the
            section heading and the tool cards so it reads as a release
            note, not a separate marketing block. */}
        <div className="max-w-3xl mx-auto mb-10 rounded-2xl px-5 py-4 flex items-start gap-4"
          style={{ background: "linear-gradient(135deg, rgba(28,184,184,0.08), rgba(15,138,138,0.04))",
                   border: "1px solid rgba(28,184,184,0.25)" }}>
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md"
            style={{ background: "#1CB8B8", color: "white" }}>
            v1.2
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold mb-1" style={{ color: "white" }}>
              Webhook subscriptions are now an MCP tool
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Three new tools — <code className="font-mono px-1 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#1CB8B8" }}>list_webhook_subscriptions</code>,
              {" "}<code className="font-mono px-1 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#1CB8B8" }}>create_webhook_subscription</code>,
              {" "}<code className="font-mono px-1 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#1CB8B8" }}>delete_webhook_subscription</code>{" "}
              — let your agent set up server-to-server alerts the moment a matching unlock fires. HMAC-signed,
              filterable by wallet / protocol / chain. Pro tier. Update with <code className="font-mono">npx -y @vestream/mcp@latest</code>.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <ToolCard
            name="get_wallet_vestings"
            description="Get all token vesting streams for a wallet (EVM or Solana) across all 9 supported protocols and 7 chains. Returns normalised data: token, locked/claimable/withdrawn amounts, schedule dates, cliff time, and next unlock."
            params={[
              { name: "address", type: "string", required: true,  desc: "Wallet address — EVM 0x… or Solana base58 pubkey" },
              { name: "protocol", type: "string", required: false, desc: "Filter by protocol: sablier, hedgey, uncx, unvest, team-finance, superfluid, pinksale, streamflow, jupiter-lock" },
              { name: "chain",   type: "string", required: false, desc: "Filter by chain ID: 1 (Ethereum), 56 (BSC), 137 (Polygon), 8453 (Base), 101 (Solana)" },
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
              { name: "address", type: "string",  required: true,  desc: "Wallet address — EVM 0x… or Solana base58 pubkey" },
              { name: "days",    type: "number",  required: false, desc: "Lookahead window in days (default: 30, max: 365)" },
              { name: "protocol", type: "string", required: false, desc: "Filter by protocol (any of the 9 protocols above)" },
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

          {/* ── v1.2 — webhook tools (Pro tier) ────────────────────────── */}
          <ToolCard
            name="list_webhook_subscriptions"
            description="Pro tier. List the webhook subscriptions registered to the caller's API key. Each subscription describes a URL Vestream POSTs to when a matching upcoming-unlock fires."
            params={[]}
            example={`list_webhook_subscriptions({})`}
          />

          <ToolCard
            name="create_webhook_subscription"
            description="Pro tier. Register a new webhook subscription. Returns the signing secret ONCE — store it for HMAC verification. Vestream POSTs to the URL with X-Vestream-Signature on each matching event."
            params={[
              { name: "url",             type: "string",  required: true,  desc: "Destination URL (https in production)" },
              { name: "wallet_filter",   type: "array",   required: false, desc: "Restrict to these wallet addresses" },
              { name: "protocol_filter", type: "array",   required: false, desc: "Restrict to these protocols (slug list)" },
              { name: "chain_filter",    type: "array",   required: false, desc: "Restrict to these chain IDs" },
              { name: "hours_before",    type: "number",  required: false, desc: "Lookahead window in hours (1-168, default 24)" },
            ]}
            example={`create_webhook_subscription({
  url: "https://your.app/webhooks/vestream",
  protocol_filter: ["sablier", "streamflow"],
  hours_before: 6
})`}
          />

          <ToolCard
            name="delete_webhook_subscription"
            description="Pro tier. Permanently delete a webhook subscription by its UUID. Use list_webhook_subscriptions to discover IDs."
            params={[
              { name: "subscription_id", type: "string", required: true, desc: "UUID returned by list_webhook_subscriptions" },
            ]}
            example={`delete_webhook_subscription({
  subscription_id: "9c8e..."
})`}
          />
        </div>
      </section>

      {/* ── Example agent conversation ─────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>In action</p>
          <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>Your agent, asking the right questions</h2>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Terminal bar */}
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3" style={{ background: "#0a0c12", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" style={{ background: "#B3322E" }} />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" style={{ background: "#F0992E" }} />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0" style={{ background: "#2DB36A" }} />
            <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
              {/* Shorter on mobile so it doesn't crowd the traffic lights. */}
              <span className="sm:hidden">Vestream MCP</span>
              <span className="hidden sm:inline">Claude · Vestream MCP connected</span>
            </span>
          </div>

          <div className="p-3 sm:p-6 flex flex-col gap-4 sm:gap-5" style={{ background: "#0d0f14" }}>
            {/* User message */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: "rgba(28,184,184,0.2)", color: "#1CB8B8" }}>U</div>
              <div className="rounded-2xl rounded-tl-sm px-3 sm:px-4 py-2.5 sm:py-3 text-sm min-w-0" style={{ background: "#1e2330", color: "white", maxWidth: "85%" }}>
                Check wallet 0x3f5CE96...8b2e for any token unlocks in the next 14 days. Summarise the total USD value and which protocols are involved.
              </div>
            </div>

            {/* Tool call — ml-10 on desktop indents under the user avatar for
                visual hierarchy. On mobile that wastes scarce horizontal
                space for no reading benefit, so we drop the indent. */}
            <div className="ml-0 sm:ml-10">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: "rgba(15,138,138,0.15)", color: "#1CB8B8" }}>
                  → calling tool
                </span>
                <code className="text-xs break-all" style={{ color: "rgba(255,255,255,0.4)" }}>get_upcoming_unlocks</code>
              </div>
              <Code>{`{
  "address": "0x3f5CE96daD0cf8781AB329C5af6D6595beEf9A26",
  "days": 14
}`}</Code>
            </div>

            {/* Tool response */}
            <div className="ml-0 sm:ml-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: "rgba(45,179,106,0.1)", color: "#34d399" }}>
                  ← result
                </span>
              </div>
              <Code>{`{
  "unlocks": [
    {
      "date": "2026-05-02",
      "token": "NOVA",
      "amount_usd": 18420.00,
      "protocol": "sablier",
      "chain": "base",
      "type": "cliff"
    },
    {
      "date": "2026-05-08",
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
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center" style={{ background: "#1CB8B8" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div className="rounded-2xl rounded-tl-sm px-3 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed min-w-0" style={{ background: "#141720", color: "rgba(255,255,255,0.85)", maxWidth: "85%" }}>
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
          <h2 className="text-2xl md:text-3xl font-bold mb-3" style={{ letterSpacing: "-0.02em" }}>Add to your agent in 60 seconds</h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)" }}>
            No SDK to install. No API glue code. Just add to your config and start querying.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Claude Desktop */}
          <div className="rounded-2xl p-6" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#1CB8B8" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <span className="text-sm font-semibold">Claude Desktop</span>
              <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>claude_desktop_config.json</span>
            </div>
            <CopyableCode
              code={`{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": {
        "VESTREAM_API_KEY": "vstr_live_..."
      }
    }
  }
}`}
            />
          </div>

          {/* Cursor / other */}
          <div className="rounded-2xl p-6" style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: "rgba(255,255,255,0.07)", color: "white" }}>C</div>
              <span className="text-sm font-semibold">Cursor / Windsurf</span>
              <span className="ml-auto text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>.cursor/mcp.json</span>
            </div>
            <CopyableCode
              code={`{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": {
        "VESTREAM_API_KEY": "vstr_live_..."
      }
    }
  }
}`}
            />
          </div>
        </div>

        {/* Get-key CTA + quickstart link — replaces the previous "from the
            developer portal" tail copy. The portal is for returning users;
            new visitors want a key, fast. */}
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/developer#request-access"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 16px rgba(28,184,184,0.3)" }}
          >
            Get a free API key →
          </Link>
          <Link
            href="/developer/quickstart"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.7)" }}
          >
            Full quickstart guide
          </Link>
        </div>
      </section>

      {/* ── Real conversations / showcase reel ─────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-24 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            What it looks like in practice
          </p>
          <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>
            Real conversations
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ShowcaseCard
            user='Show me everything vesting for vitalik.eth.'
            agent='Found 3 active streams across 2 protocols on Ethereum. The largest is a Sablier linear vesting of 8,500 USDC running until Sept 2026 (≈ 14% vested). Next unlock event: a Hedgey tranche on May 14 unlocking ~12,000 OP. Want the full schedule?'
          />
          <ShowcaseCard
            user='When should I claim my APE before the next cliff?'
            agent='Your Sablier APE stream has a cliff completing in 6 days, releasing ~4,200 APE. Gas is currently 23 gwei; predicted to drop to ~14 gwei overnight. Recommend claiming after midnight UTC — you save roughly $18 in gas at current prices.'
          />
          <ShowcaseCard
            user="What's unlocking across my 3 wallets in the next 30 days?"
            agent='12 unlock events across 3 wallets — total locked value coming online: $63,418. Biggest single event: a UNCX cliff on May 9 (28% of the total). Want me to draft a calendar export or set up a watch on the day before each?'
          />
        </div>
        <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.35)" }}>
          Sample exchanges, lightly edited. Set up your own in a Claude Desktop chat in 60 seconds.
        </p>
      </section>

      {/* ── Use cases ─────────────────────────────────────────────────────── */}
      <section className="px-4 md:px-8 pb-16 md:pb-28 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Use cases</p>
          <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>What agents build with Vestream</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
              color: "#0F8A8A", bg: "rgba(15,138,138,0.1)", border: "rgba(15,138,138,0.2)",
              title: "Unlock alert agents",
              body: "Monitor wallets 24/7 and ping Slack, Telegram, or email the moment a cliff or tranche unlock is due — before you'd normally even check.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
              color: "#1CB8B8", bg: "rgba(28,184,184,0.1)", border: "rgba(28,184,184,0.2)",
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
              color: "#0BA0CB", bg: "rgba(11,160,203,0.1)", border: "rgba(11,160,203,0.2)",
              title: "Compliance & reporting agents",
              body: "Generate audit-ready vesting reports for any wallet or team — cliff dates, tranches, claimed amounts — structured and exportable on demand.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
              color: "#F0992E", bg: "rgba(240,153,46,0.1)", border: "rgba(240,153,46,0.2)",
              title: "DeFi strategy agents",
              body: "Combine upcoming unlock data with on-chain prices to automatically evaluate whether to hold, hedge, or exit a position as vesting cliffs approach.",
            },
            {
              icon: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
              color: "#F0992E", bg: "rgba(240,153,46,0.1)", border: "rgba(240,153,46,0.2)",
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
          <h2 className="text-2xl md:text-3xl font-bold" style={{ letterSpacing: "-0.02em" }}>Available where you build</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              label: "npm",
              name: "@vestream/mcp",
              desc: "Install via npx — no global install required. Works anywhere Node.js runs.",
              cmd: "npx -y @vestream/mcp",
              color: "#F0992E",
            },
            {
              label: "MCP Registry",
              name: "modelcontextprotocol/servers",
              desc: "Listed in the official Anthropic MCP server registry for Claude users.",
              cmd: "github.com/modelcontextprotocol/servers",
              color: "#0F8A8A",
            },
            {
              label: "Smithery",
              name: "smithery.ai",
              desc: "Discoverable in the Smithery MCP marketplace for agent builders.",
              cmd: "smithery.ai/server/vestream",
              color: "#1CB8B8",
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
          style={{ background: "linear-gradient(135deg, #1A1D20 0%, #0F8A8A 100%)", border: "1px solid rgba(15,138,138,0.2)" }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(15,138,138,0.15) 0%, transparent 70%)",
          }} />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ letterSpacing: "-0.02em" }}>Ready to give your agent vesting superpowers?</h2>
            <p className="text-base mb-8 max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              Get an API key, add the MCP server to your config, and start querying on-chain vesting data in minutes.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                href="/developer"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                style={{ background: "#1CB8B8", color: "white", boxShadow: "0 4px 24px rgba(15,138,138,0.35)" }}
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
