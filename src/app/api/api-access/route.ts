import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiAccessRequests } from "@/lib/db/schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { name, email, company, useCase, protocols } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2)
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email || !EMAIL_RE.test(email.trim()))
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  if (!useCase || typeof useCase !== "string" || useCase.trim().length < 10)
    return NextResponse.json({ error: "Please describe your use case (min 10 characters)" }, { status: 400 });

  await db.insert(apiAccessRequests).values({
    name:      name.trim(),
    email:     email.trim().toLowerCase(),
    company:   company?.trim() || null,
    useCase:   useCase.trim(),
    protocols: Array.isArray(protocols) ? protocols : [],
  });

  return NextResponse.json({ ok: true });
}
