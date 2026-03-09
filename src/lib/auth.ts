'use server';

import { redirect } from 'next/navigation'; // For redirection after successful verification
import { createClient } from './supabase/server';

export async function sendOtp(_prevState: any, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;

  // Local dev: skip OTP email and sign in directly
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    const { createClient: createSupabaseClient } = await import(
      '@supabase/supabase-js'
    );
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data, error: genError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (genError || !data?.properties?.email_otp) {
      return genError?.message || 'Failed to generate dev login';
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: data.properties.email_otp,
      type: 'email',
    });
    if (verifyError) {
      return verifyError.message;
    }
    redirect('/');
  }

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return error.message;
  }

  redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
}

export async function resendOtp(_prevState: any, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string; // Pass email via hidden input or query param

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return error.message;
  }
}

export async function verifyOtp(_prevState: any, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string; // Pass email via hidden input or query param
  const token = formData.get('code') as string; // The OTP code entered by the user

  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    return error.message;
  }

  // Upon successful verification, the user is signed in and session stored in a cookie
  // Redirect the user to a protected route
  redirect('/');
}
