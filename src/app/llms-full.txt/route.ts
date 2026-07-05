// src/app/llms-full.txt/route.ts
// Serves /llms-full.txt — the expanded, everything-in-one-fetch reference for
// LLMs, generated from live data (see lib/llms-txt.ts). Cached, hourly refresh.
import { buildLlmsFullTxt } from "@/lib/llms-txt";

export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsFullTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
