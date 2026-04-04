import { katsu } from "./katsu";
import { orlando } from "./orlando";
import { justin } from "./justin";
import type { ThemeName, ThemeTokens } from "./types";

export const themes: Record<ThemeName, ThemeTokens> = { katsu, orlando, justin };

export const DEFAULT_THEME: ThemeName = "katsu";

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
    `--font-mono: ${theme.fontMono};`,
    `--font-serif: ${theme.fontSerif};`,
  ].join(" ");

  return `${vars} ${tailwindOverrides}`;
}

export type { ThemeName, ThemeTokens };
