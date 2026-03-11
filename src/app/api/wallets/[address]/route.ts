import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, deleteWallet, updateWalletLabel, getWalletsForUser } from "@/lib/db/queries";

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

  const { label } = await req.json();
  const updated = await updateWalletLabel(user.id, address, label ?? null);
  if (!updated) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  return NextResponse.json({ wallet: updated });
}
