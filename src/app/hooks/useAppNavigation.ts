"use client";

import { useState } from "react";
import type { Tab } from "@/lib/ui-types";

export function useAppNavigation() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("tab");
      if (p === "feed" || p === "groups" || p === "profile" || p === "calendar") return p;
    }
    return "feed";
  });
  const [feedMode, setFeedMode] = useState<"foryou" | "tonight">("foryou");
  const [squadChatOrigin, setSquadChatOrigin] = useState<Tab | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);

  return {
    tab,
    setTab,
    feedMode,
    setFeedMode,
    squadChatOrigin,
    setSquadChatOrigin,
    chatOpen,
    setChatOpen,
    scrolledDown,
    setScrolledDown,
  };
}
