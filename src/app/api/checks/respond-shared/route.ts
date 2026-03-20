import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;

  const { checkId, response } = await req.json();
  if (!checkId || response !== 'down') {
    return NextResponse.json({ error: 'checkId and response ("down") required' }, { status: 400 });
  }

  const admin = getServiceClient();

  // Only allow responding to checks that have been explicitly shared
  const { data: check, error: checkError } = await admin
    .from('interest_checks')
    .select('id, shared_at, archived_at')
    .eq('id', checkId)
    .single();

  if (checkError || !check) {
    return NextResponse.json({ error: 'Check not found' }, { status: 404 });
  }
  if (!check.shared_at) {
    return NextResponse.json({ error: 'Check is not shared' }, { status: 403 });
  }
  if (check.archived_at) {
    return NextResponse.json({ error: 'Check is archived' }, { status: 410 });
  }

  const { error: upsertError } = await admin
    .from('check_responses')
    .upsert({
      check_id: checkId,
      user_id: user.id,
      response,
    }, { onConflict: 'check_id,user_id' });

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to respond' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
