# Store badges

`src/components/AppStoreBadges.tsx` renders the **official** App Store and
Google Play badge artwork from this folder. Add the two files below with these
exact names, then commit + deploy — the component picks them up automatically.
Until they're present, the component falls back to an inline re-creation (no
broken image).

| File (exact name) | Where to download | Notes |
|---|---|---|
| `app-store.svg` | https://developer.apple.com/app-store/marketing/guidelines/#section-badges | Use the **black** "Download on the App Store" badge. SVG preferred. |
| `google-play.png` | https://play.google.com/intl/en_us/badges/ | "Get it on Google Play" badge. Google ships PNG; keep the name `google-play.png`. |

Tips:
- Both render at `height: 48px` (width auto). Google's badge has more built-in
  padding, so at the same height the pair looks balanced — no resizing needed.
- If you grab a different format (e.g. an SVG Google badge), just rename it to
  match the path in `AppStoreBadges.tsx` (`/badges/app-store.svg`,
  `/badges/google-play.png`) or update the `badgeSrc` values there.
- Do **not** edit/recolor the official artwork — both companies' brand
  guidelines require it be used as-is.
