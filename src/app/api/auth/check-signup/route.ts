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
  const { count: existingCount } = await supabase
    .rpc("check_email_exists", { p_email: email.toLowerCase() });

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
    return NextResponse.json({
      allowed: false,
      existing: false,
      message: "we're at capacity right now",
    });
  }

  return NextResponse.json({ allowed: true, existing: false });
}
