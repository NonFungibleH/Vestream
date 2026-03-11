import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  address?: string;
  nonce?: string;
  otp?: string;
  otpEmail?: string;
  otpExpiry?: number; // unix timestamp seconds
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "vestr_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function requireAuth(): Promise<string> {
  const session = await getSession();
  if (!session.address) {
    throw new Error("Unauthorized");
  }
  return session.address;
}
