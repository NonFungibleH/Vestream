import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, deleteWallet, updateWallet, getWalletsForUser, checkAndUpdateSettingsCooldown } from "@/lib/db/queries";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address } = await params;

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await getWalletsForUser(user.id);
  const found = existing.find((w) => w.address === address.toLowerCase());
  if (!found) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  // Free-plan: enforce 24-hour settings cooldown on deletion
  const cooldown = await checkAndUpdateSettingsCooldown(user.id, user.tier);
  if (!cooldown.allowed) {
    const hoursLeft = Math.max(1, Math.ceil((cooldown.resetAt.getTime() - Date.now()) / 3_600_000));
    return NextResponse.json(
      { error: `Free plan: you can change your wallet settings again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`, code: "SETTINGS_COOLDOWN", resetAt: cooldown.resetAt.toISOString() },
      { status: 429 }
    );
  }

  await deleteWallet(user.id, address);
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address } = await params;

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const patchData: { label?: string | null; chains?: string[] | null; protocols?: string[] | null; tokenAddress?: string | null } = {};

  if ("label" in body) {
    patchData.label = body.label ?? null;
  }

  if ("chains" in body) {
    const raw = body.chains;
    if (!Array.isArray(raw) || raw.length === 0) {
      patchData.chains = null;
    } else {
      const valid = (raw as unknown[])
        .map(Number)
        .filter((id): id is SupportedChainId => ALL_CHAIN_IDS.includes(id as SupportedChainId));
      patchData.chains = valid.length > 0 ? valid.map(String) : null;
    }
  }

  if ("protocols" in body) {
    const raw = body.protocols;
    const validIds = new Set(ADAPTER_REGISTRY.map((a) => a.id));
    if (!Array.isArray(raw) || raw.length === 0) {
      patchData.protocols = null;
    } else {
      const valid = (raw as unknown[]).filter((p): p is string => typeof p === "string" && validIds.has(p));
      patchData.protocols = valid.length > 0 ? valid : null;
    }
  }

  if ("tokenAddress" in body) {
    const raw = body.tokenAddress;
    patchData.tokenAddress = (typeof raw === "string" && isAddress(raw))
      ? raw.toLowerCase()
      : null;
  }

  // Free-plan: enforce 24h cooldown only when chains/protocols/tokenAddress change (not label-only)
  const isStructuralChange = "chains" in patchData || "protocols" in patchData || "tokenAddress" in patchData;
  if (isStructuralChange) {
    const cooldown = await checkAndUpdateSettingsCooldown(user.id, user.tier);
    if (!cooldown.allowed) {
      const hoursLeft = Math.max(1, Math.ceil((cooldown.resetAt.getTime() - Date.now()) / 3_600_000));
      return NextResponse.json(
        { error: `Free plan: you can change your wallet settings again in ${hoursLeft} hour${hoursLeft !== 1 ? "s" : ""}.`, code: "SETTINGS_COOLDOWN", resetAt: cooldown.resetAt.toISOString() },
        { status: 429 }
      );
    }
  }

  const updated = await updateWallet(user.id, address, patchData);
  if (!updated) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ wallet: updated });
}
