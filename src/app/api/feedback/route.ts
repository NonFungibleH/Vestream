import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { saveFeedback } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
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
