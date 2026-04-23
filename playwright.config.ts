// playwright.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// End-to-end smoke tests for Vestream. Runs against a locally-booted Next.js
// production build so CI exercises the same bundle users get on Vercel.
//
// Design goals:
//   - No external service dependencies (no live DexScreener, no Supabase) —
//     assertions target static content the page renders before data loads.
//   - Runs on one browser in CI (Chromium) to keep the job fast; locally you
//     can add WebKit/Firefox when investigating a browser-specific bug.
//   - Short per-test timeout (15s) — if a smoke test takes longer than that
//     something has genuinely regressed.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Fail the run in CI if anyone accidentally commits `test.only`
  forbidOnly: !!process.env.CI,
  // Flake once in CI before giving up — tolerates one-off hiccups, still fails
  // consistently-broken tests. Don't retry locally.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 15_000,

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Tests run in production mode, so no unexpected dev-only middleware
    // should fire.
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Spin up the app for the duration of the test run. `reuseExistingServer`
  // lets you `npm run dev` in another terminal and skip the cold boot locally.
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    timeout: 180_000, // first build can be slow on a cold cache
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
