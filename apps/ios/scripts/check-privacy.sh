#!/usr/bin/env bash
# scripts/check-privacy.sh — ARCHITECTURE §1.3 rule (b).
# Greps Downto/ for Required Reason API usage and fails if a category is used in code but missing from
# Downto/Resources/PrivacyInfo.xcprivacy. Runs in `make test`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/Downto"
MANIFEST="$HERE/Downto/Resources/PrivacyInfo.xcprivacy"

[ -f "$MANIFEST" ] || { echo "check-privacy: $MANIFEST is missing" >&2; exit 1; }
plutil -lint -s "$MANIFEST" >/dev/null || { echo "check-privacy: $MANIFEST is not a valid plist" >&2; exit 1; }

# category | regex over Swift sources
checks=(
  "NSPrivacyAccessedAPICategoryUserDefaults|UserDefaults|@AppStorage|NSUbiquitousKeyValueStore"
  "NSPrivacyAccessedAPICategoryFileTimestamp|contentModificationDate|attributesOfItem|creationDate|\.modificationDate|fileModificationDate|getattrlist|fstat\(|stat\(|lstat\("
  "NSPrivacyAccessedAPICategoryDiskSpace|volumeAvailableCapacity|systemFreeSize|volumeTotalCapacity|statfs|statvfs"
  "NSPrivacyAccessedAPICategorySystemBootTime|systemUptime|mach_absolute_time|clock_gettime_nsec_np"
  "NSPrivacyAccessedAPICategoryActiveKeyboards|activeInputModes"
)

status=0
for entry in "${checks[@]}"; do
  category="${entry%%|*}"
  pattern="${entry#*|}"
  hits="$(grep -rEn --include='*.swift' "$pattern" "$SRC" || true)"
  declared=0
  grep -q "$category" "$MANIFEST" && declared=1
  if [ -n "$hits" ] && [ "$declared" -eq 0 ]; then
    echo "check-privacy: $category is used in code but not declared in PrivacyInfo.xcprivacy:" >&2
    echo "$hits" >&2
    status=1
  elif [ -z "$hits" ] && [ "$declared" -eq 1 ]; then
    echo "check-privacy: note — $category is declared but not (yet) used in code (fine while the stores are being built)"
  fi
done

if [ "$status" -eq 0 ]; then echo "check-privacy: OK"; fi
exit "$status"
