# apps/ios/Makefile — see ARCHITECTURE.md §12
SHELL := /bin/bash
# xcodebuild's exit status must survive the pipe into the (optional) prettifier. macOS ships GNU Make 3.81, which
# silently IGNORES .SHELLFLAGS (added in 3.82), so every piped recipe also sets pipefail inline via $(PIPEFAIL).
.SHELLFLAGS := -o pipefail -c
PIPEFAIL = set -o pipefail;
# No OS= pin: the runtime on the dev Mac is 26.3.x; pinning 26.2 makes xcodebuild fail to find a destination.
# Override: make build SIM="platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3"
# (Make keeps trailing whitespace in a variable value — never put a comment on the same line as SIM.)
SIM ?= platform=iOS Simulator,name=iPhone 17 Pro
PROJ = Downto.xcodeproj
DD   = .build
# xcbeautify is optional and NOT installed by default; never `brew install` from a make target.
PRETTY = (command -v xcbeautify >/dev/null && xcbeautify || cat)
# Ad-hoc signing (not NO signing): an unsigned simulator app has no entitlements, so the Keychain rejects writes, supabase-swift
# cannot persist the session, and every PostgREST call silently goes out as `anon` (empty feed, no session after relaunch).
XCB = xcodebuild -project $(PROJ) -scheme Downto-Local -destination "$(SIM)" -derivedDataPath $(DD) CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-

.PHONY: gen resolve build test test-domain ui-test ui-test-live snapshot-record run screenshot clean check

gen:            ; xcodegen generate --spec project.yml
resolve: gen    ; xcodebuild -resolvePackageDependencies -project $(PROJ) -scheme Downto-Local -derivedDataPath $(DD)
build: gen      ; $(PIPEFAIL) $(XCB) build 2>&1 | $(PRETTY)
check:          ; scripts/check-privacy.sh && scripts/check-enums.sh
test: gen check ; $(PIPEFAIL) $(XCB) test -only-testing:DowntoTests 2>&1 | $(PRETTY)
test-domain:    ; scripts/test-domain.sh          # assembles Downto/Domain + DowntoTests/Domain into a temp SwiftPM package and runs `swift test` on macOS
ui-test: gen    ; $(PIPEFAIL) $(XCB) test -only-testing:DowntoUITests 2>&1 | $(PRETTY)
ui-test-live: gen ; (cd ../.. && supabase start && npm run dev &) ; $(PIPEFAIL) $(XCB) test -only-testing:DowntoUITests/LiveSmokeTests 2>&1 | $(PRETTY)
snapshot-record:; SNAPSHOT_TESTING_RECORD=all $(MAKE) test
ARGS ?=
run: build      ; xcrun simctl boot "iPhone 17 Pro" || true; xcrun simctl terminate booted xyz.downto.app || true; xcrun simctl install booted $(DD)/Build/Products/Debug-Local-iphonesimulator/Downto.app; xcrun simctl launch booted xyz.downto.app $(ARGS)
screenshot:     ; xcrun simctl io booted screenshot /tmp/downto.png
clean:          ; rm -rf $(DD) $(PROJ)
