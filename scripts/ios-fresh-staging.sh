#!/bin/bash
# Build + install iOS pointed at the staging stack (staging Supabase + the
# latest Vercel preview deploy). Use this for end-to-end push testing — the
# preview backend has APNS_SANDBOX=true, so it routes through sandbox APNs
# which is the only endpoint that accepts a dev-built app's device token.
#
# Why staging Supabase? The preview Vercel env is configured to point at
# the staging Supabase project, and JWT validation happens server-side
# against the Supabase project the backend is configured for. If the iOS
# app authenticates against prod Supabase, the JWT it sends is signed by
# prod's secret and the preview backend rejects it as 401. Building the
# iOS app against staging Supabase keeps app + backend in lockstep.
#
# Sign in with your real email at the OTP screen — staging Supabase will
# email the code to your inbox normally.
#
# Override the preview URL by exporting NEXT_PUBLIC_API_BASE before invoking.

set -euo pipefail

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$1"; }
fail() { printf "\033[1;31m✖ %s\033[0m\n" "$1" >&2; exit 1; }

command -v vercel >/dev/null || fail "vercel CLI not on PATH (npm i -g vercel)"

step "Pulling staging Supabase env from Vercel preview"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
vercel env pull "$TMP" --environment=preview --yes >/dev/null

STAGING_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL' "$TMP" | cut -d= -f2- | sed 's/^"//;s/"$//')
STAGING_KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY' "$TMP" | cut -d= -f2- | sed 's/^"//;s/"$//')
[ -n "$STAGING_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL missing in preview env"
[ -n "$STAGING_KEY" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY missing in preview env"
echo "  staging Supabase: $STAGING_URL"

step "Picking preview deploy URL"
if [ -n "${NEXT_PUBLIC_API_BASE:-}" ]; then
  PREVIEW="$NEXT_PUBLIC_API_BASE"
  echo "  override: $PREVIEW"
else
  PREVIEW=$(vercel ls 2>/dev/null | head -1)
  [ -n "$PREVIEW" ] || fail "couldn't fetch a preview URL via 'vercel ls'"
  echo "  latest:   $PREVIEW"
fi

# Sanity-check the preview is reachable + has CORS for capacitor://localhost
PREFLIGHT=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$PREVIEW/api/push/subscribe" \
  -H "Origin: capacitor://localhost" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type")
[ "$PREFLIGHT" = "204" ] \
  || fail "preview /api/push/subscribe preflight returned $PREFLIGHT (expected 204). Is Vercel Auth still off on previews?"

step "Building + installing iOS against staging"
NEXT_PUBLIC_API_BASE="$PREVIEW" \
NEXT_PUBLIC_SUPABASE_URL="$STAGING_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$STAGING_KEY" \
bash "$(dirname "$0")/ios-fresh.sh"

printf "\n\033[1;33m• Sign in with your real email — staging Supabase will OTP your inbox.\033[0m\n"
