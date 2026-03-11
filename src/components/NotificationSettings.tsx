"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Prefs {
  emailEnabled: boolean;
  email: string | null;
  hoursBeforeUnlock: number;
}

const HOURS_OPTIONS = [1, 6, 12, 24, 48, 72];

export function NotificationSettings() {
  const [prefs, setPrefs] = useState<Prefs>({
    emailEnabled: false,
    email: null,
    hoursBeforeUnlock: 24,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((r) => r.json())
      .then(({ preferences }) => {
        if (preferences) setPrefs(preferences);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: prefs.emailEnabled,
          email: prefs.email,
          hoursBeforeUnlock: prefs.hoursBeforeUnlock,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to save");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailEnabled"
              checked={prefs.emailEnabled}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, emailEnabled: e.target.checked }))
              }
              className="w-4 h-4"
            />
            <Label htmlFor="emailEnabled">Enable email notifications</Label>
          </div>

          {prefs.emailEnabled && (
            <>
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={prefs.email ?? ""}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, email: e.target.value }))
                  }
                  className="mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="hours">Notify me before unlock</Label>
                <select
                  id="hours"
                  value={prefs.hoursBeforeUnlock}
                  onChange={(e) =>
                    setPrefs((p) => ({
                      ...p,
                      hoursBeforeUnlock: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {HOURS_OPTIONS.map((h) => (
                    <option key={h} value={h}>
                      {h} hour{h !== 1 ? "s" : ""} before
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
          {saved && <p className="text-green-600 text-sm">Settings saved.</p>}

          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
