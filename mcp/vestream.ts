#!/usr/bin/env node
/**
 * Vestream MCP Server
 *
 * Exposes Vestream's vesting data API as native tools for AI agents
 * (Claude, Cursor, Windsurf, LangChain, etc.) via the Model Context Protocol.
 *
 * Usage — add to your Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "vestream": {
 *       "command": "npx",
 *       "args": ["-y", "@vestream/mcp"],
 *       "env": { "VESTREAM_API_KEY": "vstr_live_..." }
 *     }
 *   }
 * }
 */

import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                  from "zod";

const BASE_URL = process.env.VESTREAM_API_URL ?? "https://vestream.io/api/v1";
const API_KEY  = process.env.VESTREAM_API_KEY ?? "";

if (!API_KEY) {
  console.error("[vestream-mcp] ERROR: VESTREAM_API_KEY environment variable is required.");
  process.exit(1);
}

// ─── API helper ───────────────────────────────────────────────────────────────
//
// Wraps fetch with: 30s timeout (so a dead endpoint doesn't hang the MCP host
// indefinitely), and a small classifier on the error path that turns raw HTTP
// status codes into messages the agent can actually reason about ("you're
// rate-limited, retry in 12s" beats "Vestream API error 429"). Mapped codes:
//   401 — invalid / missing key             → tells the user how to get one
//   402 — Pro-only endpoint                 → flags the upgrade path
//   403 — revoked / disabled key            → distinct from typo'd 401
//   404 — wallet/stream not indexed         → distinguishes "no data" from "bad input"
//   429 — rate limited                      → surfaces Retry-After in seconds
//   5xx — upstream / transient              → tells agents to back off
//
// `Retry-After` is parsed as either an integer (seconds) or an HTTP-date.

async function vstreamFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept:        "application/json",
        "User-Agent":  "vestream-mcp/1.3.0",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(
        "Vestream API did not respond within 30 seconds. The server may be slow or unreachable — try again in a moment.",
      );
    }
    throw new Error(`Could not reach the Vestream API: ${err.message ?? String(e)}`);
  }

  if (res.ok) return res.json();

  // Parse the error body if there is one — falls through to status-only on
  // non-JSON or empty bodies. Never re-throws the JSON parse failure as the
  // primary error.
  const body = await res.json().catch(() => null) as { error?: string; docs?: string } | null;
  const docs = body?.docs ?? "https://vestream.io/api-docs";

  switch (res.status) {
    case 401:
      throw new Error(
        "Your VESTREAM_API_KEY is missing or invalid. Get a free key at vestream.io/developer and " +
        "set it in your MCP client config (the `env.VESTREAM_API_KEY` field).",
      );
    case 402:
      throw new Error(
        "This endpoint is Pro tier only. Upgrade at vestream.io/pricing or contact team@vestream.io.",
      );
    case 403:
      throw new Error(
        "Your API key has been revoked. Generate a new one at vestream.io/developer.",
      );
    case 404:
      throw new Error(
        body?.error ?? "Resource not found. Check that the wallet address or stream ID is correct.",
      );
    case 429: {
      const retryHdr = res.headers.get("Retry-After");
      const retrySecs = parseRetryAfter(retryHdr);
      const inSecs = retrySecs != null ? ` Retry in ${retrySecs}s.` : "";
      throw new Error(
        `Rate limited.${inSecs} Free tier: 30 req/min, 150/day. Pro: 120 req/min, 5,000/day. See ${docs}.`,
      );
    }
    default: {
      if (res.status >= 500) {
        throw new Error(
          `Vestream had a server error (HTTP ${res.status}). This is usually transient — try again in a few seconds.`,
        );
      }
      const detail = body?.error ?? res.statusText ?? "Unknown error";
      throw new Error(`Vestream API error ${res.status}: ${detail}`);
    }
  }
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  // RFC 7231: either seconds (integer) or an HTTP-date.
  const asInt = Number(header);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.ceil(asInt);
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    const diff = Math.ceil((asDate - Date.now()) / 1000);
    return diff > 0 ? diff : null;
  }
  return null;
}

