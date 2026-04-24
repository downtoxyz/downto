"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "dt-dev-mock-feed";

export const isDev = process.env.NODE_ENV === "development";

/**
 * Dev-only toggle: when on, FeedView renders DEV_MOCK_CHECKS instead of
 * whatever came back from the API. Persists across reloads via localStorage.
 *
 * In production this hook always returns [false, no-op] so the mock data
 * is never rendered and the toggle button never appears.
 */
export function useDevMockFeed(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(false);

  // Sync with localStorage on mount. Only runs in dev.
  useEffect(() => {
    if (!isDev) return;
    setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const set = (next: boolean) => {
    if (!isDev) return;
    setEnabled(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* localStorage might be disabled */ }
  };

  return [isDev && enabled, set];
}
