
import { guava } from "./guava";
import { dragonfruit } from "./dragonfruit";
import type { ThemeName, ThemeTokens } from "./types";

export const themes: Record<ThemeName, ThemeTokens> = { guava, dragonfruit };

export const DEFAULT_THEME: ThemeName = "guava";

export function getThemeName(): ThemeName {
  const envTheme = process.env.NEXT_PUBLIC_THEME as ThemeName | undefined;
  if (envTheme && envTheme in themes) return envTheme;
  return DEFAULT_THEME;
}

/** Convert a ThemeTokens object into CSS custom property declarations */
export function themeToCSSSVars(theme: ThemeTokens): string {
  const vars = Object.entries(theme)
    .filter(([, value]) => value != null)
    .map(([key, value]) => {
      // camelCase → kebab-case: borderLight → border-light
      const cssKey = `--t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
      return `${cssKey}: ${value};`;
    })
    .join(" ");

  // Also override Tailwind @theme vars so utility classes (bg-dt, text-danger,
  // font-mono, font-serif) respond to theme changes at runtime
  const tailwindOverrides = [
    `--color-dt: ${theme.accent};`,
    `--color-danger: ${theme.danger};`,
    `--color-neutral-925: ${theme.card};`,
    `--color-bg: ${theme.bg};`,
    `--color-card: ${theme.card};`,
    `--color-surface: ${theme.surface};`,
    `--color-deep: ${theme.deep};`,
    `--color-primary: ${theme.text};`,
    `--color-muted: ${theme.muted};`,
    `--color-dim: ${theme.dim};`,
    `--color-faint: ${theme.faint};`,
    `--color-border: ${theme.border};`,
    `--color-border-light: ${theme.borderLight};`,
    `--color-border-mid: ${theme.borderMid};`,
    `--color-on-accent: ${theme.onAccent};`,
    `--color-down-idle-bg: ${theme.downIdleBg};`,
    `--color-down-idle-border: ${theme.downIdleBorder};`,
    `--color-check-mine-bg: ${theme.checkMineBg};`,
    `--color-check-down-bg: ${theme.checkDownBg};`,
    `--color-check-new-bg: ${theme.checkNewBg};`,
    `--color-check-new-border: ${theme.checkNewBorder};`,
    `--color-event-image-wash: ${theme.eventImageWash};`,
    `--color-event-image-wash-down: ${theme.eventImageWashDown};`,
    `--font-mono: ${theme.fontMono};`,
    `--font-serif: ${theme.fontSerif};`,
  ].join(" ");

  return `${vars} ${tailwindOverrides}`;
}

export type { ThemeName, ThemeTokens };