// ─── Shared Zod primitives ───────────────────────────────────────────────────
//
// The previous tool definitions accepted any string for `protocol` and any
// number for `days`, so a misbehaving agent could send `days=999999` or
// `protocol=invalid` and only see a backend rejection — opaque to the LLM.
// Constrain at the MCP layer so the model gets a tight schema and the
// backend never sees out-of-range values.

const PROTOCOL_VALUES = [
  "sablier", "hedgey", "uncx", "unvest",
  "superfluid", "pinksale", "streamflow", "jupiter-lock",
] as const;

// Accept comma-separated lists of the canonical slugs above. We don't try
// to enum-validate the comma-separated string at parse time (Zod can't
// elegantly express that); instead we lower-case + filter at the call
// site so unknown slugs are silently dropped.
const protocolFilter = z.string().optional().describe(
  "Comma-separated protocol filter. Valid values: " + PROTOCOL_VALUES.join(", "),
);

function sanitiseProtocolFilter(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const allow = new Set<string>(PROTOCOL_VALUES);
  const kept = raw.split(",").map((s) => s.trim().toLowerCase()).filter((s) => allow.has(s));
  return kept.length > 0 ? kept.join(",") : undefined;
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:    "vestream",
  version: "1.3.0",
});

// ── Tool: get_wallet_vestings ─────────────────────────────────────────────────

