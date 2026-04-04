"use client";

import { useEffect } from "react";
import { themes, themeToCSSSVars } from "@/lib/themes";
import type { ThemeName } from "@/lib/themes";

export default function ThemeHydrator() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qTheme = params.get("theme") as ThemeName | null;
    if (!qTheme || !(qTheme in themes)) return;
    if (qTheme === document.documentElement.dataset.theme) return;

    const cssVars = themeToCSSSVars(themes[qTheme]);
    document.documentElement.dataset.theme = qTheme;

    let el = document.getElementById("theme-vars");
    if (!el) {
      el = document.createElement("style");
      el.id = "theme-vars";
      document.head.appendChild(el);
    }
    el.textContent = `:root { ${cssVars} }`;

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themes[qTheme].themeColor);

    // Apply or remove background image
    const t = themes[qTheme];
    document.body.style.background = t.bgImage
      ? `var(--t-bg) url(${t.bgImage}) center/cover fixed`
      : "var(--t-bg)";
  }, []);

  return null;
}
