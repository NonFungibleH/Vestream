/**
 * Expo push notification sender.
 *
 * Uses the Expo Push API — no SDK dependency, just a direct POST.
 * Free users get 3 lifetime push credits (enforced by
 * `checkAndConsumePushCredit` before calling `sendExpoPush`). Paid tiers
 * are unmetered.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export interface ExpoPushPayload {
  to: string;                          // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
}

export interface ExpoPushResult {
  ok: boolean;
  /** Expo "ticket" id, used later to check receipts. */
  ticketId?: string;
  error?: string;
}

export async function sendExpoPush(payload: ExpoPushPayload): Promise<ExpoPushResult> {
  if (!payload.to || !payload.to.startsWith("ExponentPushToken")) {
    return { ok: false, error: "Invalid Expo push token" };
  }

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept":           "application/json",
        "Accept-encoding":  "gzip, deflate",
        "Content-Type":     "application/json",
      },
      body: JSON.stringify({
        to:       payload.to,
        title:    payload.title,
        body:     payload.body,
        data:     payload.data ?? {},
        sound:    payload.sound ?? "default",
        badge:    payload.badge,
        priority: payload.priority ?? "high",
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `Expo push HTTP ${res.status}` };
    }

    const json = await res.json() as { data?: { id?: string; status?: string; message?: string } };
    if (json.data?.status === "error") {
      return { ok: false, error: json.data.message ?? "Expo push error" };
    }

    return { ok: true, ticketId: json.data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown push error" };
  }
}
