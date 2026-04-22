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
  const [totalRes, onboardedRes, notOnboardedRes, recentRes, signupsRes, pushSentRes, pushFailedRes, pushStaleRes, pushRecentFailures, versionPingsRes, dauRpcRes, pushSubscribersRes, friendshipsRes, _pendingSlot, _blockedSlot, onboardedProfilesRes, squadsRes, squadMembersRes, squadMessages7dRes] = await Promise.all([
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
    // All friendship rows — filtered to edges between onboarded users below.
    // We return status so we can compute accepted/pending/blocked from one fetch.
    admin.from('friendships')
      .select('requester_id, addressee_id, status, created_at')
      .limit(200000),
    // Placeholders kept so destructuring stays aligned. pendingCountRes and
    // blockedCountRes are derived in-memory from the filtered friendship set.
    Promise.resolve({ count: 0 }),
    Promise.resolve({ count: 0 }),
    // Onboarded profiles — gates all friendship metrics to real users.
    admin.from('profiles')
      .select('id, created_at')
      .eq('onboarded', true)
      .not('created_at', 'is', null)
      .limit(100000),
    // Squads (all, we filter active/archived in-memory)
    admin.from('squads').select('id, created_at, archived_at, expires_at, name').limit(100000),
    // Squad memberships — for avg size + top-squad sizes
    admin.from('squad_members').select('squad_id, user_id').limit(200000),
    // Non-system messages in last 7d — for active-squad classification
    admin.from('messages')
      .select('squad_id, created_at')
      .eq('is_system', false)
      .gte('created_at', since7d)
      .limit(100000),
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

  // Compute activeUserIds early (last-7d pings) — friendship metrics below
  // need it to classify "active-with-1-friend" / "bootstrap-friend-inactive".
  const activeUserIds = new Set<string>();
  if (versionPingsRes.data) {
    for (const row of versionPingsRes.data) {
      activeUserIds.add(row.user_id);
    }
  }

  // Friendship graph — scoped to ONBOARDED users only so test/abandoned
  // accounts don't skew the numbers. Edges are kept only when both
  // endpoints are onboarded.
  const onboardedProfiles = (onboardedProfilesRes.data ?? []) as { id: string; created_at: string }[];
  const onboardedSet = new Set(onboardedProfiles.map(p => p.id));
  const onboardedUsersCount = onboardedSet.size;
  const allEdges = (friendshipsRes.data ?? []) as { requester_id: string; addressee_id: string; status: string; created_at: string }[];
  const onboardedEdges = allEdges.filter(e => onboardedSet.has(e.requester_id) && onboardedSet.has(e.addressee_id));
  const acceptedEdges = onboardedEdges.filter(e => e.status === 'accepted');
  const pendingCount = onboardedEdges.filter(e => e.status === 'pending').length;
  const blockedCount = onboardedEdges.filter(e => e.status === 'blocked').length;

  const degreeByUser = new Map<string, number>();
  for (const edge of acceptedEdges) {
    degreeByUser.set(edge.requester_id, (degreeByUser.get(edge.requester_id) || 0) + 1);
    degreeByUser.set(edge.addressee_id, (degreeByUser.get(edge.addressee_id) || 0) + 1);
  }
  const degrees = Array.from(degreeByUser.values()).sort((a, b) => a - b);
  const connectedUsers = degreeByUser.size;
  const isolatedUsers = Math.max(0, onboardedUsersCount - connectedUsers);
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

  // Acceptance / block rates among edges between onboarded users
  const totalFriendshipRows = onboardedEdges.length;
  const acceptanceRate = totalFriendshipRows > 0
    ? Math.round((acceptedEdges.length / totalFriendshipRows) * 100)
    : 0;
  const blockRate = totalFriendshipRows > 0
    ? Math.round((blockedCount / totalFriendshipRows) * 100)
    : 0;

  // New-friendships-per-day (30d) — accepted edges grouped by local date
  const newFriendshipsByDate: Record<string, number> = {};
  for (const edge of acceptedEdges) {
    if (edge.created_at >= since30d) {
      const d = toLocalDate(edge.created_at, tz);
      newFriendshipsByDate[d] = (newFriendshipsByDate[d] || 0) + 1;
    }
  }

  // Single-friend users — passed the onboarding gate with the minimum (1 friend)
  // and never expanded. Higher churn risk than a truly isolated user.
  const singleFriendUserIds = [...degreeByUser.entries()]
    .filter(([, count]) => count === 1)
    .map(([id]) => id);
  const activeSingleFriendIds = singleFriendUserIds.filter(id => activeUserIds.has(id));

  // Bootstrap friend: for a single-friend user, find their one friend.
  const onlyFriendOf = new Map<string, string>();
  for (const edge of acceptedEdges) {
    if (degreeByUser.get(edge.requester_id) === 1) {
      onlyFriendOf.set(edge.requester_id, edge.addressee_id);
    }
    if (degreeByUser.get(edge.addressee_id) === 1) {
      onlyFriendOf.set(edge.addressee_id, edge.requester_id);
    }
  }
  // Active users whose only friend hasn't opened the app in 7d — feed is
  // empty for them; top churn predictor given the onboarding gate.
  const activeInactiveBootstrapIds = [...onlyFriendOf.entries()]
    .filter(([user, friend]) => activeUserIds.has(user) && !activeUserIds.has(friend))
    .map(([user]) => user);

  // Friendship growth — median friend count by signup cohort. Each threshold
  // is "users who've had at least N days to accumulate friends".
  const DAY_MS = 24 * 60 * 60 * 1000;
  const NOW_MS = Date.now();
  const cohortFriends: Record<string, number[]> = { d7: [], d30: [], d90: [] };
  for (const p of onboardedProfiles) {
    const ageDays = (NOW_MS - new Date(p.created_at).getTime()) / DAY_MS;
    const n = degreeByUser.get(p.id) || 0;
    if (ageDays >= 7) cohortFriends.d7.push(n);
    if (ageDays >= 30) cohortFriends.d30.push(n);
    if (ageDays >= 90) cohortFriends.d90.push(n);
  }
  function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  const growth = {
    d7: { users: cohortFriends.d7.length, median: median(cohortFriends.d7) },
    d30: { users: cohortFriends.d30.length, median: median(cohortFriends.d30) },
    d90: { users: cohortFriends.d90.length, median: median(cohortFriends.d90) },
  };

  // Time-to-first-friend — median days between profile.created_at and
  // a user's first accepted friendship edge. Onboarded users only.
  const signupByUser = new Map<string, string>();
  for (const p of onboardedProfiles) {
    signupByUser.set(p.id, p.created_at);
  }
  const firstFriendshipByUser = new Map<string, string>();
  // acceptedEdges aren't guaranteed sorted; sort ascending so we capture first
  const edgesAsc = [...acceptedEdges].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const edge of edgesAsc) {
    if (!firstFriendshipByUser.has(edge.requester_id)) {
      firstFriendshipByUser.set(edge.requester_id, edge.created_at);
    }
    if (!firstFriendshipByUser.has(edge.addressee_id)) {
      firstFriendshipByUser.set(edge.addressee_id, edge.created_at);
    }
  }
  const timeToFirstDays: number[] = [];
  for (const [uid, firstAt] of firstFriendshipByUser.entries()) {
    const signup = signupByUser.get(uid);
    if (!signup) continue;
    const days = (new Date(firstAt).getTime() - new Date(signup).getTime()) / (24 * 60 * 60 * 1000);
    if (days >= 0) timeToFirstDays.push(days);
  }
  timeToFirstDays.sort((a, b) => a - b);
  const medianTimeToFirstFriend = timeToFirstDays.length > 0
    ? +timeToFirstDays[Math.floor(timeToFirstDays.length / 2)].toFixed(1)
    : null;

  // Squads metrics — filter active (not archived, not expired) in-memory
  const nowIso = new Date().toISOString();
  const squadsAll = (squadsRes.data ?? []) as { id: string; created_at: string; archived_at: string | null; expires_at: string | null; name: string }[];
  const activeSquads = squadsAll.filter(s =>
    !s.archived_at && (!s.expires_at || s.expires_at > nowIso)
  );
  const activeSquadIds = new Set(activeSquads.map(s => s.id));

  // Members per squad (active squads only)
  const membersBySquad = new Map<string, number>();
  for (const m of (squadMembersRes.data ?? []) as { squad_id: string; user_id: string }[]) {
    if (activeSquadIds.has(m.squad_id)) {
      membersBySquad.set(m.squad_id, (membersBySquad.get(m.squad_id) || 0) + 1);
    }
  }
  const sizes = Array.from(membersBySquad.values());
  const avgSquadSize = sizes.length > 0
    ? +(sizes.reduce((s, n) => s + n, 0) / sizes.length).toFixed(2)
    : 0;

  // Squads with any non-system message in last 7d = active-by-activity
  const activeByMessages = new Set<string>();
  const messagesBySquad = new Map<string, number>();
  for (const m of (squadMessages7dRes.data ?? []) as { squad_id: string; created_at: string }[]) {
    if (!activeSquadIds.has(m.squad_id)) continue;
    activeByMessages.add(m.squad_id);
    messagesBySquad.set(m.squad_id, (messagesBySquad.get(m.squad_id) || 0) + 1);
  }
  const newSquads7d = activeSquads.filter(s => s.created_at >= since7d).length;

  // Top 10 most-active squads by message count in last 7d
  const mostActiveSquads = Array.from(messagesBySquad.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, msgs]) => {
      const s = activeSquads.find(x => x.id === id);
      return {
        name: s?.name || id.slice(0, 8),
        members: membersBySquad.get(id) || 0,
        messages7d: msgs,
      };
    });

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

  // (activeUserIds was computed earlier — friendship metrics needed it first)

  // Engaged users (did something in last 7d)
  const engagedUserIds = new Set<string>();
  if (checksRes.data) for (const r of checksRes.data) engagedUserIds.add(r.author_id);
  if (responsesRes.data) for (const r of responsesRes.data) engagedUserIds.add(r.user_id);
  if (commentsRes.data) for (const r of commentsRes.data) engagedUserIds.add(r.user_id);
  if (messagesRes.data) for (const r of messagesRes.data) engagedUserIds.add(r.sender_id);

  // Lurkers: active but not engaged
  const lurkerIds = [...activeUserIds].filter(id => !engagedUserIds.has(id));
  const lurkerNames: string[] = lurkerIds.map(id => profileNames.get(id) || id.slice(0, 8));

  // Active-but-isolated: loaded the app in last 7d AND have 0 accepted friends.
  // With the onboarding-gate-requires-a-friend rule this should be ~0; treat
  // as a bug canary (ungated signups, user un-friended their only connection).
  const activeIsolatedIds = [...activeUserIds].filter(id => onboardedSet.has(id) && !degreeByUser.has(id));
  // Resolve display names for the three audit lists in one extra profile
  // fetch. These are the users you'd actually contact or investigate.
  const auditIds = new Set<string>([
    ...activeIsolatedIds,
    ...activeSingleFriendIds,
    ...activeInactiveBootstrapIds,
  ]);
  const missingAuditIds = [...auditIds].filter(id => !profileNames.has(id));
  if (missingAuditIds.length > 0) {
    const { data: extra } = await admin.from('profiles')
      .select('id, display_name, username')
      .in('id', missingAuditIds);
    if (extra) {
      for (const p of extra) {
        profileNames.set(p.id, p.display_name || p.username || p.id.slice(0, 8));
      }
    }
  }
  const activeIsolatedNames = activeIsolatedIds.map(id => profileNames.get(id) || id.slice(0, 8));
  const activeSingleFriendNames = activeSingleFriendIds.map(id => profileNames.get(id) || id.slice(0, 8));
  const activeInactiveBootstrapNames = activeInactiveBootstrapIds.map(id => profileNames.get(id) || id.slice(0, 8));

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
      pending: pendingCount,
      blocked: blockedCount,
      onboardedUsers: onboardedUsersCount,
      connectedUsers,
      isolatedUsers,
      avgFriends,
      medianFriends,
      maxFriends,
      mostConnected: mostConnectedUsers,
      acceptanceRate,
      blockRate,
      newByDate: newFriendshipsByDate,
      medianTimeToFirstFriend, // days, null if no data
      activeButIsolated: activeIsolatedIds.length,
      activeButIsolatedNames: activeIsolatedNames,
      singleFriend: singleFriendUserIds.length,
      activeSingleFriend: activeSingleFriendIds.length,
      activeSingleFriendNames,
      activeInactiveBootstrap: activeInactiveBootstrapIds.length,
      activeInactiveBootstrapNames,
      growth,
    },
    squads: {
      totalActive: activeSquads.length,
      newLast7d: newSquads7d,
      activeByMessages7d: activeByMessages.size,
      avgSize: avgSquadSize,
      mostActive: mostActiveSquads,
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
