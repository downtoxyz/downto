import type { ThemeTokens } from "./types";
import { gray, magenta, lime } from "./scales";

// Dragonfruit — Y2K direction: loud, saturated magenta borders, lime
// accent at max punch. Built on OKLCH scales so tuning `scales.ts`
// ripples through every token that references a step.
export const dragonfruit: ThemeTokens = {
  // Surfaces — low chroma warm gray, dragonfruit-tinted
  bg: gray[1],
  card: gray[2],
  surface: gray[3],
  deep: gray[4],

  // Text ramp
  text: gray[12],
  muted: gray[10],
  dim: gray[9],
  faint: gray[8],

  // Borders — vivid magenta. Meant to be seen.
  border: magenta[6],
  borderLight: magenta[7],
  borderMid: magenta[9],

  // Accent — lime at max punch
  accent: lime[10],
  onAccent: "#0a0a00",
  accentFaint: `oklch(0.92 0.22 115 / 0.06)`,
  accentSubtle: `oklch(0.92 0.22 115 / 0.12)`,
  accentLight: `oklch(0.92 0.22 115 / 0.22)`,
  accentMid: `oklch(0.92 0.22 115 / 0.55)`,

  pool: "#00D4FF",
  danger: "#ff4d6d",
  success: "#51cf66",
  warn: "#ffa94d",
  info: "#5ac8fa",
  squad: "#c026d3",

  downIdleBg: gray[5],
  downIdleBorder: magenta[7],

  // Check states
  checkMineBg: magenta[3],
  checkDownBg: lime[3],
  checkNewBg: lime[4],
  checkNewBorder: lime[7],

  eventImageWash: "rgba(255,240,245,0.55)",
  eventImageWashDown: "rgba(200,230,60,0.6)",

  fontMono: "var(--font-space-mono), monospace",
  fontSerif: "var(--font-instrument-serif), serif",
  serifTitleTracking: "0.04em",

  themeColor: "#141412",
};
