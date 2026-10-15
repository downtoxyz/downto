#!/usr/bin/env python3
"""scripts/gen-grain.py — the 256×256 tileable fractal-noise tile of DESIGN.md §1.4 (4 octaves, exported 8-bit grey PNG).
Pure Python (no PIL/numpy); deterministic seed so the committed PNG is reproducible."""
import os, random, struct, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "Downto", "Resources", "Assets.xcassets", "grain-256.imageset", "grain-256.png")
N = 256
rng = random.Random(0xD7)


def lattice(period):
    return [[rng.random() for _ in range(period)] for _ in range(period)]


def smooth(t):
    return t * t * (3 - 2 * t)


def sample(lat, period, x, y):
    fx, fy = x * period / N, y * period / N
    x0, y0 = int(fx) % period, int(fy) % period
    x1, y1 = (x0 + 1) % period, (y0 + 1) % period
    tx, ty = smooth(fx - int(fx)), smooth(fy - int(fy))
    a = lat[y0][x0] * (1 - tx) + lat[y0][x1] * tx
    b = lat[y1][x0] * (1 - tx) + lat[y1][x1] * tx
    return a * (1 - ty) + b * ty


# baseFrequency 0.9 ≈ a lattice cell every ~1.1px → period 230 at octave 0; 4 octaves, halving the period and the gain
octaves = [(230, 1.0), (115, 0.5), (58, 0.25), (29, 0.125)]
lats = [(lattice(p), p, g) for p, g in octaves]
total = sum(g for _, g in octaves)
rows = []
for y in range(N):
    row = bytearray([0])  # PNG filter byte: none
    for x in range(N):
        v = sum(sample(l, p, x, y) * g for l, p, g in lats) / total
        row.append(max(0, min(255, int(round(v * 255)))))
    rows.append(bytes(row))


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 0, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
       + chunk(b"IEND", b""))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "wb") as f:
    f.write(png)
with open(os.path.join(os.path.dirname(OUT), "Contents.json"), "w") as f:
    f.write('{\n  "images" : [\n    { "filename" : "grain-256.png", "idiom" : "universal", "scale" : "1x" },\n'
            '    { "idiom" : "universal", "scale" : "2x" },\n    { "idiom" : "universal", "scale" : "3x" }\n  ],\n'
            '  "info" : { "author" : "xcode", "version" : 1 },\n'
            '  "properties" : { "template-rendering-intent" : "original" }\n}\n')
print(f"gen-grain: wrote {os.path.relpath(OUT, HERE)} ({len(png)} bytes)")
