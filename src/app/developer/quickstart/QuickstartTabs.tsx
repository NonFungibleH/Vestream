"use client";

import { useState } from "react";

type Tab = "claude" | "cursor" | "chatgpt";

const MCP_CONFIG_JSON = `{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": { "TOKENVEST_API_KEY": "vstr_live_..." }
    }
  }
}`;

const CLAUDE_PATHS = {
  macos:   "~/Library/Application Support/Claude/claude_desktop_config.json",
  windows: "%APPDATA%\\Claude\\claude_desktop_config.json",
  linux:   "~/.config/Claude/claude_desktop_config.json",
};

export function QuickstartTabs() {
  const [tab, setTab] = useState<Tab>("claude");

  return (
    <div>
      {/* Tab strip */}
      <div className="flex items-center gap-1 mb-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <TabButton label="Claude Desktop" active={tab === "claude"}  onClick={() => setTab("claude")} />
        <TabButton label="Cursor / Windsurf" active={tab === "cursor"}  onClick={() => setTab("cursor")} />
        <TabButton label="ChatGPT" active={tab === "chatgpt"} onClick={() => setTab("chatgpt")} />
      </div>

      {/* Tab body */}
      {tab === "claude"  && <ClaudeTab />}
      {tab === "cursor"  && <CursorTab />}
      {tab === "chatgpt" && <ChatGPTTab />}
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────

function ClaudeTab() {
  return (
    <div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
        Open <strong style={{ color: "white" }}>claude_desktop_config.json</strong> at the path for your OS and merge in
        the snippet below. If the file doesn&rsquo;t exist, create it.
      </p>

      <div className="rounded-xl mb-4 overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <ConfigPathRow os="macOS"   path={CLAUDE_PATHS.macos} />
        <ConfigPathRow os="Windows" path={CLAUDE_PATHS.windows} />
        <ConfigPathRow os="Linux"   path={CLAUDE_PATHS.linux} last />
      </div>

      <CodeBlock label="MCP config" code={MCP_CONFIG_JSON} />

      <p className="text-xs leading-relaxed mt-4" style={{ color: "rgba(255,255,255,0.45)" }}>
        Replace <code className="font-mono" style={{ color: "#1CB8B8" }}>vstr_live_...</code> with your key, then{" "}
        <strong style={{ color: "white" }}>fully quit and reopen</strong> Claude Desktop. The three TokenVest tools
        appear in the tools tray of any new chat.
      </p>
    </div>
  );
}

function CursorTab() {
  return (
    <div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
        Cursor and Windsurf both speak MCP over stdio with the same JSON shape as Claude Desktop. Add TokenVest via
        Settings → MCP servers (the menu path varies slightly by version).
      </p>

      <CodeBlock label="MCP server entry" code={`{
  "vestream": {
    "command": "npx",
    "args": ["-y", "@vestream/mcp"],
    "env": { "TOKENVEST_API_KEY": "vstr_live_..." }
  }
}`} />

      <p className="text-xs leading-relaxed mt-4" style={{ color: "rgba(255,255,255,0.45)" }}>
        Restart the editor after saving. The first agent call to a TokenVest tool will trigger
        <code className="font-mono mx-1" style={{ color: "#1CB8B8" }}>npx</code>
        downloading the package; subsequent calls reuse the cached install (~50 ms cold start).
      </p>
    </div>
  );
}

function ChatGPTTab() {
  return (
    <div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.65)" }}>
        ChatGPT doesn&rsquo;t speak MCP natively yet. Use a <strong style={{ color: "white" }}>Custom GPT Action</strong>{" "}
        pointed at our OpenAPI spec — same three endpoints, native function-calling.
      </p>

      <ol className="text-sm space-y-3 mb-4 pl-5" style={{ color: "rgba(255,255,255,0.7)", listStyle: "decimal" }}>
        <li>Open <a href="https://chatgpt.com/gpts/editor" className="underline" style={{ color: "#1CB8B8" }}>ChatGPT GPT Editor</a> and create a new GPT (or open an existing one).</li>
        <li>In the <strong style={{ color: "white" }}>Configure</strong> tab, scroll to <strong style={{ color: "white" }}>Actions</strong> → <strong style={{ color: "white" }}>Create new action</strong>.</li>
        <li>
          Click <strong style={{ color: "white" }}>Import from URL</strong> and paste:
          <CodeBlock label="OpenAPI URL" code="https://vestream.io/openapi.json" inline />
        </li>
        <li>
          Authentication → <strong style={{ color: "white" }}>API Key</strong> → <strong style={{ color: "white" }}>Auth Type: Bearer</strong>.
          Paste your <code className="font-mono" style={{ color: "#1CB8B8" }}>vstr_live_…</code> key.
        </li>
        <li>Save the GPT. The three TokenVest endpoints show up as native tool calls.</li>
      </ol>

      <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
        ChatGPT Pro and Free both support Custom GPTs (with usage caps on Free). Once OpenAI ships native MCP support,
        we&rsquo;ll publish a single-step option here.
      </p>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm font-semibold transition-colors"
      style={{
        color:        active ? "#1CB8B8" : "rgba(255,255,255,0.5)",
        borderBottom: active ? "2px solid #1CB8B8" : "2px solid transparent",
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  );
}

function ConfigPathRow({ os, path, last = false }: { os: string; path: string; last?: boolean }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5"
      style={{
        background:    "#0a1628",
        borderBottom:  last ? "none" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span className="text-[10px] uppercase tracking-widest font-bold flex-shrink-0 w-16" style={{ color: "#1CB8B8" }}>
        {os}
      </span>
      <code className="text-xs font-mono break-all" style={{ color: "rgba(255,255,255,0.75)" }}>
        {path}
      </code>
    </div>
  );
}

function CodeBlock({ label, code, inline = false }: { label: string; code: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard refused */ }
  }
  return (
    <div className={inline ? "mt-2" : ""}>
      {!inline && (
        <p className="text-[10px] uppercase tracking-widest font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </p>
      )}
      <div className="relative rounded-xl overflow-hidden"
        style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.08)" }}>
        <pre className="text-xs font-mono p-4 overflow-x-auto" style={{ color: "rgba(255,255,255,0.85)" }}>
{code}
        </pre>
        <button
          onClick={copy}
          type="button"
          className="absolute top-2 right-2 text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
          style={{
            background: copied ? "rgba(45,179,106,0.15)" : "rgba(28,184,184,0.12)",
            color:      copied ? "#2DB36A" : "#1CB8B8",
            border:     copied ? "1px solid rgba(45,179,106,0.30)" : "1px solid rgba(28,184,184,0.30)",
          }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
