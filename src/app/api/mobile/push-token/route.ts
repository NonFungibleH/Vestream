// src/app/api/mobile/push-token/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Expo push tokens are well-formed: `ExponentPushToken[<base64-ish>]` (legacy)
// or `ExpoPushToken[<base64-ish>]` (current). Anything else can't be sent to
// Expo's push API and is almost certainly garbage / probing input — reject at
// the edge so we never persist it.
const EXPO_TOKEN_RE = /^Exp(?:onent)?PushToken\[[a-zA-Z0-9_-]+\]$/;

export async function POST(req: NextRequest) {
  const token  = extractBearerToken(req);
  const userId = token ? await validateMobileToken(token) : null;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { expoPushToken } = await req.json().catch(() => ({}));
  if (!expoPushToken) return NextResponse.json({ error: "Token required" }, { status: 400 });

  if (typeof expoPushToken !== "string" || !EXPO_TOKEN_RE.test(expoPushToken)) {
    return NextResponse.json({ error: "Invalid Expo push token format" }, { status: 400 });
  }

  // Store on user row (expoPushToken text column added to users table in Task 1)
  await db.update(users)
    .set({ expoPushToken })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
