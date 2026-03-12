'use client';

import { createClient } from '@/lib/supabase/client';
import { Profile } from '../types';

export default async function searchProfiles({
  query,
  userId,
}: {
  query: string;
  userId: string;
}): Promise<Profile[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .neq('id', userId)
    .neq('is_test', true)
    .limit(20);

  if (error) throw error;

  return (data as Profile[]) ?? [];
}
