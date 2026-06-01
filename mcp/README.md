# `@vestream/mcp`

> MCP server for [Vestream](https://vestream.io) — give your AI agent live token-vesting data across 9 protocols and 5 chains.

> ### ✅ Official package
> The only official Vestream MCP server is published as **`@vestream/mcp`** under the `vestream` npm org, with builds signed via [npm provenance](https://docs.npmjs.com/generating-provenance-statements). Any package with a different scope or name (`vestream-mcp`, `vestream-data`, `@anything-else/vestream*`, etc.) is unofficial and may proxy your API key to a third party. Verify the provenance badge on the [npm page](https://www.npmjs.com/package/@vestream/mcp) before installing.

This package is a tiny [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the Vestream REST API as native tools for any MCP-compatible client (Claude Desktop, Cursor, Windsurf, ChatGPT desktop, LangChain, CrewAI, custom). Plug it in, point your agent at your wallet, and ask things like "what unlocks for me in March?" or "which of my positions has the highest sell pressure next week?".

---

## What you get

Six tools, all schema-validated:

| Tool | Tier | What it does |
|---|---|---|
| `get_wallet_vestings` | Free | Every active and historical vesting stream for a wallet across all supported protocols + chains. EVM (`0x…`) and Solana (base58 pubkey) addresses both work. Paginated 1–500 per call. |
| `get_upcoming_unlocks` | Free | Forecast every unlock event in the next N days for a wallet, sorted by date. Cliff completions, tranche unlocks, linear stream completions — all in one feed. |
| `get_stream` | Free | Full detail for a single stream by its composite ID (`{protocol}-{chainId}-{nativeId}`). Use this after `get_wallet_vestings` to drill in. |
| `list_webhook_subscriptions` | **Pro** | List your webhook subscriptions — URLs Vestream POSTs to when a matching unlock fires. |
| `create_webhook_subscription` | **Pro** | Register a new webhook with optional filters (wallet, protocol, chain) and a lookahead window. Returns a signing secret once — store it for HMAC verification. **Cap: 50 active subscriptions per API key** — delete unused ones with `delete_webhook_subscription`. |
| `delete_webhook_subscription` | **Pro** | Remove a subscription by id. |

Supported **protocols**: Sablier · Hedgey · UNCX · Unvest · Superfluid · PinkSale · Streamflow · Jupiter Lock.

Supported **chains**: Ethereum (`1`) · BNB Chain (`56`) · Polygon (`137`) · Base (`8453`) · Solana (`101`).

---

## Install

You don't need to install anything ahead of time — most MCP clients run the server on demand via `npx`.

You **do** need a Vestream API key. Request one at [vestream.io/developer](https://vestream.io/developer); we approve free-tier keys within 24 hours of the request.

---

## Configure your MCP client

### Claude Desktop

Edit your config file:

- **macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows** — `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux** — `~/.config/Claude/claude_desktop_config.json`

Add Vestream to the `mcpServers` block:

```json
{
  "mcpServers": {
    "vestream": {
      "command": "npx",
      "args": ["-y", "@vestream/mcp"],
      "env": {
        "VESTREAM_API_KEY": "vstr_live_..."
      }
    }
  }
}
```

Restart Claude Desktop. Open a new chat and ask: *"What's vesting for `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`?"*

### Cursor / Windsurf / Cline

Open settings → MCP servers (the exact path varies by version) and paste:

```json
{
  "vestream": {
    "command": "npx",
    "args": ["-y", "@vestream/mcp"],
    "env": { "VESTREAM_API_KEY": "vstr_live_..." }
  }
}
```

### ChatGPT (Custom GPT / Actions)

ChatGPT doesn't speak MCP natively yet — for ChatGPT we recommend pointing your **Custom GPT Action** at the [Vestream OpenAPI spec](https://vestream.io/openapi.json) directly. That gives you the same three endpoints (`/wallet/{address}/vestings`, `/wallet/{address}/upcoming-unlocks`, `/stream/{id}`) with built-in auth handling.

A native ChatGPT MCP bridge is in beta — check [vestream.io/developer](https://vestream.io/developer) for the current recommended path.

### Run it manually (for debugging)

```bash
npm install -g @vestream/mcp
VESTREAM_API_KEY=vstr_live_... vestream-mcp
```

The server speaks MCP over stdio. A "Server running on stdio. Waiting for MCP client..." log on stderr means it's ready.

---

## Tool reference

### `get_wallet_vestings`

Get every vesting stream for one wallet.

**Parameters**

| name | required | type | notes |
|---|---|---|---|
| `address` | yes | `string` | EVM `0x…` or Solana base58 pubkey |
| `protocol` | no | `string` | comma-separated; e.g. `"sablier,hedgey"` |
| `chain` | no | `string` | comma-separated chain ids; e.g. `"1,8453"` |
| `active_only` | no | `boolean` | `true` to skip fully-vested streams |
| `limit` | no | `integer` | page size 1–500; default 100 |
| `offset` | no | `integer` | zero-indexed; use `pagination.next_offset` from a prior page |

**Example**

```js
get_wallet_vestings({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  active_only: true
})
```

**Paginating large wallets**

A wallet with hundreds of streams can blow your agent's context window in
one shot. Page through it with `limit` + `offset` — the response includes a
`pagination` block with `total`, `next_offset` (null when exhausted), and
the count returned. Typical loop in agent pseudocode:

```js
let offset = 0;
const all = [];
while (true) {
  const page = get_wallet_vestings({ address, limit: 100, offset });
  all.push(...page.streams);
  if (page.pagination.next_offset == null) break;
  offset = page.pagination.next_offset;
}
```

### `get_upcoming_unlocks`

Forecast unlock events in a forward window.

| name | required | type | notes |
|---|---|---|---|
| `address` | yes | `string` | EVM `0x…` or Solana base58 pubkey |
| `days` | no | `integer` | 1–365, default 30 |
| `protocol` | no | `string` | comma-separated, same set as above |

### `get_stream`

| name | required | type | notes |
|---|---|---|---|
| `stream_id` | yes | `string` | `"{protocol}-{chainId}-{nativeId}"` — e.g. `"sablier-1-12345"`, `"streamflow-101-7xKX…"` |

---

## Authentication & rate limits

Every request includes `Authorization: Bearer ${VESTREAM_API_KEY}`. The plaintext key is shown to you once at issue time — store it in your shell profile or a secret manager, never commit it.

**Free tier limits**

- 30 requests / minute (burst)
- 150 requests / day

**Pro tier limits**

- 120 requests / minute
- 5,000 requests / day

Higher limits and bulk-export entitlements are available on Enterprise — email <enterprise@vestream.io>.

The server returns standard error JSON on failure:

```json
{ "error": "Invalid API key.", "docs": "https://vestream.io/api-docs" }
```

---

## Environment

| variable | default | description |
|---|---|---|
| `VESTREAM_API_KEY` | *required* | Your `vstr_live_…` API key |
| `VESTREAM_API_URL` | `https://vestream.io/api/v1` | Override for staging or self-hosted backends. |

---

## Versioning

This package follows [SemVer](https://semver.org). Tool **names** and required-parameter shapes are stable within a major version. Optional parameters and added tools are minor bumps. Breaking changes — removed tools or required-parameter shape changes — happen on major bumps with a deprecation window of at least 90 days.

The matching REST API is versioned at the URL prefix (`/api/v1`); we'll bump to `/api/v2` before any breaking change there.

---

## Links

- Website — <https://vestream.io>
- Developer portal — <https://vestream.io/developer>
- OpenAPI spec — <https://vestream.io/openapi.json>
- Live API docs (Swagger UI) — <https://vestream.io/api-docs> (gated; sign in via the developer portal)
- GitHub — <https://github.com/NonFungibleH/Vestream/tree/main/mcp>
- Contact — <hello@vestream.io>

---

## Licence

MIT. Vestream is operated by 3UILD LLC.
