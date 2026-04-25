# iOS push notifications — one-time setup

The code-side wiring (Capacitor plugin, JS registration, server APN sender,
DB token storage, `App.entitlements`) is all in the repo. What's left is the
Apple-portal + secrets glue. Do these once per app — they don't change again
unless you rotate the APNs key.

## 1. Enable the capability on the App ID (Apple Developer portal)

https://developer.apple.com/account → Certificates, Identifiers & Profiles → Identifiers
→ click `xyz.downto.app` → check **Push Notifications** → Save.

You'll be asked to confirm — accept. Existing provisioning profiles will be
invalidated; Xcode regenerates them automatically the next time you archive.

## 2. Generate an APNs auth key (.p8)

Same dashboard → **Keys** → **+** (top-right):

- Name: `downto APNs key` (anything works, just be descriptive)
- Check **Apple Push Notifications service (APNs)**
- Continue → Register → **Download** the `.p8` file

⚠️ You can only download the .p8 file **once**. Store it somewhere safe (1Password
or a password-manager note works). If you lose it you'll have to revoke + regenerate.

Note the **Key ID** (10 characters, shown next to the key). You'll also need
your **Team ID** — top-right of the Apple Developer portal, also 10 characters.

## 3. Set the APN secrets in Vercel

Project → Settings → Environment Variables. For **Production**, **Preview**,
**Development**:

| name | value |
|---|---|
| `APNS_KEY_ID` | the 10-char Key ID from step 2 |
| `APNS_TEAM_ID` | your 10-char Team ID |
| `APNS_BUNDLE_ID` | `xyz.downto.app` |
| `APNS_KEY_BASE64` | output of `base64 -i AuthKey_XXXXX.p8 \| tr -d '\n'` |
| `APNS_SANDBOX` | `true` for Preview/Development, leave **unset** for Production |

`APNS_SANDBOX=true` routes pushes through Apple's sandbox APNs (works only with
development provisioning profiles, i.e. TestFlight builds with a dev profile or
local Xcode debug builds). Production pushes (App Store builds) need
`APNS_SANDBOX` to be unset/false.

## 4. In Xcode, confirm the capability shows up

Open `ios/App/App.xcworkspace` (not `.xcodeproj`) → click the **App** target
→ **Signing & Capabilities** tab. You should see **Push Notifications**
already listed (because `App.entitlements` references `aps-environment`).

If it's missing: click **+ Capability** → search "Push Notifications" → add.
This will sync with the App ID's enabled capabilities.

You may need to click **Try Again** under Signing if Xcode complains about
provisioning — Apple just regenerated the profile after step 1.

## 5. Smoke test

1. Pick an iOS device (push doesn't work in the simulator).
2. Run `npm run cap:sync && npx cap run ios` (or open in Xcode and Run).
3. App launches, you sign in, accept the push permission prompt.
4. Verify a row landed in `native_push_tokens` for your user (query staging or prod via SQL).
5. Trigger any notification (e.g. have a friend respond `down` to your check). The push should land within a few seconds.

If it doesn't:

- Server logs: `/api/push/send` will log APN errors with reason codes.
- Most common: `BadDeviceToken` (sandbox/prod mismatch — check `APNS_SANDBOX`).
- Next most common: `Unregistered` (token belongs to a different bundle ID or the user uninstalled the app — the row should be cleaned up automatically).
