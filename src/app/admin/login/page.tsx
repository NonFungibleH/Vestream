"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/admin");
    } else {
      setError("Incorrect password.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0f14" }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ background: "#141720", border: "1px solid #1e2330" }}>
        <img src="/logo-icon.svg" alt="TokenVest" className="w-10 h-10 mb-6" />
        <h1 className="font-bold text-lg mb-1" style={{ color: "white" }}>Admin access</h1>
        <p className="text-sm mb-6" style={{ color: "#4b5563" }}>TokenVest internal dashboard</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password" required autoFocus placeholder="Admin password"
            value={password} onChange={e => setPassword(e.target.value)}
            className="px-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "#0d0f14", border: "1px solid #1e2330", color: "white" }}
          />
          {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
          <button type="submit" disabled={loading}
            className="py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)", color: "white" }}>
            {loading ? "Signing in..." : "Sign in →"}
          </button>
        </form>
      </div>
    </div>
  );
}
