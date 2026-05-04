import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveFeedback } from "@/lib/db/queries";
import { checkRateLimit } from "@/lib/ratelimit";

function getIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  // Rate-limit: 10/h per IP. Reachable unauthenticated and writes to the
  // DB on every call — without a cap any spammer with a loop can fill the
  // betaFeedback table. 10/hour is generous for legitimate use and tight
  // enough that abuse is bounded. Matches the pattern in /api/waitlist.
  const ip = getIp(req);
  const rl = await checkRateLimit("feedback", ip, 10, "1 h");
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
    const { message, rating, page } = await req.json();

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (message.trim().length > 2000) {
      return NextResponse.json({ error: "Message too long (max 2000 characters)." }, { status: 400 });
    }

    const session = await getSession();

    await saveFeedback({
      userAddress: session.address ?? undefined,
      rating:      typeof rating === "number" && rating >= 1 && rating <= 5 ? rating : undefined,
      message:     message.trim(),
      page:        typeof page === "string" ? page : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/feedback error:", err);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }
}
