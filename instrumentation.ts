// instrumentation.ts — entry point Next.js calls once at server startup.
// Delegates to the runtime-specific Sentry config so edge + node stay isolated.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors thrown from React Server Components + route handlers.
// Pull this from @sentry/nextjs only when a DSN is configured — otherwise we
// don't want the package to do any work at all.
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: { [key: string]: string } },
  errorContext: { routerKind: "Pages Router" | "App Router"; routePath: string; routeType: "render" | "route" | "action" | "middleware" },
) {
  if (!process.env.SENTRY_DSN) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(err, request, errorContext);
}