server.tool(
  "get_wallet_vestings",
  "Get all token vesting streams for a wallet across every supported protocol " +
  "and chain (including Solana). EVM protocols: Sablier, Hedgey, UNCX, Unvest, " +
  "Superfluid, PinkSale. Solana protocols: Streamflow, Jupiter Lock. " +
  "EVM chains: Ethereum, BSC, Polygon, Base. Non-EVM chains: Solana. " +
  "Returns normalised stream data: token, amounts locked/claimable/withdrawn, " +
  "schedule dates, cliff time, next unlock, and claim history — identical " +
  "JSON shape regardless of source protocol or ecosystem.",
  {
    address: z.string().describe(
      "Wallet address. EVM: 0x-prefixed hex (e.g. '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'). " +
      "Solana: base58-encoded pubkey (e.g. '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')"
    ),
    protocol: protocolFilter,
    chain: z.string().optional().describe(
      "Comma-separated chain ID filter, e.g. '1,101,8453'. " +
      "Supported: 1 (Ethereum), 56 (BSC), 137 (Polygon), 8453 (Base), 101 (Solana)"
    ),
    active_only: z.boolean().optional().describe(
      "If true, only return streams that are not yet fully vested (default: false)"
    ),
    limit: z.number().int().min(1).max(500).optional().describe(
      "Page size, 1–500. Default 100. Use with `offset` to page through wallets " +
      "with hundreds of streams without overflowing your context window."
    ),
    offset: z.number().int().min(0).optional().describe(
      "Zero-indexed page offset. Use the `pagination.next_offset` field from a " +
      "prior response to fetch the next page."
    ),
  },
  async ({ address, protocol, chain, active_only, limit, offset }) => {
    const qs = new URLSearchParams();
    const cleanedProtocol = sanitiseProtocolFilter(protocol);
    if (cleanedProtocol) qs.set("protocol", cleanedProtocol);
    if (chain)           qs.set("chain",    chain);
    if (active_only)     qs.set("active_only", "true");
    if (typeof limit  === "number") qs.set("limit",  String(limit));
    if (typeof offset === "number") qs.set("offset", String(offset));
    const query = qs.toString() ? `?${qs}` : "";

    const data = await vstreamFetch(`/wallet/${address}/vestings${query}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_upcoming_unlocks ────────────────────────────────────────────────

server.tool(
  "get_upcoming_unlocks",
  "Get all upcoming token unlock events for a wallet within a future time window. " +
  "Works for both EVM 0x addresses and Solana base58 pubkeys. Returns cliff " +
  "completions, tranche unlocks, and linear stream endings sorted by date. " +
  "Ideal for forecasting when tokens become available, scheduling claims, or " +
  "building alerts.",
  {
    address: z.string().describe(
      "Wallet address — EVM 0x hex or Solana base58 pubkey"
    ),
    days: z.number().int().min(1).max(365).optional().describe(
      "Lookahead window in days. Default 30, minimum 1, maximum 365."
    ),
    protocol: protocolFilter,
  },
  async ({ address, days, protocol }) => {
    const qs = new URLSearchParams();
    if (days)     qs.set("days",     String(days));
    const cleanedProtocol = sanitiseProtocolFilter(protocol);
    if (cleanedProtocol) qs.set("protocol", cleanedProtocol);
    const query = qs.toString() ? `?${qs}` : "";

    const data = await vstreamFetch(`/wallet/${address}/upcoming-unlocks${query}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: get_stream ──────────────────────────────────────────────────────────

server.tool(
  "get_stream",
  "Get full details for a single vesting stream by its composite ID. " +
  "Stream IDs follow the format: {protocol}-{chainId}-{nativeId}, " +
  "e.g. 'sablier-1-12345' (EVM) or 'streamflow-101-7xKX...' (Solana). " +
  "Use get_wallet_vestings first to discover stream IDs for a wallet.",
  {
    stream_id: z.string().describe(
      "Composite stream ID in format 'protocol-chainId-nativeId', " +
      "e.g. 'sablier-1-12345', 'uncx-8453-99', 'streamflow-101-7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'"
    ),
  },
  async ({ stream_id }) => {
    const data = await vstreamFetch(`/stream/${stream_id}`);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ── Tool: list_webhook_subscriptions ──────────────────────────────────────
//
// Webhook tools wrap the /api/v1/webhooks endpoints — Pro tier only on the
// backend. Lets agents set up "ping this URL when an unlock matching X
// happens" rules without leaving the chat. Subscription state lives in
// Vestream's DB; the MCP host never holds it.

server.tool(
  "list_webhook_subscriptions",
  "List the webhook subscriptions registered to the caller's API key. Pro " +
  "tier only — free-tier keys get a 402 error. Each subscription describes " +
  "a URL Vestream POSTs to when a matching upcoming-unlock event fires.",
  {},
  async () => {
    const data = await vstreamFetch("/webhooks");
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: create_webhook_subscription ──────────────────────────────────────

server.tool(
  "create_webhook_subscription",
  "Register a new webhook subscription. Vestream will POST to the given URL " +
  "every time an upcoming-unlock event matches the optional filters " +
  "(wallet, protocol, chain). Returns the secret ONCE — store it somewhere " +
  "safe; the receiver verifies each payload via the X-Vestream-Signature " +
  "header (HMAC-SHA256 of the raw body using this secret). Pro tier only.",
  {
    url: z.string().describe(
      "Destination URL. Must be https in production. Vestream POSTs JSON to this URL on each matching event.",
    ),
    wallet_filter: z.array(z.string()).optional().describe(
      "Optional list of wallet addresses to scope notifications to. Omit to notify on every match.",
    ),
    protocol_filter: z.array(z.string()).optional().describe(
      "Optional list of protocol slugs (e.g. ['sablier', 'streamflow']).",
    ),
    chain_filter: z.array(z.number().int()).optional().describe(
      "Optional list of chain IDs (e.g. [1, 8453]).",
    ),
    hours_before: z.number().int().min(1).max(168).optional().describe(
      "How many hours before unlock to fire the event. Default 24, range 1–168.",
    ),
  },
  async ({ url, wallet_filter, protocol_filter, chain_filter, hours_before }) => {
    const body = JSON.stringify({
      url,
      wallet_filter,
      protocol_filter,
      chain_filter,
      hours_before,
    });
    const data = await vstreamFetch("/webhooks", { method: "POST", body });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
);

// ── Tool: delete_webhook_subscription ──────────────────────────────────────

server.tool(
  "delete_webhook_subscription",
  "Permanently delete a webhook subscription. Use list_webhook_subscriptions " +
  "first to discover the subscription's id.",
  {
    subscription_id: z.string().describe("The subscription's UUID, e.g. as returned by list_webhook_subscriptions."),
  },
  async ({ subscription_id }) => {
    const data = await vstreamFetch(`/webhooks/${subscription_id}`, { method: "DELETE" });
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  },
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vestream-mcp] Server running on stdio. Waiting for MCP client...");
}

main().catch((err) => {
  console.error("[vestream-mcp] Fatal error:", err);
  process.exit(1);
});
