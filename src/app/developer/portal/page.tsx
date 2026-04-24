"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DeveloperPortal() {
  const [key, setKey]       = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/developer/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    });

    if (res.ok) {
      router.push("/developer/account");
    } else {
      const data = await res.json();
      setError(data.error ?? "Invalid API key.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#0d0f14" }}>

      {/* Back link */}
      <Link href="/developer"
        className="absolute top-6 left-8 text-sm transition-colors"
        style={{ color: "rgba(255,255,255,0.35)" }}>
        ← Developer API
      </Link>

      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <img src="/logo-icon.svg" alt="TokenVest" className="w-8 h-8" />
          <span className="font-bold text-lg tracking-tight text-white">TokenVest</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md ml-1"
            style={{ background: "rgba(37,99,235,0.15)", color: "#60a5fa", border: "1px solid rgba(37,99,235,0.25)" }}>
            Developer
          </span>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8"
          style={{ background: "#141720", border: "1px solid rgba(255,255,255,0.07)" }}>

          <h1 className="font-bold text-xl mb-1 text-white">Developer sign in</h1>
          <p className="text-sm mb-7" style={{ color: "rgba(255,255,255,0.4)" }}>
            Enter your TokenVest API key to access your account and documentation.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "rgba(255,255,255,0.35)" }}>
                API Key
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="vstr_live_..."
                value={key}
                onChange={e => setKey(e.target.value)}
                spellCheck={false}
                className="text-sm px-4 py-3 rounded-xl outline-none font-mono"
                style={{
                  background: "#0d0f14",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                }}
              />
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                boxShadow: "0 4px 20px rgba(37,99,235,0.3)",
              }}
            >
              {loading ? "Verifying…" : "Sign in →"}
            </button>
          </form>
        </div>

        {/* Help text */}
        <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.25)" }}>
          Don&apos;t have an API key?{" "}
          <Link href="/developer#request-access" className="transition-colors hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.45)" }}>
            Request access →
          </Link>
        </p>

      </div>
    </div>
  );
}
