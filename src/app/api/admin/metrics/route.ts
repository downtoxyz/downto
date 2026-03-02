import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  // Auth: verify user via Bearer token
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check admin
  if (user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run queries in parallel
  const [totalRes, onboardedRes, notOnboardedRes, recentRes, signupsRes, pushSentRes, pushFailedRes, pushStaleRes, pushRecentFailures, versionPingsRes] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', false),
    admin.from('profiles')
      .select('username, display_name, created_at, onboarded')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('profiles')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true }),
    admin.from('push_logs').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since24h),
    admin.from('push_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since24h),
    admin.from('push_logs').select('*', { count: 'exact', head: true }).eq('status', 'stale').gte('created_at', since24h),
    admin.from('push_logs')
      .select('created_at, user_id, endpoint, status, error')
      .neq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('version_pings')
      .select('user_id, build_id, created_at')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false }),
  ]);

  // Group signups by date
  const signupsByDate: Record<string, number> = {};
  if (signupsRes.data) {
    for (const row of signupsRes.data) {
      const date = row.created_at.slice(0, 10); // YYYY-MM-DD
      signupsByDate[date] = (signupsByDate[date] || 0) + 1;
    }
  }

  // Version distribution: latest ping per user + pings per build in last 24h
  const latestByUser = new Map<string, string>(); // user_id → build_id
  const pingsPerBuild = new Map<string, number>(); // build_id → 24h ping count
  if (versionPingsRes.data) {
    for (const row of versionPingsRes.data) {
      if (!latestByUser.has(row.user_id)) {
        latestByUser.set(row.user_id, row.build_id);
      }
      if (row.created_at >= since24h) {
        pingsPerBuild.set(row.build_id, (pingsPerBuild.get(row.build_id) || 0) + 1);
      }
    }
  }
  const buildCounts = new Map<string, number>();
  for (const buildId of latestByUser.values()) {
    buildCounts.set(buildId, (buildCounts.get(buildId) || 0) + 1);
  }
  const versionDistribution = Array.from(buildCounts.entries())
    .map(([build_id, users]) => ({ build_id, users, pings24h: pingsPerBuild.get(build_id) || 0 }))
    .sort((a, b) => b.users - a.users);

  return NextResponse.json({
    totalUsers: totalRes.count ?? 0,
    onboarded: onboardedRes.count ?? 0,
    notOnboarded: notOnboardedRes.count ?? 0,
    signupsByDate,
    recentSignups: recentRes.data ?? [],
    push: {
      sent24h: pushSentRes.count ?? 0,
      failed24h: pushFailedRes.count ?? 0,
      stale24h: pushStaleRes.count ?? 0,
      recentFailures: pushRecentFailures.data ?? [],
    },
    versions: {
      distribution: versionDistribution,
    },
  });
}
