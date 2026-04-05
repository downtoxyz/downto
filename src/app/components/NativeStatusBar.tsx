"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export default function NativeStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    import("@capacitor/status-bar").then(async ({ StatusBar, Style }) => {
      // Overlay mode — content extends behind status bar
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setStyle({ style: Style.Dark });
    }).catch(() => {});
  }, []);

  return null;
}
