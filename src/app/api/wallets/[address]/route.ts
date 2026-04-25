import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, deleteWallet, updateWallet, getWalletsForUser } from "@/lib/db/queries";
import { ALL_CHAIN_IDS, SupportedChainId } from "@/lib/vesting/types";
import { ADAPTER_REGISTRY } from "@/lib/vesting/adapters/index";
import { isValidWalletAddress, normaliseAddress } from "@/lib/address-validation";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { address } = await params;

  // Validate format BEFORE any DB work — cheap rejection for junk input,
  // and avoids running an existence check against a malformed string.
  if (!isValidWalletAddress(address)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }
  const normalised = normaliseAddress(address);

  const user = await getUserByAddress(session.address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const existing = await getWalletsForUser(user.id);
  const found = existing.find((w) => w.address === normalised);
  if (!found) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  // Pass the normalised form to the query layer so the WHERE clause matches
  // exactly the row we just confirmed exists. `deleteWallet` lowercases
  // again internally, which is a no-op for already-lowercased EVM
  // addresses and the right thing for Solana (we pass the unchanged
  // case-sensitive base58, and the duplicate `.toLowerCase()` would
  // otherwise turn it into a string that never matches the row).
  await deleteWallet(user.id, normalised);
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
    patchData.tokenAddress = (typeof raw === "string" && isValidWalletAddress(raw))
      ? normaliseAddress(raw)
      : null;
  }

  const updated = await updateWallet(user.id, address, patchData);
  if (!updated) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ wallet: updated });
}
