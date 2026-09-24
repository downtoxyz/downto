# down to — native iOS

SwiftUI app for iOS 26+, Swift 6.2, one target. Specs live in `docs/` (`INVENTORY.md` → what, `ARCHITECTURE.md` → how it's built, `DESIGN.md` → how it looks, `DECISIONS.md` wins on conflicts).

**Rule: regenerate with `make gen`; never open the pbxproj in git.** `Downto.xcodeproj` is gitignored and produced from `project.yml` by XcodeGen (version in `.tool-versions`). Edit `project.yml`, never the project file.

```sh
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig   # once; empty DEVELOPMENT_TEAM is fine for the simulator
make gen            # xcodegen generate → Downto.xcodeproj (+ Downto/Config/Info.plist, committed)
make build          # Debug-Local, iPhone 17 Pro simulator, -warnings-as-errors
make test           # check-privacy + check-enums scripts, then DowntoTests (Swift Testing)
make test-domain    # Downto/Domain + DowntoTests/Domain as a macOS SwiftPM package — seconds, no simulator
make ui-test        # DowntoUITests (XCUITest) on the simulator
make run screenshot # install + launch on the booted simulator, then /tmp/downto.png
```

Configs: `Debug-Local` (local Supabase at 127.0.0.1:54321 + `npm run dev`), `Debug-Staging`, `Debug-Prod`/`Release` — values in `Config/*.xcconfig`, injected into Info.plist and read by `AppConfig` (throws on a missing key). `xcbeautify` is optional; the Makefile falls back to `cat`. Override the simulator with `make build SIM="platform=iOS Simulator,name=iPhone 17 Pro,OS=26.3"`.
