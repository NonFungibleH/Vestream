// src/app/llms.txt/route.ts
// Serves /llms.txt, generated from the live protocol list + article index so
// it never goes stale (see lib/llms-txt.ts). Cached, regenerated hourly.
import { buildLlmsTxt } from "@/lib/llms-txt";

export const revalidate = 3600;

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
