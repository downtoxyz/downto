import { NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-admin';

/**
 * Hard-delete the requesting user's account.
 *
 * App Store guideline 5.1.1(v) requires apps that allow account creation
 * to support in-app account deletion. The privacy policy promises full
 * deletion within 30 days; this endpoint executes it immediately.
 *
 * What gets deleted:
 *   - profiles row → FK CASCADE wipes friendships, interest_checks, check_responses,
 *     check_comments, check_co_authors, saved_events, squad_members, messages,
 *     blocked_users, reported_content, push tokens, calendar tokens, notifications.
 *   - auth.users row via the admin API.
 *
 * Side effect to be aware of: squad chat history loses the user's messages
 * entirely (CASCADE). v1 trade-off — see PR description for context. We can
 * swap to anonymization (sender_id → "[deleted]" placeholder) later if it
 * causes confusion in shared squads.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;

  const userId = auth.user.id;
  const admin = getServiceClient();

  // 1. Delete profile row — FK CASCADE handles all the user's content.
  const { error: profileErr } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileErr) {
    return NextResponse.json(
      { error: 'Failed to delete profile data', details: profileErr.message },
      { status: 500 },
    );
  }

  // 2. Delete auth.users row. If this fails, the user has no profile but
  // can still log in to a now-empty account — they'd need to retry the
  // delete or contact support. Logging the failure for visibility.
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    console.error('account.delete: auth.users deletion failed', { userId, error: authErr.message });
    return NextResponse.json(
      { error: 'Profile deleted but auth record removal failed — contact support to finish', details: authErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
