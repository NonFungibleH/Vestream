// src/app/api/demo/reset/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Clear the current demo session so the user can start again.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { resetDemo } from "@/lib/demo";
import { getDemoSession } from "@/lib/demo/session";

export async function POST() {
  try {
    const session = await getDemoSession();
    resetDemo(session);
    await session.save();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/demo/reset error:", err);
    return NextResponse.json({ error: "Failed to reset demo" }, { status: 500 });
  }
}
