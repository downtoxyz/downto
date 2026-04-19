export type ThemeName = "guava" | "dragonfruit";

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

  // Down button (idle state — active state uses accent)
  downIdleBg: string;
  downIdleBorder: string;

  // Interest check card states
  checkMineBg: string;      // user's own check
  checkDownBg: string;      // user responded "down"
  checkNewBg: string;       // newly added (freshly created)
  checkNewBorder: string;

  // Event card image wash (tint over blurred hero image)
  eventImageWash: string;       // default state
  eventImageWashDown: string;   // user is "down" on this event

  // Fonts
  fontMono: string;
  fontSerif: string;

  // Meta
  themeColor: string;

  // Optional background image (path relative to /public)
  bgImage?: string;
}
