"use client";

import { createContext, useContext } from "react";
import type { Event, InterestCheck } from "@/lib/ui-types";

export interface FeedContextValue {
  // — Check data —
  checks: InterestCheck[];
  myCheckResponses: Record<string, "down" | "waitlist">;
  hiddenCheckIds: Set<string>;
  pendingDownCheckIds: Set<string>;
  newlyAddedCheckId: string | null;
  leftChecks: InterestCheck[];

  // — Event data —
  events: Event[];
  newlyAddedEventId: string | null;

  // — Check actions —
  respondToCheck: (checkId: string) => void;
  clearResponse: (checkId: string) => void;
  acceptCoAuthorTag: (checkId: string) => Promise<void>;
  declineCoAuthorTag: (checkId: string) => Promise<void>;
  hideCheck: (checkId: string) => void;
  unhideCheck: (checkId: string) => void;
  redownFromLeft: (checkId: string) => void;

  // — Event actions —
  toggleDown: (eventId: string) => Promise<void>;
}

export const FeedContext = createContext<FeedContextValue | null>(null);

export function useFeedContext(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeedContext must be used inside FeedContext.Provider");
  return ctx;
}
