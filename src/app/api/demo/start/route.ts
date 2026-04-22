// src/app/api/demo/start/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Start a new demo vesting session. Stateless from the server's perspective
// (apart from the signed cookie).
//
// Accepts an optional JSON body so visitors can customise the demo:
//
//   {
//     "tokenSymbol": "NOVA",       // 1-10 uppercase letters/digits
//     "totalAmount": "1000...",    // base-units bigint string (18 decimals)
//     "durationSec": 900           // 60 ≤ n ≤ 3600
//   }
//
// All fields are optional; omitted values fall back to DEMO_CONFIG defaults.
// Rate-limited to prevent abuse: 10 starts per IP per hour.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { startDemo, type StartDemoConfig } from "@/lib/demo";
import { getDemoSession } from "@/lib/demo/session";
import { checkRateLimit } from "@/lib/ratelimit";

// Token amount bounds, in whole tokens (converted to base units with 18 dp).
const MIN_TOKENS = 1n;
const MAX_TOKENS = 1_000_000_000n;
const MIN_BASE   = MIN_TOKENS * 10n ** 18n;
const MAX_BASE   = MAX_TOKENS * 10n ** 18n;

const MIN_DURATION_SEC = 60;
const MAX_DURATION_SEC = 3600;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Parse + validate the request body. Returns the config or an error string. */
function parseConfig(raw: unknown): { config: StartDemoConfig } | { error: string } {
  if (raw === null || typeof raw !== "object") return { config: {} };
  const body = raw as Record<string, unknown>;
  const config: StartDemoConfig = {};

  if (body.tokenSymbol !== undefined) {
    if (typeof body.tokenSymbol !== "string") {
      return { error: "tokenSymbol must be a string." };
    }
    const sym = body.tokenSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(sym)) {
      return { error: "tokenSymbol must be 1–10 uppercase letters or digits." };
    }
    config.tokenSymbol = sym;
  }

  if (body.totalAmount !== undefined) {
    if (typeof body.totalAmount !== "string" || !/^\d+$/.test(body.totalAmount)) {
      return { error: "totalAmount must be a base-units integer string." };
    }
    let bn: bigint;
    try { bn = BigInt(body.totalAmount); }
    catch { return { error: "totalAmount is not a valid integer." }; }
    if (bn < MIN_BASE || bn > MAX_BASE) {
      return { error: "totalAmount must be between 1 and 1,000,000,000 tokens." };
    }
    config.totalAmount = bn.toString();
  }

  if (body.durationSec !== undefined) {
    if (typeof body.durationSec !== "number" || !Number.isInteger(body.durationSec)) {
      return { error: "durationSec must be an integer number of seconds." };
    }
    if (body.durationSec < MIN_DURATION_SEC || body.durationSec > MAX_DURATION_SEC) {
      return { error: `durationSec must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC}.` };
    }
    config.durationSec = body.durationSec;
  }

  return { config };
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit("demo-start", getIp(req), 10, "1 h");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many demo starts. Please wait a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  // Body is optional — GET-style callers still get the default demo.
  let rawBody: unknown = {};
  try {
    const text = await req.text();
    rawBody = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseConfig(rawBody);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const session = await getDemoSession();
    const state   = await startDemo(session, parsed.config);
    await session.save();
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("POST /api/demo/start error:", err);
    return NextResponse.json({ error: "Failed to start demo" }, { status: 500 });
  }
}
