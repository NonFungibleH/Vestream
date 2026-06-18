// src/lib/with-timeout.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bound a render-path promise so a stalled dependency can't hang the whole
// server render. On Vercel, a cold/uncached page render blocks on its data
// fan-out; if one DB call stalls on a saturated Supabase pooler connection
// (no per-statement timeout by default), the render hangs until Cloudflare's
// 100s gateway cuts it → a 524 the user sees as "this page couldn't load".
//
// withTimeout resolves to `fallback` if the promise hasn't settled within
// `ms` (or rejects), so the render completes — degraded (partial data) but
// fast — instead of timing out. It does NOT cancel the underlying query
// (you can't abort a postgres-js query mid-flight cheaply); it just stops the
// render from WAITING on it. The orphaned query finishes and is discarded.
//
// Use ONLY on the render path, where a partial page beats a 524. Background
// jobs (crons) should let their queries run to completion instead.
// ─────────────────────────────────────────────────────────────────────────────

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      if (label) console.warn(`[with-timeout] ${label} exceeded ${ms}ms — rendering with fallback`);
      resolve(fallback);
    }, ms);
  });
  return Promise.race([
    promise.then(
      (v) => { clearTimeout(timer); return v; },
      (err) => {
        clearTimeout(timer);
        if (label) console.warn(`[with-timeout] ${label} rejected:`, err);
        return fallback;
      },
    ),
    timeout,
  ]);
}
