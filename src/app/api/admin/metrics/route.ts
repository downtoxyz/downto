import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;

  // Check admin
  if (user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run queries in parallel
  const [totalRes, onboardedRes, notOnboardedRes, recentRes, signupsRes, pushSentRes, pushFailedRes, pushStaleRes, pushRecentFailures, versionPingsRes, dauPingsRes] = await Promise.all([
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
      .order('created_at', { ascending: false })
      .limit(10000),
    admin.from('version_pings')
      .select('user_id, created_at')
      .gte('created_at', since30d)
      .limit(50000),
  ]);

  // Compute DAU from version_pings (30 days)
  const dauSets: Record<string, Set<string>> = {};
  if (dauPingsRes.data) {
    for (const row of dauPingsRes.data) {
      const date = row.created_at.slice(0, 10);
      if (!dauSets[date]) dauSets[date] = new Set();
      dauSets[date].add(row.user_id);
    }
  }
  const dauByDate: Record<string, number> = {};
  for (const [date, users] of Object.entries(dauSets)) {
    dauByDate[date] = users.size;
  }

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
  // Track the latest ping timestamp per build_id (data is already sorted by created_at desc)
  const latestPingByBuild = new Map<string, string>();
  if (versionPingsRes.data) {
    for (const row of versionPingsRes.data) {
      if (!latestPingByBuild.has(row.build_id)) {
        latestPingByBuild.set(row.build_id, row.created_at);
      }
    }
  }
  // Group user_ids by build
  const usersByBuild = new Map<string, string[]>();
  for (const [userId, buildId] of latestByUser.entries()) {
    const list = usersByBuild.get(buildId) || [];
    list.push(userId);
    usersByBuild.set(buildId, list);
  }

  // Fetch display names for all users with version pings
  const allUserIds = [...latestByUser.keys()];
  const profileNames = new Map<string, string>();
  if (allUserIds.length > 0) {
    const { data: profiles } = await admin.from('profiles')
      .select('id, display_name, username')
      .in('id', allUserIds);
    if (profiles) {
      for (const p of profiles) {
        profileNames.set(p.id, p.display_name || p.username || p.id.slice(0, 8));
      }
    }
  }

  const versionDistribution = Array.from(buildCounts.entries())
    .map(([build_id, users]) => ({
      build_id,
      users,
      pings24h: pingsPerBuild.get(build_id) || 0,
      latestPing: latestPingByBuild.get(build_id) || '',
      userNames: (usersByBuild.get(build_id) || []).map(uid => profileNames.get(uid) || uid.slice(0, 8)),
    }))
    .sort((a, b) => b.latestPing.localeCompare(a.latestPing));

  // Fetch commit messages from GitHub for build SHAs
  const commitMessages: Record<string, string> = {};
  const shas = versionDistribution
    .map((v) => v.build_id)
    .filter((id) => /^[0-9a-f]{7,40}$/.test(id));
  if (shas.length > 0) {
    try {
      const ghRes = await fetch(
        'https://api.github.com/repos/xylene-p/downto/commits?per_page=100',
        { headers: { Accept: 'application/vnd.github+json' }, next: { revalidate: 300 } }
      );
      if (ghRes.ok) {
        const commits = await ghRes.json() as { sha: string; commit: { message: string } }[];
        for (const c of commits) {
          commitMessages[c.sha] = c.commit.message.split('\n')[0];
        }
      }
    } catch { /* non-critical — skip if GitHub is unreachable */ }
  }

  return NextResponse.json({
    totalUsers: totalRes.count ?? 0,
    onboarded: onboardedRes.count ?? 0,
    notOnboarded: notOnboardedRes.count ?? 0,
    dauByDate,
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
      commitMessages,
    },
  });
}
