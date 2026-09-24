#!/usr/bin/env bash
# scripts/test-domain.sh — ARCHITECTURE §12.
# Assembles Downto/Domain + DowntoTests/Domain into a throwaway SwiftPM package and runs `swift test` on macOS.
# The package uses the SAME default isolation as the app (MainActor) so it proves that every Domain type/function is
# genuinely `nonisolated`, and it links nothing but Foundation so it proves Domain names no type outside Domain.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOMAIN="$HERE/Downto/Domain"
TESTS="$HERE/DowntoTests/Domain"
PKG="${DOMAIN_PKG_DIR:-${TMPDIR:-/tmp}/DowntoDomain}"

# 1. Import hygiene: Domain may import Foundation and nothing else.
bad=0
while IFS= read -r f; do
  if grep -E '^\s*(@testable\s+)?import\s+' "$f" | grep -vqE '^\s*import\s+Foundation\s*$'; then
    echo "check-domain: $f imports something other than Foundation:" >&2
    grep -nE '^\s*(@testable\s+)?import\s+' "$f" | grep -vE '^\S+:\s*import\s+Foundation\s*$' >&2
    bad=1
  fi
done < <(find "$DOMAIN" -name '*.swift')
if [ "$bad" -ne 0 ]; then exit 1; fi

# 2. Assemble the package (copy, not symlink — SwiftPM does not reliably follow symlinked source roots).
rm -rf "$PKG"
mkdir -p "$PKG/Sources/Downto" "$PKG/Tests/DowntoDomainTests"
cp "$DOMAIN"/*.swift "$PKG/Sources/Downto/"
if compgen -G "$TESTS/*.swift" >/dev/null; then cp "$TESTS"/*.swift "$PKG/Tests/DowntoDomainTests/"; fi

cat > "$PKG/Package.swift" <<'EOF'
// swift-tools-version: 6.2
import PackageDescription

let isolation: [SwiftSetting] = [
    .defaultIsolation(MainActor.self),          // same as SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor in project.yml
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("ExistentialAny"),
    .unsafeFlags(["-warnings-as-errors"]),
]

let package = Package(
    name: "DowntoDomain",
    platforms: [.macOS(.v15)],
    targets: [
        .target(name: "Downto", path: "Sources/Downto", swiftSettings: isolation),
        .testTarget(name: "DowntoDomainTests", dependencies: ["Downto"], path: "Tests/DowntoDomainTests", swiftSettings: isolation),
    ],
    swiftLanguageModes: [.v6]
)
EOF

echo "test-domain: package at $PKG"
cd "$PKG"
swift test 2>&1 | (command -v xcbeautify >/dev/null && xcbeautify || cat)
