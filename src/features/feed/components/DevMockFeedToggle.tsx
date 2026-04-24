"use client";

import { useDevMockFeed, isDev } from "../useDevMockFeed";
import cn from "@/lib/tailwindMerge";

/**
 * Floating toggle that swaps the feed between live data and DEV_MOCK_CHECKS.
 * Renders only in development builds — returns null in prod.
 */
export default function DevMockFeedToggle() {
  const [enabled, setEnabled] = useDevMockFeed();
  if (!isDev) return null;

  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={cn(
        "fixed bottom-20 left-3 z-[9998] font-mono text-[10px] font-bold uppercase rounded-full py-1.5 px-3 cursor-pointer border",
        enabled
          ? "bg-[#d4f090] text-[#ff00d4] border-[#ff00d4]"
          : "bg-card text-dim border-border-mid"
      )}
      style={{ letterSpacing: "0.12em" }}
      title="Dev-only: swap feed for kitchen-sink mock data"
    >
      {enabled ? "mock ✓" : "mock"}
    </button>
  );
}
