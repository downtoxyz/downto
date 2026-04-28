"use client";

import { useState } from "react";
import { parseWhen } from "@/lib/dateParse";

/**
 * "When" input for natural-language date+time entry. Three modals
 * (EditCheckModal, EditEventModal, CreateModal) used to reimplement the
 * exact same parse-as-you-type + preview logic verbatim — now they all
 * share this.
 *
 * Routes through parseWhen so compound inputs like "next thurs or next fri"
 * are accepted everywhere; the hook surfaces both the first ISO date (for
 * single-date schemas like interest_checks.event_date) and the full array
 * (for multi-date consumers like the squad poll inputs). Preview text uses
 * the user's original label so "next thurs or next fri at 7pm" echoes back
 * verbatim under the input rather than collapsing to one resolved date.
 */
export function useDateTimeInput(initial = "") {
  const [whenInput, setWhenInput] = useState(initial);

  const parsed = whenInput ? parseWhen(whenInput) : null;
  const parsedDateISO = parsed?.dates[0] ?? null;
  const parsedDates = parsed?.dates ?? [];
  const parsedTime = parsed?.time ?? null;

  const whenPreview = (() => {
    if (!parsedDateISO && !parsedTime) return null;
    // For compound inputs ("thurs or fri"), echo the user's full input back.
    // For single dates, the user's input is itself a fine label.
    return parsed?.label ?? null;
  })();

  return {
    whenInput,
    setWhenInput,
    /** First ISO date — single-date schemas use this. */
    parsedDateISO,
    /** Every date the user implied. Multi-date consumers use this. */
    parsedDates,
    parsedTime,
    whenPreview,
  };
}
