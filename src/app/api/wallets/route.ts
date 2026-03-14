import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, getWalletsForUser, addWallet } from "@/lib/db/queries";

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
      });
    }

    const wallets = await getWalletsForUser(user.id);
    return NextResponse.json({
      wallets,
      sessionAddress: session.address,
      tier: user.tier,
      walletLimit: walletLimitForTier(user.tier),
    });
  } catch (err) {
    console.error("GET /api/wallets error:", err);
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address, label } = await req.json();

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existingWallets = await getWalletsForUser(user.id);

  // Enforce per-tier wallet limit
  const limit = walletLimitForTier(user.tier);
  if (limit !== null && existingWallets.length >= limit) {
    const planName = user.tier === "free" ? "Free" : user.tier === "pro" ? "Pro" : "Fund";
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
    (w) => w.address === address.toLowerCase()
  );
  if (alreadyAdded) {
    return NextResponse.json({ error: "Wallet already added" }, { status: 409 });
  }

  const wallet = await addWallet(user.id, address, label);
  return NextResponse.json({ wallet }, { status: 201 });
}
