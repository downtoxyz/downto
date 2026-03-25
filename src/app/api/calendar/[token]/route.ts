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

  // Fetch saved events
  const { data: savedEvents } = await supabase
    .from("saved_events")
    .select("*, event:events(*)")
    .eq("user_id", profile.id);

  // Fetch interest check responses with event dates
  const { data: checkResponses } = await supabase
    .from("check_responses")
    .select("*, check:interest_checks(*)")
    .eq("user_id", profile.id)
    .in("status", ["down", "waitlist"]);

  const icsEvents: ICSEventParams[] = [];

  // Add saved events
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

  // Add interest checks with dates
  for (const cr of checkResponses ?? []) {
    const check = cr.check;
    if (!check?.event_date) continue;
    icsEvents.push({
      uid: check.id,
      title: check.text ?? "Interest Check",
      date: check.event_date,
      time: check.event_time ?? undefined,
      venue: check.location ?? undefined,
    });
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
