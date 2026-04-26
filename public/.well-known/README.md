# /.well-known/ — Universal Links + App Links infra

These files enable iOS Universal Links and Android App Links so that URLs
on `vestream.io` open directly inside the Vestream mobile app when it's
installed (instead of bouncing to Safari/Chrome and back).

> **Status: TEMPLATE.** Both files contain placeholder values that MUST
> be filled in before the mobile app launches. Until then, iOS/Android
> will fail validation, deep linking will silently no-op, and users will
> get the (acceptable) fallback of opening the URL in their browser.

## What needs to be filled in

### `apple-app-site-association` (iOS)

Replace `REPLACE_WITH_TEAMID` with the Apple Developer **Team ID** of
the Vestream developer account. You can find it in:

1. App Store Connect → Membership → Team ID (10-character alphanumeric)
2. or the iOS app's `app.json` after eas build outputs it

The full `appID` becomes `<TEAMID>.io.vestream.app` (Team ID + bundle ID).

The file MUST be served with `Content-Type: application/json` — Vercel
config in `/vercel.json` handles this.

### `assetlinks.json` (Android)

Replace `REPLACE_WITH_SHA256_OF_RELEASE_SIGNING_CERT_COLON_SEPARATED_HEX`
with the SHA-256 fingerprint of the **release signing certificate**, in
colon-separated uppercase hex format
(e.g. `14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E7:4D:36:E1:53:73:30:DD:01:90:6B:0B`).

To extract the fingerprint:

```bash
# From a Play Store upload key (preferred — what Google actually signs with)
keytool -printcert -file upload-cert.pem | grep "SHA-256"

# From your local debug keystore (only useful for development testing)
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android \
  | grep "SHA256:"
```

For Play App Signing (Google manages the signing key), get the SHA-256
from Google Play Console → Setup → App integrity → App signing key
certificate.

## After filling in: verify

iOS:
```bash
curl -i https://vestream.io/.well-known/apple-app-site-association
# Should return 200 + Content-Type: application/json + valid JSON body
```

Apple's validation tool: https://app-site-association.cdn-apple.com/a/v1/vestream.io

Android:
```bash
curl -s https://vestream.io/.well-known/assetlinks.json | jq .
# Should return valid JSON with the SHA-256 fingerprint
```

Google's validation tool:
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://vestream.io&relation=delegate_permission/common.handle_all_urls

## Deep-link path coverage

The current paths config covers these mobile-relevant URLs:

- `vestream.io/find-vestings` — paste-a-wallet flow → opens in app's
  scan screen
- `vestream.io/protocols/*` — protocol detail pages → opens in app's
  protocol view
- `vestream.io/stream/*` — individual stream → opens in app's stream
  detail (deep links from push notifications)
- `vestream.io/claim/*` — claim flow → opens in app's claim screen
- `vestream.io/token/*` — token explorer → opens in app's token view

Excluded (must stay in browser):
- `/api/*` — API endpoints
- `/admin/*`, `/dashboard/*`, `/developer/*` — gated routes that don't
  exist in the mobile app

## Mobile-side configuration

The corresponding mobile-app config also needs to be updated:

**iOS (`Projects/vestream-app/app.json`)**: add `associatedDomains`
under `ios`:
```json
"ios": {
  "associatedDomains": ["applinks:vestream.io"]
}
```

**Android (`Projects/vestream-app/app.json`)**: add `intentFilters`
under `android`:
```json
"android": {
  "intentFilters": [{
    "action": "VIEW",
    "autoVerify": true,
    "data": [{ "scheme": "https", "host": "vestream.io" }],
    "category": ["BROWSABLE", "DEFAULT"]
  }]
}
```

Both changes require an EAS build + App Store / Play Store submission to
take effect (Universal Links / App Links are validated by the OS at
install time, not on first launch).
