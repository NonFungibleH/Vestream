// src/lib/llms-txt.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generators for /llms.txt and /llms-full.txt (llmstxt.org spec).
//
// Why generated, not static: the previous hand-written public/llms.txt drifted
// stale (said "9 protocols" when 10 were live). Sourcing from listProtocols()
// + getAllArticles() means the count, protocol list, and article index are
// ALWAYS correct — a new protocol or guide auto-appears. Same philosophy as
// sitemap.ts. Both sources are pure config (no DB), so this is build-safe.
//
//   /llms.txt      — the curated INDEX (what Vestream is + best links per topic)
//   /llms-full.txt — the EXPANDED doc (full protocol descriptions + article
//                    excerpts + how-it-works, so an LLM gets everything in one
//                    fetch)
// ─────────────────────────────────────────────────────────────────────────────

import { listProtocols } from "./protocol-constants";
import { getAllArticles, type Article } from "./articles";
import { CHAIN_NAMES, type SupportedChainId } from "./vesting/types";

const SITE = "https://www.vestream.io";
const TESTNET_CHAIN_IDS = new Set<number>([11155111, 84532]);

// Human-readable, testnet-free chain list for a protocol.
function chainNames(chainIds: readonly number[]): string {
  return chainIds
    .filter((c) => !TESTNET_CHAIN_IDS.has(c))
    .map((c) => CHAIN_NAMES[c as SupportedChainId] ?? String(c))
    .join(", ");
}

// Stable ordering for the article category sections.
const CATEGORY_ORDER = ["Guides", "Fundamentals", "Tokenomics", "Research", "Market Analysis", "Analysis", "Taxes"];

