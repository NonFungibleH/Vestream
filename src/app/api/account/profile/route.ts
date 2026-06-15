// src/app/api/account/profile/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Read + update the signed-in user's profile bits surfaced on /settings:
//   - displayName     (optional name → personal dashboard greeting)
//   - marketingOptIn  (marketing-email opt-in; stored only, no provider wired)
//
// GET also returns read-only context the settings "device" readout uses:
//   - mobileConnected (does the user have a registered expoPushToken?)
//   - lastActiveAt    (touched by the mobile app on each authed call)
//   - timezone        (IANA, reported by the mobile app — rough location)
//
// iron-session gated, same as the rest of /api/* dashboard endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const MAX_NAME_LEN = 40;

export async function GET() {
  const session = await getSession();
  if (!session.address) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByAddress(session.address).catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    displayName:     user.displayName ?? null,
    marketingOptIn:  user.marketingOptIn ?? false,
    mobileConnected: !!user.expoPushToken,
    lastActiveAt:    user.lastActiveAt ? user.lastActiveAt.toISOString() : null,
    timezone:        user.timezone ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.address) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserByAddress(session.address).catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Only the fields present in the body are touched — partial update.
  const patch: { displayName?: string | null; marketingOptIn?: boolean } = {};

  if ("displayName" in body) {
    const raw = typeof body.displayName === "string" ? body.displayName.trim() : "";
    // Empty string clears the name (back to null → no greeting). Cap length so
    // the greeting can't be abused for layout-breaking input.
    patch.displayName = raw.length === 0 ? null : raw.slice(0, MAX_NAME_LEN);
  }
  if ("marketingOptIn" in body) {
    patch.marketingOptIn = !!body.marketingOptIn;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(users).set(patch).where(eq(users.id, user.id));

  return NextResponse.json({
    displayName:    patch.displayName !== undefined ? patch.displayName : (user.displayName ?? null),
    marketingOptIn: patch.marketingOptIn !== undefined ? patch.marketingOptIn : (user.marketingOptIn ?? false),
  });
}
