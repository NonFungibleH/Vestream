import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthCard } from "@/components/AuthCard";
import Link from "next/link";

export default async function Login() {
  let session: { address?: string } = {};
  try {
    session = await getSession();
  } catch {
    // If the session library throws (e.g. missing SESSION_SECRET env var in production),
    // fall through and render the login form rather than white-screening.
  }
  if (session.address) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-16 bg-white"
        style={{ borderBottom: "1px solid #e5e7eb" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo-icon.svg" alt="Vestream" className="w-7 h-7" />
          <span className="font-bold text-gray-900">Vestream</span>
        </Link>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="text-center mb-7">
            <img src="/logo-icon.svg" alt="Vestream" className="w-12 h-12 mx-auto mb-5" />
            <h1 className="text-xl font-bold text-gray-900 mb-1.5">Welcome to Vestream</h1>
            <p className="text-sm text-gray-500">
              Sign in to your account or create one — it&apos;s free to start
            </p>
          </div>

          <AuthCard />

          <p className="text-center text-xs mt-5">
            <Link href="/" className="hover:underline text-gray-400">
              ← Back to homepage
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
