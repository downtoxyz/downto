export type ThemeName = "guava" | "acid" | "firefly" | "midnight" | "monochrome";

export interface ThemeTokens {
  // Core palette
  accent: string;
  bg: string;
  card: string;
  surface: string;
  deep: string;
  text: string;
  muted: string;
  dim: string;
  faint: string;
  border: string;
  borderLight: string;
  borderMid: string;
  pool: string;

  // Semantic colors
  danger: string;
  success: string;
  warn: string;
  info: string;
  squad: string;

  // Accent opacity variants
  accentFaint: string;   // ~0.04 opacity
  accentSubtle: string;  // ~0.08 opacity
  accentLight: string;   // ~0.15 opacity
  accentMid: string;     // ~0.5 opacity

  // Contrast
  onAccent: string;

  // Fonts
  fontMono: string;
  fontSerif: string;

  // Meta
  themeColor: string;

  // Optional background image (path relative to /public)
  bgImage?: string;
}
