"use server";

import { redirect } from "next/navigation"; // For redirection after successful verification
import { supabase } from "./supabase";

export async function sendOtp(_prevState: any, formData: FormData) {
  "use server";
  const email = formData.get("email") as string;

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return error.message;
  }

  redirect(`/auth/verify-otp?email=${email}`);
}

export async function resendOtp(_prevState: any, email: string) {
  "use server";

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return error.message;
  }
}

export async function verifyOtp(_prevState: any, formData: FormData) {
  "use server";

  const email = formData.get("email") as string; // Pass email via hidden input or query param
  const token = formData.get("otp") as string; // The OTP code entered by the user

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return error.message;
  }

  // Upon successful verification, the user is signed in and session stored in a cookie
  // Redirect the user to a protected route
  redirect("/");
}
