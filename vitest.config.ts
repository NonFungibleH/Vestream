import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config scoped to unit tests — Playwright owns E2E and runs separately.
// We only pick up `*.test.ts` files (not `*.spec.ts`) so Playwright's tests in
// e2e/ don't get swept up by Vitest.
export default defineConfig({
  test: {
    // Only match under packages/ and src/ — explicitly exclude e2e/ so
    // Playwright specs don't get executed by Vitest.
    include: ["packages/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    environment: "node",
    // Strict: a single unhandled promise rejection fails the run
    reporters: ["default"],
    // Setup runs BEFORE any test file is imported — use it to seed env vars
    // that modules read at top-level const-eval time (e.g. adapter subgraph URLs).
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider:  "v8",
      reporter:  ["text", "html"],
      // Only measure the pure-TS packages for now; components + API routes
      // need a separate browser-ish environment and deserve their own pass.
      include:   ["packages/shared/src/**/*.ts", "src/lib/env.ts", "src/lib/admin-auth.ts"],
      exclude:   ["**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      // Match the tsconfig paths so tests can import from @vestream/shared.
      "@vestream/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@":               path.resolve(__dirname, "src"),
    },
  },
});
