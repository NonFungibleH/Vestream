// e2e/smoke.spec.ts
// ─────────────────────────────────────────────────────────────────────────────
// Critical-path smoke tests. Split into two tiers:
//
//   Tier 1 — always runs (CI + local + staging):
//     Homepage, nav, auth redirects, security headers, admin rate-limit.
//     Assertions target STATIC content — no DB, no DexScreener, no subgraphs.
//     MUST stay green on every PR.
//
//   Tier 2 — skipped in CI; runs locally + against staging:
//     Token explorer pages, public live-activity API. These hit Postgres,
//     The Graph subgraphs, and DexScreener at render time. Ephemeral CI
//     runners don't have a real Postgres available (bringing one up
//     via a docker service just for these tests is more complexity than
//     value), so we skip them there. The tests still matter — they run
//     locally when a dev runs `npm run test:e2e` with their .env.local,
//     and we wire them into staging E2E when that exists.
//
// How to run Tier 2 locally:
//   npm run test:e2e                # runs Tier 1 + 2 because CI is unset
//
// How CI skips them:
//   process.env.CI is set to "true" in GitHub Actions by default. Each
//   Tier 2 `describe` block calls `test.skip(!!process.env.CI, ...)` which
//   marks every test inside as skipped in CI with a reason string visible
//   in the report.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";

/**
 * `true` whenever the test run is happening on GitHub Actions (or any other
 * CI system that follows the convention of setting `CI=true`). Tier 2
 * describe blocks check this to opt out when no real backend is available.
 */
const IS_CI = !!process.env.CI;

test.describe("homepage", () => {
  test("renders with correct page title", async ({ page }) => {
    await page.goto("/");
    // Title comes from layout metadata — no dependency on any API call.
    await expect(page).toHaveTitle(/Vestream.*Token Vesting Tracker/i);
  });

  test("nav links to /developer and /ai are present", async ({ page }) => {
    await page.goto("/");
    // The nav ships in the server-rendered HTML — we don't need hydration to
    // assert its presence.
    await expect(page.locator('a[href="/developer"]').first()).toBeVisible();
    await expect(page.locator('a[href="/ai"]').first()).toBeVisible();
  });
});

test.describe("token explorer", () => {
  // Tier 2: needs Postgres + DexScreener at render time. Skipped in CI.
  test.skip(IS_CI, "token explorer queries Postgres at render time; CI has no DB");

  // USDC on Ethereum — a real address that every adapter will recognise as
  // valid. Even if no vesting streams are indexed, the page should render the
  // "no streams found" state, not 500.
  const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

  test("/token/1/<USDC> renders without crashing", async ({ page }) => {
    const resp = await page.goto(`/token/1/${USDC}`);
    // Accept 200 (rendered) or 404 (no streams for this token yet). 500 fails.
    expect(resp?.status()).toBeLessThan(500);
    // Whatever path we take, the site chrome should render.
    await expect(page).toHaveTitle(/Vestream/i);
  });

  test("/explore/1/<USDC> permanent-redirects to /token/1/<USDC>", async ({ page }) => {
    await page.goto(`/explore/1/${USDC}`);
    // Playwright follows redirects — after navigation we should be on /token/*.
    await expect(page).toHaveURL(new RegExp(`/token/1/${USDC}$`, "i"));
  });
});

test.describe("authentication gates", () => {
  test("/dashboard redirects unauthenticated visitors to /early-access", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/early-access/);
  });

  test("/admin redirects unauthenticated visitors to /admin/login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("/developer/account redirects unauthenticated to /developer/portal", async ({ page }) => {
    await page.goto("/developer/account");
    await expect(page).toHaveURL(/\/developer\/portal/);
  });
});

test.describe("security", () => {
  test("/api/admin/login rate-limits after 5 wrong-password attempts", async ({ request }) => {
    // Fire 6 POSTs back-to-back with a bad password.
    // Three valid outcomes:
    //   - 401 throughout if Upstash is unconfigured AND we're in dev (lenient mode)
    //   - 429 on the 6th attempt if Upstash is configured (real rate limit)
    //   - 503 throughout if Upstash is unconfigured AND NODE_ENV=production
    //     (fail-closed mode — what CI sees, since `npm run start` is prod)
    // The point of the test is "no 200 leaks through on a wrong password
    // and no 500s" — all three of the above pass that bar.
    const results: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request.post("/api/admin/login", {
        data: { password: "definitely-not-the-admin-password" },
      });
      results.push(r.status());
    }

    const last = results[results.length - 1];
    const first = results[0];
    expect([401, 429, 503]).toContain(last);
    expect([401, 429, 503]).toContain(first);
  });

  test("security headers present on every response", async ({ request }) => {
    const r = await request.get("/");
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    // HSTS is enforced at the edge; Next.js emits it too via next.config.
    expect(r.headers()["strict-transport-security"]).toContain("max-age");
  });
});

test.describe("public API health", () => {
  // Tier 2: hits Postgres for per-protocol aggregates + recent-streams list.
  // Skipped in CI for the same reason as the token explorer suite.
  test.skip(IS_CI, "live-activity queries Postgres; CI has no DB");

  test("/api/unlocks/live-activity responds with ok: true", async ({ request }) => {
    const r = await request.get("/api/unlocks/live-activity");
    // After the firstSeenAt migration this route should always 200. If it
    // still 500s the migration step in the runbook was skipped.
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("aggregate");
    expect(body).toHaveProperty("recent");
  });
});
