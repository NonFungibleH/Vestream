import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, getWalletsForUser, addWallet, updateWalletConfig, FREE_PUSH_ALERT_LIMIT } from "@/lib/db/queries";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";

// Wallet limits per tier: free=1, pro=3, fund=unlimited (null)
const WALLET_LIMITS: Record<string, number | null> = {
  free: 1,
  pro:  3,
  fund: null,
};

function walletLimitForTier(tier: string): number | null {
  // Use `in` check so that null (= unlimited) is preserved and not coalesced to 1
  return tier in WALLET_LIMITS ? WALLET_LIMITS[tier] : 1;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByAddress(session.address);
    if (!user) {
      return NextResponse.json({
        wallets: [],
        sessionAddress: session.address,
        tier: "free",
        walletLimit: 1,
        pushAlertsSent: 0,
        pushAlertsLimit: FREE_PUSH_ALERT_LIMIT,
      });
    }

    const wallets = await getWalletsForUser(user.id);

    // Free tier: 3 lifetime push credits. Paid tiers: unmetered (null).
    // Surfaced so /settings can show "N of 3 lifetime alerts used" without
    // needing a second mobile-only endpoint.
    const isFree = !user.tier || user.tier === "free";
    const pushAlertsSent  = user.pushAlertsSent ?? 0;
    const pushAlertsLimit = isFree ? FREE_PUSH_ALERT_LIMIT : null;

    return NextResponse.json({
      wallets,
      sessionAddress: session.address,
      tier: user.tier,
      walletLimit: walletLimitForTier(user.tier),
      pushAlertsSent,
      pushAlertsLimit,
    });
  } catch (err) {
    console.error("GET /api/wallets error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { address, label } = body;
    // chains: array of chain IDs as numbers or strings, null/undefined = all chains
    // protocols: array of adapter IDs, null/undefined = all protocols
    // tokenAddress: optional ERC-20 contract address to narrow scan
    const rawChains:    unknown = body.chains;
    const rawProtocols: unknown = body.protocols;
    const rawTokenAddress: unknown = body.tokenAddress;

    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
    }

    // Validate chains — must be subset of ALL_CHAIN_IDS
    let chains: string[] | null = null;
    if (Array.isArray(rawChains) && rawChains.length > 0) {
      const valid = (rawChains as unknown[])
        .map((c) => Number(c))
        .filter((id): id is SupportedChainId => ALL_CHAIN_IDS.includes(id as SupportedChainId));
      chains = valid.length > 0 ? valid.map(String) : null;
    }

    // Validate protocols — must be a known adapter id
    const validAdapterIds = new Set(ADAPTER_REGISTRY.map((a) => a.id));
    let protocols: string[] | null = null;
    if (Array.isArray(rawProtocols) && rawProtocols.length > 0) {
      const valid = (rawProtocols as unknown[]).filter(
        (p): p is string => typeof p === "string" && validAdapterIds.has(p)
      );
      protocols = valid.length > 0 ? valid : null;
    }

    // Validate tokenAddress — must be a valid EVM ERC-20 contract address
    // OR a Solana SPL mint (base58) if provided. normaliseAddress handles
    // the ecosystem-specific casing (lowercase for EVM, as-is for Solana).
    const tokenAddress: string | null =
      typeof rawTokenAddress === "string" && isValidWalletAddress(rawTokenAddress)
        ? normaliseAddress(rawTokenAddress)
        : null;

    const user = await getUserByAddress(session.address);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // All tiers now support auto-discovery (no token address required).
    // Differentiation is on wallet count + advanced features (alerts, Discover, API), not wallet-add flow.

    const existingWallets = await getWalletsForUser(user.id);

    // Enforce per-tier wallet limit
    const limit = walletLimitForTier(user.tier);
    if (limit !== null && existingWallets.length >= limit) {
      // User-facing tier label — internal "fund" surfaces as "Enterprise"
      // everywhere in the UI per the /pricing page.
      const planName = user.tier === "free" ? "Free" : user.tier === "pro" ? "Pro" : "Enterprise";
      return NextResponse.json(
        {
          error: `${planName} plan limit reached`,
          code: "WALLET_LIMIT_REACHED",
          limit,
          tier: user.tier,
        },
        { status: 402 }
      );
    }

    const alreadyAdded = existingWallets.some(
      (w) => w.address === normaliseAddress(address)
    );
    if (alreadyAdded) {
      return NextResponse.json({ error: "Wallet already added" }, { status: 409 });
    }

    const wallet = await addWallet(user.id, address, label, chains, protocols, tokenAddress);
    return NextResponse.json({ wallet }, { status: 201 });
  } catch (err) {
    console.error("POST /api/wallets error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

/** PATCH /api/wallets — update chains/protocols config for an existing wallet */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { address } = body;
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid address — expected EVM 0x… or Solana pubkey" }, { status: 400 });
    }

    const rawChains:    unknown = body.chains;
    const rawProtocols: unknown = body.protocols;

    const validChains: string[] | null = Array.isArray(rawChains) && rawChains.length > 0
      ? (rawChains as unknown[]).map(Number)
          .filter((id): id is SupportedChainId => ALL_CHAIN_IDS.includes(id as SupportedChainId))
          .map(String)
      : null;

    const validAdapterIds = new Set(ADAPTER_REGISTRY.map((a) => a.id));
    const validProtocols: string[] | null = Array.isArray(rawProtocols) && rawProtocols.length > 0
      ? (rawProtocols as unknown[]).filter((p): p is string => typeof p === "string" && validAdapterIds.has(p))
      : null;

    const user = await getUserByAddress(session.address);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const wallet = await updateWalletConfig(user.id, address, validChains, validProtocols);
    if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

    return NextResponse.json({ wallet });
  } catch (err) {
    console.error("PATCH /api/wallets error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
