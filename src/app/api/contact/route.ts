import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";

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

export async function POST(req: NextRequest) {
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
