// Perceptual OKLCH color scales — 12 steps per hue, Radix-inspired
// roles:
//   1  app background        (darkest)
//   2  card background
//   3  elevated surface
//   4  deep/between (1–2)
//   5  subtle border
//   6  border
//   7  strong border / quiet text
//   8  hairline / faint text
//   9  dim text
//   10 muted text
//   11 secondary text
//   12 primary text         (brightest)
//
// Tweak a single step's L or C and it ripples through every token that
// references it, so contrast relationships stay coherent.

type Scale = { [K in 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12]: string };

const buildScale = (hue: number, L: number[], C: number[]): Scale => {
  const out: Record<number, string> = {};
  for (let i = 0; i < 12; i++) {
    out[i + 1] = `oklch(${L[i].toFixed(3)} ${C[i].toFixed(3)} ${hue})`;
  }
  return out as Scale;
};

// Hues (degrees)
export const HUE = {
  gray: 340,      // whisper of magenta in the neutrals
  magenta: 340,   // dragonfruit identity
  lime: 115,      // accent yellow-green
  warmPaper: 85,  // cream/paper for image wash overlays
};

// Warm gray — neutrals with tiny magenta bias. Chroma stays under 0.03.
export const gray = buildScale(
  HUE.gray,
  [0.140, 0.170, 0.210, 0.180, 0.250, 0.320, 0.400, 0.500, 0.600, 0.720, 0.850, 0.940],
  [0.010, 0.012, 0.015, 0.012, 0.018, 0.022, 0.025, 0.028, 0.025, 0.020, 0.015, 0.012],
);

// Magenta — chroma climbs with lightness, peaks at mid. For borders + identity.
export const magenta = buildScale(
  HUE.magenta,
  [0.150, 0.200, 0.250, 0.300, 0.350, 0.420, 0.500, 0.580, 0.650, 0.720, 0.800, 0.880],
  [0.050, 0.070, 0.100, 0.120, 0.150, 0.170, 0.190, 0.200, 0.220, 0.220, 0.200, 0.150],
);

// Lime — the accent. Step 9–10 = the vivid yellow-green.
export const lime = buildScale(
  HUE.lime,
  [0.150, 0.220, 0.300, 0.380, 0.450, 0.550, 0.650, 0.750, 0.850, 0.920, 0.960, 0.980],
  [0.050, 0.080, 0.100, 0.120, 0.140, 0.160, 0.180, 0.200, 0.220, 0.220, 0.180, 0.120],
);

// Warm paper — cream tones for image-wash overlays + their text/borders.
// Darker steps here are the "on-cream" ramp (borders + text over the wash).
export const warmPaper = buildScale(
  HUE.warmPaper,
  [0.120, 0.180, 0.260, 0.340, 0.420, 0.520, 0.620, 0.720, 0.820, 0.900, 0.960, 0.985],
  [0.012, 0.018, 0.028, 0.035, 0.040, 0.045, 0.040, 0.032, 0.025, 0.020, 0.015, 0.010],
);

// Cold gray — pure neutrals, zero chroma. For editorial/minimal direction
// where color shouldn't bleed into structure.
export const coldGray = buildScale(
  0,
  [0.140, 0.170, 0.210, 0.180, 0.250, 0.320, 0.400, 0.500, 0.600, 0.720, 0.850, 0.940],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
);
