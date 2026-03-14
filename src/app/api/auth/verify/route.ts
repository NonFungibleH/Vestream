import { NextRequest, NextResponse } from "next/server";
import { SiweMessage } from "siwe";
import { getSession } from "@/lib/auth/session";
import { upsertUser, addWallet, getWalletsForUser } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  const { message, signature } = await req.json();

  let session;
  try {
    session = await getSession();
  } catch (err) {
    console.error("getSession failed in verify:", err);
    return NextResponse.json({ error: "Auth service unavailable. Check SESSION_SECRET env var." }, { status: 500 });
  }

  if (!session.nonce) {
    return NextResponse.json({ error: "No nonce in session" }, { status: 422 });
  }

  const siweMessage = new SiweMessage(message);

  let result;
  try {
    result = await siweMessage.verify({ signature, nonce: session.nonce });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 422 });
  }

  if (!result.success) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 422 });
  }

  const address = result.data.address.toLowerCase();

  // Upsert user
  const user = await upsertUser(address);

  // Auto-add the signing wallet if not already in the list
  const existingWallets = await getWalletsForUser(user.id);
  const alreadyAdded = existingWallets.some(
    (w) => w.address === address
  );
  if (!alreadyAdded) {
    await addWallet(user.id, address, "My Wallet");
  }

  // Set session
  session.address = address;
  session.nonce = undefined;
  await session.save();

  return NextResponse.json({ address });
}