function groupArticlesByCategory(articles: Article[]): [string, Article[]][] {
  const byCat = new Map<string, Article[]>();
  for (const a of articles) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  return [...byCat.entries()].sort(([a], [b]) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

// The static sections shared by both files. Query phrasings here are the exact
// questions we want an AI assistant to match a user's prompt against.
const QUESTIONS_SECTION = `## Questions Vestream answers

- When do my vested tokens unlock?
- How do I track my Sablier / Hedgey / Team Finance / UNCX / Streamflow vesting?
- How do I get an alert before a token cliff or unlock?
- Which token unlocks are coming up this week or this month?
- How do I see every vesting position across all my wallets and chains in one place?
- Is there a token vesting / unlock-schedule API or MCP server for AI agents and apps?
- How do I export vesting income for taxes (Koinly, CoinTracker, TurboTax)?`;

const API_SECTION = `## API and MCP (for developers and AI agents)

- Developer portal: ${SITE}/developer
- API docs: ${SITE}/api-docs
- OpenAPI spec: ${SITE}/openapi.json
- MCP package: \`npx -y @vestream/mcp\` (works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible agent)
- MCP tools: get_wallet_vestings, get_upcoming_unlocks, get_stream`;

const KEY_PAGES_SECTION = `## Key pages

- [Homepage](${SITE}/): Token vesting tracker — free wallet scan.
- [Find my vestings](${SITE}/find-vestings): Free scanner — paste any EVM or Solana address to see every vesting position across all supported protocols and chains.
- [Token unlock calendar](${SITE}/unlocks): Live calendar of upcoming unlock events (today / this week / this month / 30-60-90-day windows).
- [Biggest unlocks this week](${SITE}/unlocks/biggest-this-week): The largest token unlocks in the next 7 days.
- [All protocols](${SITE}/protocols): Every vesting protocol Vestream indexes, with live TVL and stream counts.
- [Pricing](${SITE}/pricing): Free tier and Pro plan.
- [Developer API & MCP](${SITE}/developer): REST API and MCP server for AI agents and developers.
- [Resources](${SITE}/resources): Guides on token vesting, unlocks, and tokenomics.
- [iOS app](https://apps.apple.com/us/app/vestream-token-unlocks/id6769799911): Vestream on the App Store.`;

/** The curated INDEX at /llms.txt. */
export function buildLlmsTxt(): string {
  const protocols = listProtocols();
  const n = protocols.length;

  const protocolLines = protocols
    .map((p) => `- [${p.name} unlock tracker](${SITE}/protocols/${p.slug}): ${p.tagline} Chains: ${chainNames(p.chainIds)}.`)
    .join("\n");

  const articleSection = groupArticlesByCategory(getAllArticles())
    .map(([cat, items]) => {
      const lines = items.map((a) => `- [${a.title}](${SITE}/resources/${a.slug}): ${a.excerpt}`).join("\n");
      return `### ${cat}\n\n${lines}`;
    })
    .join("\n\n");

  return `# Vestream

> Vestream is a free token vesting tracker and alert service that monitors every unlock event across ${n} protocols and 7 chains. Paste any EVM or Solana wallet address to instantly see all active vesting positions, upcoming cliff dates, claimable balances, and unlock schedules — with push and email alerts before each event. Tracking is read-only and address-based; no wallet connection or signing is ever required. A REST API and MCP server make the vesting data queryable by AI agents and developers.

${KEY_PAGES_SECTION}

${QUESTIONS_SECTION}

## Protocol coverage (${n})

${protocolLines}

Chains: Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, and Solana.

${API_SECTION}

## Resources

${articleSection}

---
Full version with expanded descriptions: ${SITE}/llms-full.txt
`;
}

/** The EXPANDED doc at /llms-full.txt — everything in one fetch. */
export function buildLlmsFullTxt(): string {
  const protocols = listProtocols();
  const n = protocols.length;

  const protocolBlocks = protocols
    .map(
      (p) =>
        `### ${p.name}\n\n${p.description}\n\n- Tracker: ${SITE}/protocols/${p.slug}\n- Chains: ${chainNames(p.chainIds)}\n- Keywords: ${p.searchKeywords.join(", ")}`,
    )
    .join("\n\n");

  const articleSection = groupArticlesByCategory(getAllArticles())
    .map(([cat, items]) => {
      const lines = items
        .map((a) => `- [${a.title}](${SITE}/resources/${a.slug}) — ${a.readingTime}\n  ${a.excerpt}`)
        .join("\n");
      return `### ${cat}\n\n${lines}`;
    })
    .join("\n\n");

  return `# Vestream — Full Reference

> Vestream is a free token vesting tracker and alert service that monitors every unlock event across ${n} protocols and 7 chains. This is the expanded reference; the concise index is at ${SITE}/llms.txt.

## What Vestream is

Vestream indexes on-chain token vesting and unlock schedules across ${n} major protocols and seven blockchains, and gives every wallet one place to see its upcoming unlocks — plus email and push alerts before each one. It serves three audiences: (1) token holders who need to know when vested allocations unlock so they can claim, sell, or plan taxes; (2) funds and team treasuries tracking investor allocations, cliffs, and unlock schedules across many positions; (3) developers and AI-agent builders who want programmatic, normalised vesting data via the REST API or MCP server.

## How it works

- You add a wallet by pasting its address — EVM \`0x…\` or a Solana pubkey. There is no wallet connection and no signing; Vestream is strictly a read-only, address-watching tracker.
- Vestream auto-scans that address across every supported protocol and chain and surfaces each vesting stream: start, cliff, end, amount vested, amount claimable now, and the next unlock date.
- Turn on alerts (email, push, or both) with a lead time, and Vestream notifies you before each unlock.
- Data is public and on-chain — the same schedules the protocol's own UI shows.

## Chains

Ethereum, BNB Chain, Polygon, Base, Arbitrum, Optimism, and Solana.

${QUESTIONS_SECTION}

## Protocols (${n})

${protocolBlocks}

${API_SECTION}

${KEY_PAGES_SECTION}

## Resources

${articleSection}
`;
}
