import { NextResponse } from "next/server";
import { countUsers } from "@/lib/db/queries";

const BETA_MAX = Number(process.env.BETA_MAX_USERS ?? 100);

export async function GET() {
  try {
    const count = await countUsers();
    return NextResponse.json({
      count,
      max:       BETA_MAX,
      full:      count >= BETA_MAX,
      remaining: Math.max(0, BETA_MAX - count),
    });
  } catch {
    // If DB is unreachable, don't block sign-ups
    return NextResponse.json({ count: 0, max: BETA_MAX, full: false, remaining: BETA_MAX });
  }
}
