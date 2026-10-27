#!/usr/bin/env python3
"""scripts/gen-colors.py — writes one Asset Catalog colour set per DESIGN.md §1.2–§1.3 token (Any + Dark slots).
Re-run after editing the TOKENS table; the output is committed. Idempotent."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Downto", "Resources", "Assets.xcassets", "Colors")

# name: (light_hex, light_alpha, dark_hex, dark_alpha) — DESIGN.md §1.2 / §1.3 verbatim
TOKENS = {
    "paper": ("FCFFE2", 1, "141410", 1), "card": ("FCFFE2", 1, "141410", 1),
    "surface": ("E0DCC8", 1, "1E1E18", 1), "deep": ("D8D4C0", 1, "262620", 1),
    "ink": ("2A2A1A", 1, "F2F2DC", 1),
    "inkMuted": ("6B6B5A", 1, "B8B8A0", 1), "inkMutedOnSurface": ("55554A", 1, "B8B8A0", 1),
    "inkExpired": ("6E6E5C", 1, "A6A690", 1), "inkDim": ("8A8A70", 1, "8A8A70", 1), "inkFaint": ("B0B098", 1, "5A5A48", 1),
    "rule": ("D8D4C0", 1, "2C2C24", 1), "ruleLight": ("C8C4B0", 1, "363630", 1), "ruleMid": ("B8B4A0", 1, "44443A", 1),
    "dt": ("FE44FF", 1, "FE44FF", 1), "dtInk": ("C400C6", 1, "FF7AFF", 1), "dtInkOnSurface": ("A000A2", 1, "FF9AFF", 1),
    "onDt": ("2A2A1A", 1, "141410", 1),
    "dtFaint": ("FE44FF", 0.04, "FE44FF", 0.06), "dtSubtle": ("FE44FF", 0.08, "FE44FF", 0.10),
    "dtLight": ("FE44FF", 0.15, "FE44FF", 0.18), "dtMid": ("FE44FF", 0.50, "FE44FF", 0.50),
    "pool": ("00D4FF", 1, "00D4FF", 1), "poolInk": ("007A93", 1, "5AE3FF", 1), "poolInkOnSurface": ("00607A", 1, "5AE3FF", 1),
    "squad": ("A855F7", 1, "B47CFF", 1), "squadInk": ("7C3FD0", 1, "C9A6FF", 1), "squadInkOnSurface": ("6A34B8", 1, "C9A6FF", 1),
    "danger": ("FF6B6B", 1, "FF7B7B", 1), "dangerInk": ("C63838", 1, "FF9C9C", 1), "dangerInkOnSurface": ("A82E2E", 1, "FF9C9C", 1),
    "success": ("51CF66", 1, "6BE07E", 1), "successInk": ("1F7A32", 1, "8EE59E", 1), "successInkOnSurface": ("1A6B2B", 1, "8EE59E", 1),
    "warn": ("FFA94D", 1, "FFB866", 1), "warnInk": ("8F5210", 1, "FFC98A", 1),
    "info": ("5AC8FA", 1, "6AD0FF", 1), "unreadSquad": ("FF3B30", 1, "FF453A", 1),
    "newLime": ("C2FF8A", 1, "8FD95A", 1), "newInk": ("C400A6", 1, "141410", 1),
    "checkMine": ("F0FFD8", 1, "1C2414", 1), "checkDown": ("ECFFA5", 1, "26301A", 1),
    "checkNew": ("FFF5CC", 1, "2A2614", 1), "checkNewRule": ("E8E0B0", 1, "3E3A22", 1),
    "waitlistBg": ("FFF3E0", 1, "2E2416", 1), "downIdle": ("F5F7EA", 1, "1A1C14", 1), "downIdleRule": ("CDC999", 1, "3C3E2A", 1),
    "heroWash": ("FCFFE2", 0.30, "141410", 0.45), "heroWashDown": ("C8E63C", 0.30, "C8E63C", 0.22),
}


# Dragonfruit edition (src/lib/themes/dragonfruit.ts, OKLCH scales resolved to sRGB): dark warm-gray paper, magenta rules, lime accent.
# Written as `df_<name>` colour sets (both slots identical); `Color.dt(_:)` picks them when Edition.current == .dragonfruit.
DRAGONFRUIT = {
    "paper": ("0C080A", 1), "card": ("130D11", 1), "surface": ("1D161A", 1), "deep": ("151013", 1),
    "ink": ("F1E8EE", 1),
    "inkMuted": ("AEA0A8", 1), "inkMutedOnSurface": ("D5CAD1", 1),
    "inkExpired": ("8B7B85", 1), "inkDim": ("8B7B85", 1), "inkFaint": ("6F5D68", 1),
    "rule": ("3B2F36", 1), "ruleLight": ("51434C", 1), "ruleMid": ("A32384", 1),
    "dt": ("E2F400", 1), "dtInk": ("E2F400", 1), "dtInkOnSurface": ("EFFF60", 1),
    "onDt": ("0A0A00", 1),
    "dtFaint": ("E2F400", 0.06), "dtSubtle": ("E2F400", 0.12), "dtLight": ("E2F400", 0.22), "dtMid": ("E2F400", 0.55),
    "pool": ("00D4FF", 1), "poolInk": ("5AE3FF", 1), "poolInkOnSurface": ("5AE3FF", 1),
    "squad": ("C026D3", 1), "squadInk": ("FF83E6", 1), "squadInkOnSurface": ("FFAFF6", 1),
    "danger": ("FF4D6D", 1), "dangerInk": ("FF8AA0", 1), "dangerInkOnSurface": ("FFA3B4", 1),
    "success": ("51CF66", 1), "successInk": ("8EE59E", 1), "successInkOnSurface": ("8EE59E", 1),
    "warn": ("FFA94D", 1), "warnInk": ("FFC98A", 1),
    "info": ("5AC8FA", 1), "unreadSquad": ("FF453A", 1),
    "newLime": ("CBDC00", 1), "newInk": ("0A0A00", 1),
    "checkMine": ("3E0430", 1), "checkDown": ("2D3200", 1),
    "checkNew": ("424800", 1), "checkNewRule": ("8D9A00", 1),
    "waitlistBg": ("2E2416", 1), "downIdle": ("281E24", 1), "downIdleRule": ("A32384", 1),
    "heroWash": ("FFF0F5", 0.55), "heroWashDown": ("C8E63C", 0.60),
}


def comp(hexv, alpha):
    return {"color-space": "srgb", "components": {
        "alpha": f"{alpha:.3f}", "red": f"0x{hexv[0:2]}", "green": f"0x{hexv[2:4]}", "blue": f"0x{hexv[4:6]}"}}


os.makedirs(OUT, exist_ok=True)
for name, (lh, la, dh, da) in TOKENS.items():
    d = os.path.join(OUT, f"{name}.colorset")
    os.makedirs(d, exist_ok=True)
    doc = {"colors": [
        {"idiom": "universal", "color": comp(lh, la)},
        {"idiom": "universal", "appearances": [{"appearance": "luminosity", "value": "dark"}], "color": comp(dh, da)},
    ], "info": {"author": "xcode", "version": 1}}
    with open(os.path.join(d, "Contents.json"), "w") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
missing = set(TOKENS) - set(DRAGONFRUIT)
assert not missing, f"DRAGONFRUIT is missing {sorted(missing)}"
for name, (h, a) in DRAGONFRUIT.items():
    d = os.path.join(OUT, f"df_{name}.colorset")
    os.makedirs(d, exist_ok=True)
    doc = {"colors": [
        {"idiom": "universal", "color": comp(h, a)},
        {"idiom": "universal", "appearances": [{"appearance": "luminosity", "value": "dark"}], "color": comp(h, a)},
    ], "info": {"author": "xcode", "version": 1}}
    with open(os.path.join(d, "Contents.json"), "w") as f:
        json.dump(doc, f, indent=2)
        f.write("\n")
if "--print-names" in sys.argv:
    print("\n".join(TOKENS))
print(f"gen-colors: wrote {len(TOKENS)} colour sets to {os.path.relpath(OUT, HERE)}")
