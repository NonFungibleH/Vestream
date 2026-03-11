import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AuthCard } from "@/components/AuthCard";
import Link from "next/link";

export default async function Login() {
  const session = await getSession();
  if (session.address) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc" }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-8 h-16 bg-white"
        style={{ borderBottom: "1px solid #e5e7eb" }}>
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-bold text-gray-900">Vestream</span>
        </Link>
      </nav>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="text-center mb-7">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}>
              <span className="text-white font-bold text-xl">V</span>
            </div>
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
