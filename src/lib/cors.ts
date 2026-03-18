/**
 * CORS helper for Next.js API routes.
 *
 * Allows requests only from our own domain in production.
 * In development (localhost) all origins are allowed so hot-reload works.
 *
 * Usage:
 *   const corsError = checkCors(req);
 *   if (corsError) return corsError;
 */

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://vestream.io",
  "https://www.vestream.io",
];

/** Returns a 403 response if the request origin is not allowed, otherwise null. */
export function checkCors(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");

  // No Origin header = server-to-server or same-origin navigation — allow
  if (!origin) return null;

  // Always allow localhost in development
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    return null;
  }

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  return null;
}

/** Add CORS headers to an existing response (for preflight OPTIONS support). */
export function withCorsHeaders(res: NextResponse, origin: string | null): NextResponse {
  if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost"))) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return res;
}
