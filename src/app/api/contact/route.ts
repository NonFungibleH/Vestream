import { NextResponse } from "next/server";

export interface ContactEnquiry {
  name:    string;
  email:   string;
  company: string;
  message: string;
}

// ── POST /api/contact ──────────────────────────────────────────────────────────
// Accepts a contact form submission. Currently logs to console; ready to be
// wired to a CRM (HubSpot, Pipedrive, Attio, etc.) when configured.

export async function POST(req: Request) {
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
    // For now, log the enquiry so it is at least visible in server logs.
    console.log("[contact] New enquiry:", enquiry);
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true });

  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
