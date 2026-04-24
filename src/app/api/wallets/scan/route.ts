/**
 * GET /api/wallets/scan?address=0x...
 *
 * Pro+ feature: Scans ALL chains × ALL protocols for a wallet address.
 * Returns vestings grouped by protocol+chain, with per-token breakdowns
 * so the user can pick individual token vestings to watch.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isValidWalletAddress } from "@/lib/address-validation";
import { getUserByAddress, checkAndIncrementScanCount } from "@/lib/db/queries";
import { aggregateVestingStreams } from "@/lib/vesting/aggregate";
import { ALL_CHAIN_IDS, CHAIN_NAMES, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";

// ─── Response types ────────────────────────────────────────────────────────────

export interface ScanTokenResult {
  symbol:          string;
  address:         string;   // ERC-20 contract address
  decimals:        number;
  streamCount:     number;
  totalAmountRaw:  string;   // sum as BigInt string
  claimableNowRaw: string;
  lockedAmountRaw: string;
}

export interface ScanProtocolResult {
  protocolId:   string;
  protocolName: string;
  chainId:      number;
  chainName:    string;
  streamCount:  number;
  tokens:       ScanTokenResult[];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Pro+ gate
    const user = await getUserByAddress(session.address);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (user.tier === "free") {
      return NextResponse.json(
        { error: "Pro plan required", code: "UPGRADE_REQUIRED" },
        { status: 402 }
      );
    }

    // Rate limit: 3 scans per 24-hour rolling window
    const { allowed, remaining, resetAt } = await checkAndIncrementScanCount(user.id);
    if (!allowed) {
      const msLeft    = resetAt.getTime() - Date.now();
      const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
      return NextResponse.json(
        {
          error:   `Scan limit reached (3 per 24 h). Try again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`,
          code:    "RATE_LIMITED",
          resetAt: resetAt.toISOString(),
        },
        { status: 429 }
      );
    }

    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
    }

    // Optional chain/protocol filters — narrows the scan for speed
    const chainsParam    = searchParams.get("chains");
    const protocolsParam = searchParams.get("protocols");
    const chainIds: SupportedChainId[] = chainsParam
      ? chainsParam.split(",").map(Number).filter((n) => ALL_CHAIN_IDS.includes(n as SupportedChainId)) as SupportedChainId[]
      : ALL_CHAIN_IDS;
    const protocolFilter = protocolsParam ? new Set(protocolsParam.split(",")) : null;

    // Scan chains × protocols (filtered or all)
    const allStreams = await aggregateVestingStreams([address], chainIds);
    const streams    = protocolFilter
      ? allStreams.filter((s) => protocolFilter.has(s.protocol) || (s.protocol === "uncx-vm" && protocolFilter.has("uncx")))
      : allStreams;

    // Group by protocol × chain, then per-token within each group
    const byKey = new Map<string, {
      result:   ScanProtocolResult;
      tokenMap: Map<string, ScanTokenResult>;
    }>();

    for (const s of streams) {
      const key = `${s.protocol}:${s.chainId}`;
      if (!byKey.has(key)) {
        const adapter = ADAPTER_REGISTRY.find((a) => a.id === s.protocol);
        byKey.set(key, {
          result: {
            protocolId:   s.protocol,
            protocolName: adapter?.name ?? s.protocol,
            chainId:      s.chainId as number,
            chainName:    CHAIN_NAMES[s.chainId as SupportedChainId] ?? String(s.chainId),
            streamCount:  0,
            tokens:       [],
          },
          tokenMap: new Map(),
        });
      }

      const { result, tokenMap } = byKey.get(key)!;
      result.streamCount++;

      // Sub-group by token contract address (fallback to symbol)
      const tokenKey = (s.tokenAddress ?? s.tokenSymbol).toLowerCase();
      if (!tokenMap.has(tokenKey)) {
        tokenMap.set(tokenKey, {
          symbol:          s.tokenSymbol,
          address:         s.tokenAddress ?? "",
          decimals:        s.tokenDecimals ?? 18,
          streamCount:     0,
          totalAmountRaw:  "0",
          claimableNowRaw: "0",
          lockedAmountRaw: "0",
        });
      }

      const tok = tokenMap.get(tokenKey)!;
      tok.streamCount++;
      tok.totalAmountRaw  = (BigInt(tok.totalAmountRaw)  + BigInt(s.totalAmount  ?? "0")).toString();
      tok.claimableNowRaw = (BigInt(tok.claimableNowRaw) + BigInt(s.claimableNow ?? "0")).toString();
      tok.lockedAmountRaw = (BigInt(tok.lockedAmountRaw) + BigInt(s.lockedAmount ?? "0")).toString();
    }

    // Flatten token maps into result.tokens arrays
    for (const { result, tokenMap } of byKey.values()) {
      result.tokens = [...tokenMap.values()].sort((a, b) => b.streamCount - a.streamCount);
    }

    const results = [...byKey.values()]
      .map(({ result }) => result)
      .sort((a, b) => b.streamCount - a.streamCount);

    const suggestedChains    = [...new Set(results.map((r) => r.chainId))];
    const suggestedProtocols = [...new Set(results.map((r) => r.protocolId))];

    return NextResponse.json({
      address:          address.toLowerCase(),
      totalStreams:     streams.length,
      results,
      suggestedChains,
      suggestedProtocols,
      scannedAt:        new Date().toISOString(),
      scansRemaining:   remaining,
      scanResetAt:      resetAt.toISOString(),
    });
  } catch (err) {
    console.error("GET /api/wallets/scan error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
