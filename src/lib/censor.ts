/**
 * Wingdings-flavor redaction for mystery checks.
 *
 * Why not the actual Wingdings font: not bundled on Android, inconsistent in
 * WKWebView, would silently fall back to ASCII and blow the redaction. Unicode
 * symbol scramble works everywhere and looks the same regardless of platform.
 *
 * Pool is curated for the cream/magenta zine vibe — stars, asterisks, sparkles,
 * blocks. Avoid emoji (renderer-dependent, looks wrong against mono text).
 */

const WINGDINGS_POOL = [
  "✦", "✧", "✪", "✰", "✩", "✫", "✬", "✭", "✮",
  "❀", "✿", "❉", "❊", "✤", "✣",
  "◈", "◉", "◇", "◆", "◊",
  "▓", "▒",
  "✱", "✲", "✳", "✴", "✵",
  "★", "☆",
];

/** Stable 32-bit hash of a string. djb2-ish, plenty for a deterministic-shuffle seed. */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Deterministic, fixed-length symbol scramble. Same `seed` always yields the
 * same string, so the redacted version of a given check stays stable across
 * re-renders / refreshes — important so the host doesn't visually "reveal"
 * by their redacted name suddenly changing.
 *
 * Length defaults to 6; intentionally NOT the real name length (that would
 * leak information).
 */
export function censorWingdings(seed: string, length = 6): string {
  const h = hashSeed(seed);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += WINGDINGS_POOL[(h + i * 2654435761) % WINGDINGS_POOL.length];
  }
  return out;
}

/** Single deterministic symbol — for avatar slots and other one-glyph spots. */
export function censorGlyph(seed: string): string {
  return WINGDINGS_POOL[hashSeed(seed) % WINGDINGS_POOL.length];
}
