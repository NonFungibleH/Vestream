import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6"
      style={{ background: "#f8fafc" }}>

      {/* Subtle dot grid */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)`,
        backgroundSize: "28px 28px",
      }} />

      <div className="relative">
        {/* Icon */}
        <img src="/logo-icon.svg" alt="TokenVest" className="w-16 h-16 mx-auto mb-6" />

        {/* 404 */}
        <p className="text-8xl font-bold mb-2 tabular-nums"
          style={{
            background: "linear-gradient(135deg, #2563eb, #7c3aed)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.04em",
          }}>
          404
        </p>

        <h1 className="text-xl font-bold mb-2" style={{ color: "#0f172a" }}>
          Page not found
        </h1>
        <p className="text-sm max-w-xs mx-auto mb-8 leading-relaxed" style={{ color: "#64748b" }}>
          This page doesn&apos;t exist or may have been moved. Head back to the dashboard or homepage.
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #2563eb, #7c3aed)",
              boxShadow: "0 4px 16px rgba(37,99,235,0.3)",
            }}
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              color: "#64748b",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
