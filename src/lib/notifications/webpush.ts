// src/lib/notifications/webpush.ts
// ─────────────────────────────────────────────────────────────────────────────
// Web Push API sender — the browser/PWA equivalent of `push.ts` (which targets
// Expo / native mobile). Uses VAPID keys to authenticate pushes.
//
// Key flow:
//   1. Client calls `navigator.serviceWorker.pushManager.subscribe()` with our
//      VAPID public key and sends the resulting PushSubscription JSON to us.
//   2. We store the subscription (see `demoPushSubscriptions` table).
//   3. At delivery time we call `sendWebPush(subscription, payload)` — the
//      push service forwards the payload to the browser, the service worker
//      receives it and shows a native OS notification.
//
// Failure mode:
//   - 404/410 from the push service means the subscription is dead (user
//     uninstalled the PWA, cleared data, revoked perms). Callers should delete
//     the row when this helper returns `{ ok: false, gone: true }`.
// ─────────────────────────────────────────────────────────────────────────────

import webpush, { type PushSubscription, type SendResult } from "web-push";

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth:   string;
  };
}

export interface WebPushPayload {
  title: string;
  body:  string;
  /** Optional URL to open when the notification is clicked. */
  url?:  string;
  /** Optional icon URL (defaults to /icons/icon-192.png in the SW). */
  icon?: string;
  /** Optional arbitrary payload for the SW to consume. */
  data?: Record<string, unknown>;
}

export interface WebPushResult {
  ok:    boolean;
  /** True when the push service reported the sub is no longer valid (404/410). */
  gone?: boolean;
  error?: string;
}

let vapidConfigured = false;

function configureVapidOnce() {
  if (vapidConfigured) return;
  const pub     = process.env.VAPID_PUBLIC_KEY;
  const priv    = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_EMAIL ?? "mailto:hello@vestream.io";
  if (!pub || !priv) {
    throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set");
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
}

/**
 * Send a web push notification to a single subscription.
 *
 * Returns `{ ok: false, gone: true }` if the subscription is no longer valid —
 * the caller should delete the stored subscription row in that case.
 */
export async function sendWebPush(
  sub:     WebPushSubscription,
  payload: WebPushPayload,
): Promise<WebPushResult> {
  try {
    configureVapidOnce();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "VAPID config error" };
  }

  const body = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    url:   payload.url  ?? "/demo",
    icon:  payload.icon ?? "/icons/icon-192.png",
    data:  payload.data ?? {},
  });

  try {
    const result: SendResult = await webpush.sendNotification(
      sub as PushSubscription,
      body,
      { TTL: 60 }, // short TTL — milestone pings are time-sensitive
    );
    // web-push resolves with a status in the 2xx range on success
    const ok = result.statusCode >= 200 && result.statusCode < 300;
    return ok ? { ok: true } : { ok: false, error: `push service HTTP ${result.statusCode}` };
  } catch (err) {
    // web-push throws a WebPushError with a .statusCode on non-2xx
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, error: `subscription gone (${status})` };
    }
    return {
      ok:    false,
      error: err instanceof Error ? err.message : "web-push send failed",
    };
  }
}
