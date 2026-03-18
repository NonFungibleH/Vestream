/**
 * POST /api/admin/approve
 *
 * Admin-cookie-protected endpoint that:
 *  1. Issues a new API key for the given email/name
 *  2. Marks the api_access_requests row as reviewed
 *
 * Body: { requestId: string; email: string; name: string; tier?: "free" | "pro" }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys, apiAccessRequests } from "@/lib/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-key-auth";
import { eq } from "drizzle-orm";

const DEFAULT_LIMITS: Record<string, number> = {
  free: 1_000,
  pro:  100_000,
};

export async function POST(req: NextRequest) {
  // Auth: must have the admin session cookie set by /api/admin/login
  const adminCookie = req.cookies.get("vestr_admin");
  if (!adminCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { requestId?: string; email?: string; name?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { requestId, email, name, tier: rawTier } = body;

  if (!requestId || typeof requestId !== "string") {
    return NextResponse.json({ error: "requestId is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const tier  = rawTier === "pro" ? "pro" : "free";
  const limit = DEFAULT_LIMITS[tier];

  // Generate key — plaintext only returned in this response
  const plaintext = generateApiKey();
  const hash      = hashApiKey(plaintext);
  const prefix    = plaintext.slice(0, 17); // "vstr_live_" + 7 chars

  // Run both DB operations
  await Promise.all([
    db.insert(apiKeys).values({
      keyHash:      hash,
      keyPrefix:    prefix,
      ownerEmail:   email.trim().toLowerCase(),
      ownerName:    name ?? null,
      tier,
      monthlyLimit: limit,
    }),
    db.update(apiAccessRequests)
      .set({ reviewed: true })
      .where(eq(apiAccessRequests.id, requestId)),
  ]);

  return NextResponse.json({
    ok:      true,
    key:     plaintext,   // returned ONCE — never retrievable again
    prefix,
    tier,
    monthly_limit: limit,
  });
}
