"use client";
import { useState } from "react";

interface Props {
  requestId: string;
  email: string;
  name: string;
}

export function ApproveButton({ requestId, email, name }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleApprove() {
    if (!confirm(`Issue API key to ${email}?`)) return;
    setState("loading");
    setErrorMsg("");

    try {
      const approveRes = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, email, name }),
        credentials: "include",
      });

      const data = await approveRes.json();

      if (!approveRes.ok) {
        setErrorMsg(data.error ?? "Failed to issue key.");
        setState("error");
        return;
      }

      setApiKey(data.key);
      setState("done");
    } catch {
      setErrorMsg("Network error. Try again.");
      setState("error");
    }
  }

  async function copyKey() {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state === "done" && apiKey) {
    return (
      <div className="flex flex-col gap-3 min-w-0 max-w-xs">
        <div className="rounded-xl p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#34d399" }}>
            ✓ Key issued — copy now, it won&apos;t be shown again
          </p>
          <code className="text-xs break-all block leading-relaxed" style={{ color: "#a7f3d0", wordBreak: "break-all" }}>
            {apiKey}
          </code>
        </div>
        <button
          onClick={copyKey}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
          style={{
            background: copied ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.1)",
            border: "1px solid rgba(16,185,129,0.25)",
            color: "#34d399",
          }}
        >
          {copied ? "Copied!" : "Copy key"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleApprove}
        disabled={state === "loading"}
        className="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: "#1CB8B8",
          color: "white",
        }}
      >
        {state === "loading" ? "Issuing…" : "Approve & issue key"}
      </button>
      {state === "error" && (
        <p className="text-xs" style={{ color: "#f87171" }}>{errorMsg}</p>
      )}
    </div>
  );
}
