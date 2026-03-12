'use server';

import { Tables } from '@/app/types/database.types';
import { createClient } from '../../../lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { Profile } from '../types';

// Fetch current user profile
export async function getCurrentProfile(): Promise<Profile> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;

  return data as Profile;
}

// Update current user profile
// TODO: Validate raw profile data
export async function updateProfile(profileData: Partial<Tables<'profiles'>>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(profileData)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/profile', 'page');
  return data;
}
