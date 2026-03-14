import { NextResponse } from "next/server";
import { generateNonce } from "siwe";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  try {
    const session = await getSession();
    const nonce = generateNonce();
    session.nonce = nonce;
    await session.save();
    return NextResponse.json({ nonce });
  } catch (err) {
    console.error("GET /api/auth/nonce error:", err);
    return NextResponse.json({ error: "Auth service unavailable. Check SESSION_SECRET env var." }, { status: 500 });
  }
}
