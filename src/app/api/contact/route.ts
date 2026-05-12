import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";
import { checkCors, withCorsHeaders } from "@/lib/cors";

export interface ContactEnquiry {
  name:    string;
  email:   string;
  company: string;
  message: string;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ── POST /api/contact ──────────────────────────────────────────────────────────
// Accepts a contact form submission. Currently logs to console; ready to be
// wired to a CRM (HubSpot, Pipedrive, Attio, etc.) when configured.
//
// Rate-limited at 5/h per IP — once we wire to a CRM, every successful
// POST creates a record there too, so a spammer in a loop becomes a CRM
// data-quality problem fast. Matches the /api/waitlist + /api/feedback
// shape.

// CORS preflight — same pattern as /api/waitlist. Required for the OPTIONS
// roundtrip browsers fire before any cross-origin POST with custom headers.
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const res = new NextResponse(null, { status: 204 });
  return withCorsHeaders(res, origin);
}

export async function POST(req: NextRequest) {
  // Origin check — same ALLOWED_ORIGINS list as the rest of the public POST
  // surface. Prevents a malicious site from submitting on a user's behalf
  // via cross-origin POST. Doesn't block server-to-server callers (no
  // Origin header) — those are out of scope for CSRF.
  const corsError = checkCors(req);
  if (corsError) return corsError;

  const ip = getIp(req);
  const rl = await checkRateLimit("contact", ip, 5, "1 h");
  if (!rl.allowed) {
    if (rl.reason === "rate-limit-misconfigured") {
      return NextResponse.json({ error: "Service temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Too many submissions — try again in an hour." },
      { status: 429 },
    );
  }

  try {
    const body = await req.json() as Partial<ContactEnquiry>;

    const { name, email, company = "", message } = body;

    // Basic validation
    if (!name?.trim())    return NextResponse.json({ error: "Name is required" },    { status: 400 });
    if (!email?.trim())   return NextResponse.json({ error: "Email is required" },   { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    // Length caps — defend against multi-MB payloads chewing memory + DB
    // bandwidth before they ever reach the CRM. Generous limits: real
    // contact-form messages rarely exceed 1k chars.
    if (name.length    > 200)  return NextResponse.json({ error: "Name too long (max 200 characters)" },     { status: 400 });
    if (email.length   > 254)  return NextResponse.json({ error: "Email too long (max 254 characters)" },    { status: 400 });
    if (company.length > 200)  return NextResponse.json({ error: "Company too long (max 200 characters)" },  { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Message too long (max 5000 characters)" }, { status: 400 });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const enquiry: ContactEnquiry = {
      name:    name.trim(),
      email:   email.trim().toLowerCase(),
      company: company.trim(),
      message: message.trim(),
    };

    // ── TODO: wire to CRM ─────────────────────────────────────────────────────
    // e.g. HubSpot: POST https://api.hubapi.com/crm/v3/objects/contacts
    // e.g. Pipedrive: POST https://api.pipedrive.com/v1/persons
    // e.g. Attio: POST https://api.attio.com/v2/records/people
    // Do NOT log enquiry here — it would expose PII (name, email, company) to server logs.
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true });

  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
