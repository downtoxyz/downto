import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-admin";

// Maximum number of users allowed during v0. Override via env var.
const SIGNUP_CAP = parseInt(process.env.SIGNUP_CAP ?? "200", 10);

export async function POST(request: Request) {
  const { email } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Check if a profile already exists for this email (existing users can always log in).
  // We query auth.users via the service client to find by email.
  const { count: existingCount } = await supabase
    .rpc("check_email_exists", { p_email: email.toLowerCase() });

  // If the RPC doesn't exist yet, fall back to allowing (fail open).
  // The RPC is created in the signup-cap migration.
  if (existingCount !== null && existingCount > 0) {
    return NextResponse.json({ allowed: true, existing: true });
  }

  // New user — check total count against cap
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ allowed: true, existing: false });
  }

  if ((count ?? 0) >= SIGNUP_CAP) {
    // Check if already on waitlist
    const { count: waitlistCount } = await supabase
      .from("waitlist")
      .select("*", { count: "exact", head: true })
      .eq("email", email.toLowerCase());

    return NextResponse.json({
      allowed: false,
      existing: false,
      alreadyWaitlisted: (waitlistCount ?? 0) > 0,
      message: "we're at capacity right now — join the waitlist and we'll let you in soon",
    });
  }

  return NextResponse.json({ allowed: true, existing: false });
}

// PUT: join waitlist
export async function PUT(request: Request) {
  const { email } = await request.json();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { error } = await supabase
    .from("waitlist")
    .upsert({ email: email.toLowerCase() }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }

  return NextResponse.json({ joined: true });
}
