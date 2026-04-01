#!/bin/bash
# Build static export for Capacitor, excluding server-only routes
set -e

BACKUP_DIR="/tmp/downto-server-backup-$$"
mkdir -p "$BACKUP_DIR"

# Directories that can't be statically exported (API routes, SSR pages)
SERVER_DIRS=(
  "src/app/api"
  "src/app/check"
)

# Temporarily move server-only dirs out of the project
for dir in "${SERVER_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    mv "$dir" "$BACKUP_DIR/$(basename "$dir")"
  fi
done

# Restore server dirs on exit (even if build fails)
restore() {
  for dir in "${SERVER_DIRS[@]}"; do
    local name=$(basename "$dir")
    local parent=$(dirname "$dir")
    if [ -d "$BACKUP_DIR/$name" ]; then
      mv "$BACKUP_DIR/$name" "$parent/$name"
    fi
  done
  rm -rf "$BACKUP_DIR"
}
trap restore EXIT

# Run static export build
CAPACITOR_BUILD=true npx next build

echo ""
echo "Static export ready in ./out"
echo "Copy ./out to Capacitor: npx cap copy"
