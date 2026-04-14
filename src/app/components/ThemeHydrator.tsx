"use client";

import { useEffect } from "react";
import { themes, themeToCSSSVars } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";

const THEME_STORAGE_KEY = "downto-theme";
const THEME_VERSION_KEY = "downto-theme-version";
const CURRENT_THEME_VERSION = "2";

/** Apply a theme by injecting CSS vars, updating meta theme-color, and bg image */
export function applyTheme(name: ThemeName) {
  if (!(name in themes)) return;
  if (name === document.documentElement.dataset.theme) return;

  const cssVars = themeToCSSSVars(themes[name]);
  document.documentElement.dataset.theme = name;

  let el = document.getElementById("theme-vars");
  if (!el) {
    el = document.createElement("style");
    el.id = "theme-vars";
    document.head.appendChild(el);
  }
  el.textContent = `:root { ${cssVars} }`;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themes[name].themeColor);

  const t = themes[name];
  document.body.style.background = t.bgImage
    ? `var(--t-bg) url(${t.bgImage}) center/cover fixed`
    : "var(--t-bg)";
}

export default function ThemeHydrator() {
  useEffect(() => {
    // Priority: URL param > localStorage > default (no-op)
    const params = new URLSearchParams(window.location.search);
    const qTheme = params.get("theme") as ThemeName | null;

    if (qTheme && qTheme in themes) {
      applyTheme(qTheme);
      return;
    }

    // One-time reset: clear stored theme when version bumps so new default takes effect
    if (localStorage.getItem(THEME_VERSION_KEY) !== CURRENT_THEME_VERSION) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.setItem(THEME_VERSION_KEY, CURRENT_THEME_VERSION);
    }

    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
    if (stored && stored in themes) {
      applyTheme(stored);
    }
  }, []);

  return null;
}
