#!/bin/bash
# Check whether a deploy needs user-facing update notifications.
# Compares current branch against main and flags user-facing file changes.

set -euo pipefail

# Files/dirs that affect what users see
USER_FACING=(
  "src/components/"
  "src/hooks/"
  "src/app/page.tsx"
  "src/app/layout.tsx"
  "src/lib/styles.ts"
  "src/lib/db.ts"
  "src/lib/types.ts"
  "public/"
)

base="${1:-main}"
changed=$(git diff "$base"...HEAD --name-only 2>/dev/null)

if [ -z "$changed" ]; then
  echo "No changes vs $base."
  exit 0
fi

hits=()
safe=()

while IFS= read -r file; do
  match=false
  for pattern in "${USER_FACING[@]}"; do
    if [[ "$file" == "$pattern"* ]]; then
      hits+=("  $file")
      match=true
      break
    fi
  done
  if [ "$match" = false ]; then
    safe+=("  $file")
  fi
done <<< "$changed"

echo ""
if [ ${#safe[@]} -gt 0 ]; then
  echo "Non-user-facing:"
  printf '%s\n' "${safe[@]}"
fi

echo ""
if [ ${#hits[@]} -gt 0 ]; then
  echo "User-facing:"
  printf '%s\n' "${hits[@]}"
  echo ""
  echo "-> Users should update. Do NOT set SKIP_UPDATE_NOTIFY."
else
  echo "-> No user-facing changes. Safe to set SKIP_UPDATE_NOTIFY=true."
fi
