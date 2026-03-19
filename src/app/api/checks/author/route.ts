import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const checkId = req.nextUrl.searchParams.get('checkId');
  if (!checkId) {
    return NextResponse.json({ error: 'checkId required' }, { status: 400 });
  }

  const admin = getServiceClient();

  // Only allow for shared checks (public links)
  const { data: check, error } = await admin
    .from('interest_checks')
    .select('author_id')
    .eq('id', checkId)
    .not('shared_at', 'is', null)
    .single();

  if (error || !check) {
    return NextResponse.json({ error: 'Check not found' }, { status: 404 });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', check.author_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Author not found' }, { status: 404 });
  }

  return NextResponse.json({ author: profile });
}
