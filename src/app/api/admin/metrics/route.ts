import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-admin';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

function toLocalDate(isoTimestamp: string, tz: string): string {
  try {
    return new Date(isoTimestamp).toLocaleDateString('en-CA', { timeZone: tz });
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user } = auth;

  const tz = request.nextUrl.searchParams.get('tz') || 'America/New_York';

  // Check admin
  if (user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = getServiceClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run queries in parallel
  const [totalRes, onboardedRes, notOnboardedRes, recentRes, signupsRes, pushSentRes, pushFailedRes, pushStaleRes, pushRecentFailures, versionPingsRes, dauRpcRes, pushSubscribersRes, friendshipsRes, pendingCountRes, blockedCountRes] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarded', false),
    admin.from('profiles')
      .select('username, display_name, created_at, onboarded')
      .not('created_at', 'is', null)
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
      .select('user_id, build_id, theme, created_at')
      .gte('created_at', since7d)
      .order('created_at', { ascending: false })
      .limit(10000),
    admin.rpc('get_dau', { p_since: since30d, p_tz: tz }),
    admin.from('push_subscriptions')
      .select('user_id'),
    // All accepted friendship edges — used to compute per-user degree, avg, top
    admin.from('friendships')
      .select('requester_id, addressee_id, created_at')
      .eq('status', 'accepted')
      .limit(100000),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'blocked'),
  ]);

  // DAU from RPC — already grouped by date
  const dauByDate: Record<string, number> = {};
  if (dauRpcRes.data) {
    for (const row of dauRpcRes.data as { date: string; unique_users: number }[]) {
      dauByDate[row.date] = row.unique_users;
    }
  }

  // Group signups by local date
  const signupsByDate: Record<string, number> = {};
  if (signupsRes.data) {
    for (const row of signupsRes.data) {
      const date = toLocalDate(row.created_at, tz);
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

  // Push subscriber user IDs (deduplicated)
  const pushSubscriberIds = new Set<string>();
  if (pushSubscribersRes.data) {
    for (const row of pushSubscribersRes.data) {
      pushSubscriberIds.add(row.user_id);
    }
  }

  // Fetch display names for all users with version pings or push subscriptions
  const allUserIds = [...new Set([...latestByUser.keys(), ...pushSubscriberIds])];
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

  // Resolve push subscriber names and failure user names
  const pushSubscriberNames = [...pushSubscriberIds].map(id => profileNames.get(id) || id.slice(0, 8));
  const pushFailuresWithNames = (pushRecentFailures.data ?? []).map(f => ({
    ...f,
    display_name: profileNames.get(f.user_id) || f.user_id.slice(0, 8),
  }));

  const versionDistribution = Array.from(buildCounts.entries())
    .map(([build_id, users]) => ({
      build_id,
      users,
      pings24h: pingsPerBuild.get(build_id) || 0,
      latestPing: latestPingByBuild.get(build_id) || '',
      userNames: (usersByBuild.get(build_id) || []).map(uid => profileNames.get(uid) || uid.slice(0, 8)),
    }))
    .sort((a, b) => b.latestPing.localeCompare(a.latestPing));

  // Theme distribution — latest theme per user (by most-recent ping), count unique
  // users per theme, plus 24h ping count per theme.
  const latestThemeByUser = new Map<string, string>(); // user_id → theme
  const pingsPerTheme24h = new Map<string, number>();
  if (versionPingsRes.data) {
    for (const row of versionPingsRes.data as { user_id: string; theme: string | null; created_at: string }[]) {
      const t = row.theme;
      if (!t) continue;
      if (!latestThemeByUser.has(row.user_id)) {
        latestThemeByUser.set(row.user_id, t);
      }
      if (row.created_at >= since24h) {
        pingsPerTheme24h.set(t, (pingsPerTheme24h.get(t) || 0) + 1);
      }
    }
  }
  const themeUsers = new Map<string, number>();
  const themeUserIds = new Map<string, string[]>();
  for (const [uid, t] of latestThemeByUser.entries()) {
    themeUsers.set(t, (themeUsers.get(t) || 0) + 1);
    const list = themeUserIds.get(t) || [];
    list.push(uid);
    themeUserIds.set(t, list);
  }
  const themeDistribution = Array.from(themeUsers.entries())
    .map(([theme, users]) => ({
      theme,
      users,
      pings24h: pingsPerTheme24h.get(theme) || 0,
      userNames: (themeUserIds.get(theme) || []).map(uid => profileNames.get(uid) || uid.slice(0, 8)),
    }))
    .sort((a, b) => b.users - a.users);
  const themeUsersReporting = latestThemeByUser.size;

  // Friendship graph — count accepted edges, compute per-user degree, avg,
  // median, and the most-connected users. Pending/blocked counts come from
  // dedicated HEAD queries above.
  const acceptedEdges = (friendshipsRes.data ?? []) as { requester_id: string; addressee_id: string; created_at: string }[];
  const degreeByUser = new Map<string, number>();
  for (const edge of acceptedEdges) {
    degreeByUser.set(edge.requester_id, (degreeByUser.get(edge.requester_id) || 0) + 1);
    degreeByUser.set(edge.addressee_id, (degreeByUser.get(edge.addressee_id) || 0) + 1);
  }
  const degrees = Array.from(degreeByUser.values()).sort((a, b) => a - b);
  const totalUsers = totalRes.count ?? 0;
  const connectedUsers = degreeByUser.size;
  const isolatedUsers = Math.max(0, totalUsers - connectedUsers);
  const avgFriends = connectedUsers > 0
    ? +(degrees.reduce((s, d) => s + d, 0) / connectedUsers).toFixed(2)
    : 0;
  const medianFriends = degrees.length > 0
    ? degrees[Math.floor(degrees.length / 2)]
    : 0;
  const maxFriends = degrees.length > 0 ? degrees[degrees.length - 1] : 0;
  // Top 10 most-connected users. Display name looked up via the profile map
  // already loaded (fall back to id slice).
  const mostConnected = Array.from(degreeByUser.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  // Fetch any missing display names for the top-10 that weren't already loaded
  const topUserIds = mostConnected.map(([id]) => id);
  const missingTopIds = topUserIds.filter(id => !profileNames.has(id));
  if (missingTopIds.length > 0) {
    const { data: topProfiles } = await admin.from('profiles')
      .select('id, display_name, username')
      .in('id', missingTopIds);
    if (topProfiles) {
      for (const p of topProfiles) {
        profileNames.set(p.id, p.display_name || p.username || p.id.slice(0, 8));
      }
    }
  }
  const mostConnectedUsers = mostConnected.map(([id, count]) => ({
    name: profileNames.get(id) || id.slice(0, 8),
    count,
  }));

  // Engagement metrics (7d)
  const [checksRes, responsesRes, commentsRes, messagesRes] = await Promise.all([
    admin.from('interest_checks')
      .select('author_id, created_at')
      .gte('created_at', since7d)
      .limit(10000),
    admin.from('check_responses')
      .select('user_id, created_at')
      .gte('created_at', since7d)
      .limit(10000),
    admin.from('check_comments')
      .select('user_id, created_at')
      .gte('created_at', since7d)
      .limit(10000),
    admin.from('messages')
      .select('sender_id, created_at, is_system')
      .gte('created_at', since7d)
      .eq('is_system', false)
      .limit(10000),
  ]);

  // Active users (opened app in last 7d)
  const activeUserIds = new Set<string>();
  if (versionPingsRes.data) {
    for (const row of versionPingsRes.data) {
      activeUserIds.add(row.user_id);
    }
  }

  // Engaged users (did something in last 7d)
  const engagedUserIds = new Set<string>();
  if (checksRes.data) for (const r of checksRes.data) engagedUserIds.add(r.author_id);
  if (responsesRes.data) for (const r of responsesRes.data) engagedUserIds.add(r.user_id);
  if (commentsRes.data) for (const r of commentsRes.data) engagedUserIds.add(r.user_id);
  if (messagesRes.data) for (const r of messagesRes.data) engagedUserIds.add(r.sender_id);

  // Lurkers: active but not engaged
  const lurkerIds = [...activeUserIds].filter(id => !engagedUserIds.has(id));
  const lurkerNames: string[] = lurkerIds.map(id => profileNames.get(id) || id.slice(0, 8));

  // Daily activity counts (grouped by local date)
  const checksByDate: Record<string, number> = {};
  const responsesByDate: Record<string, number> = {};
  const commentsByDate: Record<string, number> = {};
  const messagesByDate: Record<string, number> = {};

  if (checksRes.data) for (const r of checksRes.data) {
    const d = toLocalDate(r.created_at, tz);
    checksByDate[d] = (checksByDate[d] || 0) + 1;
  }
  if (responsesRes.data) for (const r of responsesRes.data) {
    const d = toLocalDate(r.created_at, tz);
    responsesByDate[d] = (responsesByDate[d] || 0) + 1;
  }
  if (commentsRes.data) for (const r of commentsRes.data) {
    const d = toLocalDate(r.created_at, tz);
    commentsByDate[d] = (commentsByDate[d] || 0) + 1;
  }
  if (messagesRes.data) for (const r of messagesRes.data) {
    const d = toLocalDate(r.created_at, tz);
    messagesByDate[d] = (messagesByDate[d] || 0) + 1;
  }

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
      subscribers: pushSubscriberIds.size,
      subscriberNames: pushSubscriberNames,
      recentFailures: pushFailuresWithNames,
    },
    versions: {
      distribution: versionDistribution,
      commitMessages,
    },
    themes: {
      distribution: themeDistribution,
      usersReporting: themeUsersReporting,
    },
    friendships: {
      accepted: acceptedEdges.length,
      pending: pendingCountRes.count ?? 0,
      blocked: blockedCountRes.count ?? 0,
      connectedUsers,
      isolatedUsers,
      avgFriends,
      medianFriends,
      maxFriends,
      mostConnected: mostConnectedUsers,
    },
    engagement: {
      active7d: activeUserIds.size,
      engaged7d: engagedUserIds.size,
      lurkers7d: lurkerIds.length,
      lurkerNames,
      checksByDate,
      responsesByDate,
      commentsByDate,
      messagesByDate,
    },
  });
}
