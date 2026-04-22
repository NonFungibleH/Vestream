// src/app/api/demo/status/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Poll the current demo state. Returns an inactive state if no demo session
// is active. Intentionally unauthenticated — the cookie is the only identity.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { readDemoState } from "@/lib/demo";
import { getDemoSession } from "@/lib/demo/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getDemoSession();
    const state   = await readDemoState(session);
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("GET /api/demo/status error:", err);
    return NextResponse.json({ error: "Failed to read demo status" }, { status: 500 });
  }
}
