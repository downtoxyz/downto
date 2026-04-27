#!/bin/bash
# Run Playwright e2e tests against local Supabase, regardless of what
# .env.development.local currently points at.
#
# We force the test dev server onto port 3101 (not 3000) so a parallel
# `npm run dev:staging` session — which is the most common setup — keeps
# running undisturbed during the test run. The exported env vars override
# anything in .env files because Next.js reads process.env first, so this
# also works when .env.development.local is currently swapped to staging.

set -e

# Pull the running Supabase's anon + service-role keys.
ENV_OUT=$(supabase status -o env 2>/dev/null || true)
if [ -z "$ENV_OUT" ]; then
  echo "Local Supabase isn't running. Start it with: supabase start" >&2
  exit 1
fi

ANON=$(echo "$ENV_OUT" | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
SR=$(echo "$ENV_OUT" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')

if [ -z "$ANON" ] || [ -z "$SR" ]; then
  echo "Failed to extract Supabase keys from 'supabase status'" >&2
  exit 1
fi

export PORT="${PORT:-3101}"
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON"
export SUPABASE_SERVICE_ROLE_KEY="$SR"
export PLAYWRIGHT_TEST_BASE_URL="http://127.0.0.1:${PORT}"

# Pass through any args (e.g. `npm run test:e2e -- e2e/check-creation.spec.ts`)
exec npx playwright test "$@"
