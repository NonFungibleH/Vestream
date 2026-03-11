import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserByAddress, deleteUser } from "@/lib/db/queries";

/**
 * DELETE /api/auth/account
 * Permanently deletes the authenticated user's account and all associated data
 * (wallets, notification preferences, notification history — all cascade via FK).
 * Clears the session cookie and returns 200.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByAddress(session.address);
  if (user) {
    await deleteUser(user.id);
  }

  // Clear the iron-session cookie
  session.destroy();

  return NextResponse.json({ ok: true });
}
