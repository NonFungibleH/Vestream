// src/lib/mobile-auth.ts
import crypto from "crypto";
import { db } from "./db";
import { mobileTokens, users } from "./db/schema";
import { eq, and, gt } from "drizzle-orm";

const TOKEN_TTL_DAYS = 90;

export function hashValue(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function generateMobileToken(): string {
  const rand = crypto.randomBytes(32).toString("hex");
  return `vstr_mob_${rand}`;
}

export async function createMobileToken(userId: string): Promise<string> {
  const token = generateMobileToken();
  const hash  = hashValue(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400 * 1000);
  await db.insert(mobileTokens).values({
    userId,
    tokenHash:   hash,
    tokenPrefix: token.slice(0, 12),
    expiresAt,
  });
  return token;
}

export async function validateMobileToken(token: string): Promise<string | null> {
  if (!token?.startsWith("vstr_mob_")) return null;
  const hash = hashValue(token);
  const [row] = await db
    .select({ userId: mobileTokens.userId, id: mobileTokens.id })
    .from(mobileTokens)
    .where(and(
      eq(mobileTokens.tokenHash, hash),
      gt(mobileTokens.expiresAt, new Date()),
    ))
    .limit(1);
  if (!row) return null;
  // Update lastUsedAt (fire-and-forget)
  db.update(mobileTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mobileTokens.id, row.id))
    .catch(() => {});
  return row.userId;
}

export async function getMobileUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

// Middleware helper — extracts Bearer token from Authorization header
export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}
