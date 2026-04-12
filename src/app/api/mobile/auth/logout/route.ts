// src/app/api/mobile/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { extractBearerToken, hashValue } from "@/lib/mobile-auth";
import { db } from "@/lib/db";
import { mobileTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req);
  if (token) {
    await db.delete(mobileTokens).where(eq(mobileTokens.tokenHash, hashValue(token)));
  }
  return NextResponse.json({ ok: true });
}
