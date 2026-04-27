import { supabase } from '../supabase';

import type { Profile } from '../types';

// =============================================================================
// Block + report (App Store 1.2)
// Schema: migration 20260424000003_block_and_report.sql
// =============================================================================

export type ReportTargetType = 'profile' | 'check' | 'squad_message' | 'event_comment' | 'check_comment';
export type ReportReason = 'harassment' | 'spam' | 'impersonation' | 'inappropriate' | 'threats' | 'other';

export async function blockUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (user.id === targetUserId) throw new Error("Can't block yourself");

  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: user.id, blocked_id: targetUserId });
  // Unique constraint conflict = already blocked; treat as success
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(targetUserId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetUserId);
  if (error) throw error;
}

export async function isBlocked(targetUserId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Only checks the direction the viewer controls (their outgoing blocks).
  // RLS prevents reading blocks where they're the blocked party, which is
  // intentional — see migration comment.
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetUserId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listBlockedUsers(): Promise<(Profile & { blocked_at: string })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('blocked_users')
    .select('created_at, blocked:profiles!blocked_id(*)')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as { created_at: string; blocked: Profile }[])
    .map((r) => ({ ...r.blocked, blocked_at: r.created_at }));
}

export async function reportContent(
  targetType: ReportTargetType,
  targetId: string,
  reason: ReportReason,
  details: string | null = null,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('reported_content')
    .insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
    });
  if (error) throw error;
}
