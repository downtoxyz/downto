import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-admin";
import { generateICSCalendar, type ICSEventParams } from "@/lib/ics";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(request.url);
  const timezone = url.searchParams.get("tz") ?? "America/New_York";

  const supabase = getServiceClient();

  // Look up user by calendar token
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("calendar_token", token)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Saved events
  const { data: savedEvents } = await supabase
    .from("saved_events")
    .select("*, event:events(*)")
    .eq("user_id", profile.id);

  // Checks the user is "down" on
  const { data: downResponses } = await supabase
    .from("check_responses")
    .select("check:interest_checks(*)")
    .eq("user_id", profile.id)
    .eq("response", "down");

  // Checks the user authored (authors have no check_responses row)
  const { data: authoredChecks } = await supabase
    .from("interest_checks")
    .select("*")
    .eq("author_id", profile.id)
    .not("event_date", "is", null);

  const icsEvents: ICSEventParams[] = [];

  for (const se of savedEvents ?? []) {
    const ev = se.event;
    if (!ev?.date) continue;
    icsEvents.push({
      uid: ev.id,
      title: ev.title ?? "Untitled Event",
      date: ev.date,
      time: ev.time_display ?? undefined,
      venue: ev.venue ?? undefined,
    });
  }

  type CheckRow = {
    id: string;
    text: string | null;
    event_date: string | null;
    event_time: string | null;
    location: string | null;
  };

  const seenCheckIds = new Set<string>();
  const pushCheck = (check: CheckRow | null | undefined) => {
    if (!check?.event_date) return;
    if (seenCheckIds.has(check.id)) return;
    seenCheckIds.add(check.id);
    icsEvents.push({
      uid: check.id,
      title: check.text ?? "Interest Check",
      date: check.event_date,
      time: check.event_time ?? undefined,
      venue: check.location ?? undefined,
    });
  };

  for (const row of downResponses ?? []) {
    pushCheck(row.check as unknown as CheckRow | null);
  }
  for (const check of authoredChecks ?? []) {
    pushCheck(check as unknown as CheckRow);
  }

  const icsContent = generateICSCalendar(icsEvents, timezone);

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="downto.ics"',
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
