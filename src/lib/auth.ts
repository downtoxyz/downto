'use server';

import { redirect } from 'next/navigation'; // For redirection after successful verification
import { createClient } from './supabase/server';
import z from 'zod';

export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return null;
  }

  return data.user;
}

export async function sendOtp(_prevState: any, rawFormData: FormData) {
  const email = z.email().safeParse(rawFormData.get('email'));

  if (!email.success) {
    return 'Invalid email address';
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({ email: email.data });

  if (error) {
    return error.message;
  }

  redirect(`/auth/verify-otp?email=${encodeURIComponent(email.data)}`);
}

export async function resendOtp(_prevState: any, formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string; // Pass email via hidden input or query param

  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    return error.message;
  }
}

export async function verifyOtp(_prevState: any, rawFormData: FormData) {
  const formSchema = z.object({
    email: z.email({ message: 'Invalid email address' }),
    token: z
      .string()
      .regex(
        /^\d{8}$/,
        'The confirmation code must be 8 digits and contain only numbers.'
      ) // Ensures exactly 6 digits
      .length(8, 'OTP must be exactly 8 characters') // Explicit length check
      .nonempty({ message: 'Code cannot be empty' }),
  });

  const formData = formSchema.safeParse({
    email: rawFormData.get('email'),
    token: rawFormData.get('code'),
  });

  if (!formData.success) {
    return formData.error.issues[0].message;
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    ...formData.data,
    type: 'email',
  });

  if (error) {
    return error.message;
  }

  // Upon successful verification, the user is signed in and session stored in a cookie
  // Redirect the user to a protected route
  redirect('/');
}
