// src/lib/demo/session.ts
// ─────────────────────────────────────────────────────────────────────────────
// iron-session cookie used to hold the demo state client-side. Because the
// demo is short-lived (15 minutes) and fully ephemeral, we keep everything
// in the cookie rather than adding a DB table or Redis key.
//
// Cookie name: vestream_demo   TTL: 30 minutes
// ─────────────────────────────────────────────────────────────────────────────

import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import type { DemoSession } from "./types";

const sessionOptions = {
  password:    process.env.SESSION_SECRET || process.env.IRON_SESSION_SECRET || "",
  cookieName:  "vestream_demo",
  cookieOptions: {
    secure:   process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge:   60 * 30, // 30 minutes
  },
};

export async function getDemoSession(): Promise<IronSession<DemoSession>> {
  if (!sessionOptions.password || sessionOptions.password.length < 32) {
    throw new Error("SESSION_SECRET (or IRON_SESSION_SECRET) must be set and at least 32 characters long");
  }
  const cookieStore = await cookies();
  return getIronSession<DemoSession>(cookieStore, sessionOptions);
}
