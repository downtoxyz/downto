"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { API_BASE } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import cn from "@/lib/tailwindMerge";

interface PushFailure {
  created_at: string;
  user_id: string;
  display_name: string;
  endpoint: string;
  status: string;
  error: string | null;
}

type AdminTab = "users" | "engagement" | "push" | "versions" | "themes" | "friendships" | "squads";

interface Metrics {
  totalUsers: number;
  onboarded: number;
  notOnboarded: number;
  dauByDate: Record<string, number>;
  signupsByDate: Record<string, number>;
  recentSignups: {
    username: string;
    display_name: string;
    created_at: string | null;
    onboarded: boolean;
  }[];
  push: {
    sent24h: number;
    failed24h: number;
    stale24h: number;
    subscribers: number;
    subscriberNames: string[];
    recentFailures: PushFailure[];
  };
  versions: {
    distribution: { build_id: string; users: number; pings24h: number; latestPing: string; userNames: string[] }[];
    commitMessages: Record<string, string>;
  };
  themes: {
    distribution: { theme: string; users: number; pings24h: number; userNames: string[] }[];
    usersReporting: number;
  };
  friendships: {
    accepted: number;
    pending: number;
    blocked: number;
    onboardedUsers: number;
    connectedUsers: number;
    isolatedUsers: number;
    avgFriends: number;
    medianFriends: number;
    maxFriends: number;
    mostConnected: { name: string; count: number }[];
    acceptanceRate: number;
    blockRate: number;
    newByDate: Record<string, number>;
    medianTimeToFirstFriend: number | null;
    activeButIsolated: number;
    activeButIsolatedNames: string[];
    singleFriend: number;
    activeSingleFriend: number;
    activeSingleFriendNames: string[];
    activeInactiveBootstrap: number;
    activeInactiveBootstrapNames: string[];
    growth: {
      d7: { users: number; median: number };
      d30: { users: number; median: number };
      d90: { users: number; median: number };
    };
  };
  squads: {
    totalActive: number;
    newLast7d: number;
    activeByMessages7d: number;
    avgSize: number;
    mostActive: { name: string; members: number; messages7d: number }[];
  };
  engagement: {
    active7d: number;
    engaged7d: number;
    lurkers7d: number;
    lurkerNames: string[];
    checksByDate: Record<string, number>;
    responsesByDate: Record<string, number>;
    commentsByDate: Record<string, number>;
    messagesByDate: Record<string, number>;
  };
}

function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Rough targets — where we'd want each friendship metric to be. Not science,
 * just a prior to flag drift. Tweak as you get real data.
 * - `min`: metric is healthy when value >= min
 * - `max`: metric is healthy when value <= max
 */
const FRIENDSHIP_TARGETS = {
  acceptanceRate: { min: 70, label: "≥70%" },
  blockRate: { max: 5, label: "<5%" },
  activeInactiveBootstrapPct: { max: 5, label: "<5%" },
  activeSingleFriendPct: { max: 15, label: "<15%" },
  growthD7: { min: 3, label: "≥3" },
  growthD30: { min: 5, label: "≥5" },
  growthD90: { min: 8, label: "≥8" },
};

function statusClass(hit: boolean, neutral = false) {
  if (neutral) return "text-primary";
  return hit ? "text-dt" : "text-danger";
}

export default function AdminPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionSort, setVersionSort] = useState<"latest" | "users">("latest");
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);
  const [tab, setTab] = useState<AdminTab>("users");

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      router.replace("/");
      return;
    }

    async function fetchMetrics() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("No session");
        setLoading(false);
        return;
      }

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`${API_BASE}/api/admin/metrics?tz=${encodeURIComponent(tz)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.status === 403) {
        setError("Access denied");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Failed to load metrics");
        setLoading(false);
        return;
      }

      setMetrics(await res.json());
      setLoading(false);
    }

    fetchMetrics();
  }, [isLoggedIn, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex-1 bg-bg px-4 py-6 flex flex-col justify-center items-center max-w-[640px] w-full mx-auto overflow-x-hidden overflow-y-auto">
        <p className="text-muted font-mono text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 bg-bg px-4 py-6 flex flex-col justify-center items-center max-w-[640px] w-full mx-auto overflow-x-hidden overflow-y-auto">
        <p className="text-muted font-mono text-sm">{error}</p>
      </div>
    );
  }

  if (!metrics) return null;

  const maxSignups = Math.max(...Object.values(metrics.signupsByDate), 1);

  // Fill in all 30 days using local dates
  const days: { date: string; signups: number; dau: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = localDateKey(d);
    days.push({ date: key, signups: metrics.signupsByDate[key] || 0, dau: metrics.dauByDate[key] || 0 });
  }
  const todayKey = localDateKey(new Date());
  const dauToday = metrics.dauByDate[todayKey] || 0;
  const maxDau = Math.max(...days.map((d) => d.dau), 1);

  // Build 7-day engagement chart data
  const engagementDays: { date: string; checks: number; responses: number; comments: number; messages: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = localDateKey(d);
    engagementDays.push({
      date: key,
      checks: metrics.engagement.checksByDate[key] || 0,
      responses: metrics.engagement.responsesByDate[key] || 0,
      comments: metrics.engagement.commentsByDate[key] || 0,
      messages: metrics.engagement.messagesByDate[key] || 0,
    });
  }

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "engagement", label: "Engagement" },
    { key: "push", label: "Push" },
    { key: "versions", label: "Versions" },
    { key: "themes", label: "Themes" },
    { key: "friendships", label: "Friends" },
    { key: "squads", label: "Squads" },
  ];

  return (
    <div className="fixed inset-0 bg-bg px-4 py-6 flex flex-col max-w-[640px] w-full mx-auto overflow-x-hidden overflow-y-auto">
      <h1 className="font-serif text-primary mb-5" style={{ fontSize: 28 }}>
        Admin
      </h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-4 py-2 font-mono text-xs uppercase cursor-pointer",
              tab === t.key
                ? "bg-dt text-on-accent border-none font-bold"
                : "bg-transparent text-dim border border-border-mid font-normal"
            )}
            style={{ letterSpacing: "0.08em" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === "users" && (
        <>
          <div className="flex flex-wrap gap-3 mb-8">
            <SummaryCard label="DAU Today" value={dauToday} />
            <SummaryCard label="Total Users" value={metrics.totalUsers} />
            <SummaryCard label="Onboarded" value={metrics.onboarded} />
          </div>

          <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Active Users (last 30 days)</h2>
          <div className="mb-8">
            {days.map(({ date, dau }) => (
              <div key={date} className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs text-dim w-10 shrink-0">
                  {date.slice(5)}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="h-3.5 bg-dt rounded-sm"
                    style={{
                      width: dau > 0 ? `${(dau / maxDau) * 100}%` : 0,
                      minWidth: dau > 0 ? 4 : 0,
                    }}
                  />
                </div>
                {dau > 0 && (
                  <span className="font-mono text-xs text-muted shrink-0">
                    {dau}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Signups (last 30 days)</h2>
          <div className="mb-8">
            {days.map(({ date, signups }) => (
              <div key={`s-${date}`} className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs text-dim w-10 shrink-0">
                  {date.slice(5)}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="h-3.5 bg-dt rounded-sm"
                    style={{
                      width: signups > 0 ? `${(signups / maxSignups) * 100}%` : 0,
                      minWidth: signups > 0 ? 4 : 0,
                    }}
                  />
                </div>
                {signups > 0 && (
                  <span className="font-mono text-xs text-muted shrink-0">
                    {signups}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Recent Signups</h2>
          {metrics.recentSignups.length === 0 ? (
            <p className="text-faint font-mono text-xs text-center py-8">
              No signups
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {metrics.recentSignups.map((u) => (
                <div key={u.username} className="flex justify-between items-center gap-2 py-2 border-b border-border">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-primary overflow-hidden text-ellipsis whitespace-nowrap">{u.display_name || u.username}</div>
                    <div className="font-mono text-tiny text-dim">
                      @{u.username}
                      {u.created_at && <> · {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
                    </div>
                  </div>
                  <span className={cn("font-mono text-tiny shrink-0", u.onboarded ? "text-dt" : "text-dim")}>
                    {u.onboarded ? "onboarded" : "not onboarded"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Engagement tab */}
      {tab === "engagement" && (
        <>
          <div className="flex flex-wrap gap-3 mb-8">
            <SummaryCard label="Active (7d)" value={metrics.engagement.active7d} />
            <SummaryCard label="Engaged (7d)" value={metrics.engagement.engaged7d} />
            <SummaryCard label="Lurking (7d)" value={metrics.engagement.lurkers7d} accent={metrics.engagement.lurkers7d > 0 ? "#ff8c00" : undefined} />
          </div>

          <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Activity (last 7 days)</h2>
          <div className="mb-8">
            {engagementDays.map(({ date, checks, responses, comments, messages }) => {
              const total = checks + responses + comments + messages;
              const maxActivity = Math.max(...engagementDays.map(d => d.checks + d.responses + d.comments + d.messages), 1);
              return (
                <div key={date} className="mb-2">
                  <div className="flex justify-between gap-2 mb-0.5">
                    <span className="font-mono text-xs text-dim shrink-0">{date.slice(5)}</span>
                    <span className="font-mono text-tiny text-faint overflow-hidden text-ellipsis whitespace-nowrap">
                      {total > 0 && `${checks}c · ${responses}r · ${comments}cm · ${messages}m`}
                    </span>
                  </div>
                  <div
                    className="flex h-3.5 rounded-sm overflow-hidden"
                    style={{
                      width: total > 0 ? `${(total / maxActivity) * 100}%` : 0,
                      minWidth: total > 0 ? 4 : 0,
                    }}
                  >
                    {checks > 0 && <div className="bg-dt" style={{ flex: checks }} />}
                    {responses > 0 && <div style={{ flex: responses, background: "#AF52DE" }} />}
                    {comments > 0 && <div style={{ flex: comments, background: "#5AC8FA" }} />}
                    {messages > 0 && <div style={{ flex: messages, background: "#34C759" }} />}
                  </div>
                </div>
              );
            })}
            <div className="flex gap-4 mt-2">
              {[
                { label: "checks", clr: "bg-dt" },
                { label: "responses", clr: "" },
                { label: "comments", clr: "" },
                { label: "messages", clr: "" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1">
                  <div
                    className={cn("w-2 h-2 rounded-sm", l.clr)}
                    style={
                      l.label === "responses" ? { background: "#AF52DE" } :
                      l.label === "comments" ? { background: "#5AC8FA" } :
                      l.label === "messages" ? { background: "#34C759" } :
                      undefined
                    }
                  />
                  <span className="font-mono text-tiny text-dim">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {metrics.engagement.lurkerNames.length > 0 && (
            <>
              <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Lurkers (opened app, no activity)</h2>
              <div className="flex flex-wrap gap-1">
                {metrics.engagement.lurkerNames.map((name) => (
                  <span key={name} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Push tab */}
      {tab === "push" && (
        <>
          <div className="flex flex-wrap gap-3 mb-6">
            <SummaryCard label="Subscribers" value={metrics.push.subscribers} />
            <SummaryCard label="Sent (24h)" value={metrics.push.sent24h} />
            <SummaryCard label="Failed (24h)" value={metrics.push.failed24h} accent="#ff4444" />
            <SummaryCard label="Stale (24h)" value={metrics.push.stale24h} accent="#888888" />
          </div>

          {metrics.push.subscriberNames.length > 0 && (
            <>
              <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Subscribed Users</h2>
              <div className="flex flex-wrap gap-1 mb-6">
                {metrics.push.subscriberNames.map((name) => (
                  <span key={name} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}

          {metrics.push.recentFailures.length > 0 && (
            <>
              <h2 className="font-mono text-sm text-muted font-normal mb-3 uppercase" style={{ letterSpacing: 1 }}>Recent Failures</h2>
              <div className="flex flex-col gap-2">
                {metrics.push.recentFailures.map((f, i) => (
                  <div key={i} className="py-2 border-b border-border min-w-0">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-mono text-xs text-dim shrink-0">
                        {new Date(f.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span className={cn("font-mono text-xs shrink-0", f.status === "failed" ? "text-danger" : "text-muted")}>
                        {f.status}
                      </span>
                    </div>
                    <div className="font-mono text-tiny text-dim">
                      {f.display_name}
                    </div>
                    {f.error && (
                      <div className="font-mono text-tiny text-muted mt-0.5 break-words">
                        {f.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {metrics.push.recentFailures.length === 0 && (
            <p className="text-faint font-mono text-xs text-center py-8">
              No recent failures
            </p>
          )}
        </>
      )}

      {/* Versions tab */}
      {tab === "versions" && (
        <>
          <div className="flex gap-3 mb-4">
            {["latest", "users"].map((s) => (
              <button
                key={s}
                onClick={() => setVersionSort(s as "latest" | "users")}
                className={cn(
                  "bg-transparent border-none font-mono text-xs cursor-pointer p-0 uppercase",
                  versionSort === s ? "text-dt" : "text-dim"
                )}
              >
                Sort by {s} {versionSort === s ? "↓" : ""}
              </button>
            ))}
          </div>

          {metrics.versions.distribution.length > 0 ? (
            <div className="flex flex-col gap-2">
              {[...metrics.versions.distribution]
                .sort((a, b) =>
                  versionSort === "users"
                    ? b.users - a.users
                    : b.latestPing.localeCompare(a.latestPing)
                )
                .map((v) => {
                  const msg = metrics.versions.commitMessages[v.build_id];
                  const isExpanded = expandedBuild === v.build_id;
                  return (
                    <div
                      key={v.build_id}
                      onClick={() => setExpandedBuild(isExpanded ? null : v.build_id)}
                      className="p-3 rounded-lg border border-border bg-card cursor-pointer"
                    >
                      <div className={cn("flex justify-between items-center gap-2", msg ? "mb-1" : "")}>
                        <span className="font-mono text-xs text-primary shrink-0">
                          <span className="text-faint mr-1.5">{isExpanded ? "▾" : "▸"}</span>
                          {v.build_id ? v.build_id.slice(0, 7) : "—"}
                        </span>
                        <span className="font-mono text-xs shrink-0">
                          <span className="text-dt font-bold">{v.users}</span>
                          <span className="text-dim"> users</span>
                          <span className="text-faint ml-2">{v.pings24h} 24h</span>
                        </span>
                      </div>
                      {msg && (
                        <div className="font-mono text-tiny text-dim overflow-hidden text-ellipsis whitespace-nowrap" style={{ paddingLeft: 18 }}>
                          {msg}
                        </div>
                      )}
                      {isExpanded && (
                        <div className="flex flex-wrap gap-1 mt-2" style={{ paddingLeft: 18 }}>
                          {v.userNames.map((name) => (
                            <span key={name} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-faint font-mono text-xs text-center py-8">
              No version data
            </p>
          )}
        </>
      )}

      {/* Themes tab */}
      {tab === "themes" && (
        <>
          {metrics.themes.distribution.length > 0 ? (
            <>
              <p className="font-mono text-tiny text-dim mb-3">
                Latest theme per user · {metrics.themes.usersReporting} users reporting (7d)
              </p>
              {(() => {
                const total = metrics.themes.distribution.reduce((s, t) => s + t.users, 0) || 1;
                return (
                  <div className="flex flex-col gap-2">
                    {metrics.themes.distribution.map((t) => {
                      const pct = Math.round((t.users / total) * 100);
                      const isExpanded = expandedTheme === t.theme;
                      return (
                        <div
                          key={t.theme}
                          onClick={() => setExpandedTheme(isExpanded ? null : t.theme)}
                          className="p-3 rounded-lg border border-border bg-card cursor-pointer relative overflow-hidden"
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-dt/10 pointer-events-none"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex justify-between items-center gap-2">
                            <span className="font-mono text-xs text-primary shrink-0">
                              <span className="text-faint mr-1.5">{isExpanded ? "▾" : "▸"}</span>
                              {t.theme}
                            </span>
                            <span className="font-mono text-xs shrink-0">
                              <span className="text-dt font-bold">{t.users}</span>
                              <span className="text-dim"> users</span>
                              <span className="text-faint ml-2">{pct}%</span>
                              <span className="text-faint ml-2">{t.pings24h} 24h</span>
                            </span>
                          </div>
                          {isExpanded && (
                            <div className="flex flex-wrap gap-1 mt-2 relative" style={{ paddingLeft: 18 }}>
                              {t.userNames.map((name) => (
                                <span key={name} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          ) : (
            <p className="text-faint font-mono text-xs text-center py-8">
              No theme data yet. Ship the ping and wait for users to load the app.
            </p>
          )}
        </>
      )}

      {/* Friendships tab */}
      {tab === "friendships" && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: "Accepted", value: metrics.friendships.accepted },
              { label: "Pending", value: metrics.friendships.pending },
              { label: "Blocked", value: metrics.friendships.blocked },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg border border-border bg-card">
                <div className="font-mono text-tiny text-dim uppercase" style={{ letterSpacing: "0.15em" }}>
                  {s.label}
                </div>
                <div className="font-serif text-2xl text-primary font-normal mt-1">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Per-user stats */}
          <div className="p-3 rounded-lg border border-border bg-card mb-4">
            <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
              Per user
            </div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 font-mono text-xs">
              <span className="text-dim">Connected users</span>
              <span className="text-primary text-right">
                <span className="text-dt font-bold">{metrics.friendships.connectedUsers}</span>
                <span className="text-faint"> / {metrics.friendships.onboardedUsers}</span>
              </span>
              <span className="text-dim">Isolated (0 friends)</span>
              <span className="text-primary text-right">{metrics.friendships.isolatedUsers}</span>
              <span className="text-dim">Avg friends</span>
              <span className="text-primary text-right">{metrics.friendships.avgFriends}</span>
              <span className="text-dim">Median friends</span>
              <span className="text-primary text-right">{metrics.friendships.medianFriends}</span>
              <span className="text-dim">Max friends</span>
              <span className="text-primary text-right">{metrics.friendships.maxFriends}</span>
            </div>
          </div>

          {/* Quality — invite health + stuck users */}
          {(() => {
            const f = metrics.friendships;
            return (
              <div className="p-3 rounded-lg border border-border bg-card mb-4">
                <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
                  Quality
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-y-1 gap-x-3 font-mono text-xs items-baseline">
                  <span className="text-dim">Acceptance rate</span>
                  <span className={statusClass(f.acceptanceRate >= FRIENDSHIP_TARGETS.acceptanceRate.min)}>
                    {f.acceptanceRate}%
                  </span>
                  <span className="text-faint">{FRIENDSHIP_TARGETS.acceptanceRate.label}</span>

                  <span className="text-dim">Block rate</span>
                  <span className={statusClass(f.blockRate <= FRIENDSHIP_TARGETS.blockRate.max)}>
                    {f.blockRate}%
                  </span>
                  <span className="text-faint">{FRIENDSHIP_TARGETS.blockRate.label}</span>

                  <span className="text-dim">Active · only 1 friend</span>
                  <span className="text-primary">{f.activeSingleFriend}</span>
                  <span className="text-faint">users</span>

                  <span className="text-dim">Active · bootstrap inactive 7d</span>
                  <span className={f.activeInactiveBootstrap > 0 ? "text-danger" : "text-primary"}>
                    {f.activeInactiveBootstrap}
                  </span>
                  <span className="text-faint">users</span>
                </div>
                {f.activeInactiveBootstrapNames.length > 0 && (
                  <>
                    <div className="font-mono text-tiny text-dim mt-3 mb-1">Churn watchlist (only friend is dormant)</div>
                    <div className="flex flex-wrap gap-1">
                      {f.activeInactiveBootstrapNames.map((n) => (
                        <span key={n} className="font-mono text-tiny text-on-accent bg-danger px-2 py-0.5 rounded-md">
                          {n}
                        </span>
                      ))}
                    </div>
                  </>
                )}
                {f.activeSingleFriendNames.length > 0 && (
                  <>
                    <div className="font-mono text-tiny text-dim mt-3 mb-1">Stuck at minimum (1 friend)</div>
                    <div className="flex flex-wrap gap-1">
                      {f.activeSingleFriendNames.map((n) => (
                        <span key={n} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                          {n}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Growth — median friends by signup cohort */}
          <div className="p-3 rounded-lg border border-border bg-card mb-4">
            <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
              Post-onboarding growth
            </div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-y-1 gap-x-3 font-mono text-xs items-baseline">
              {([
                ["d7", "Joined 7+ days ago", "median", FRIENDSHIP_TARGETS.growthD7],
                ["d30", "Joined 30+ days ago", "median", FRIENDSHIP_TARGETS.growthD30],
                ["d90", "Joined 90+ days ago", "median", FRIENDSHIP_TARGETS.growthD90],
              ] as const).map(([k, label, , target]) => {
                const bucket = metrics.friendships.growth[k];
                return (
                  <Fragment key={k}>
                    <span className="text-dim">{label}</span>
                    <span className={statusClass(bucket.median >= target.min)}>
                      {bucket.median} <span className="text-faint">friends</span>
                    </span>
                    <span className="text-faint">{target.label} · n={bucket.users}</span>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* Bug canaries — these should all be ~0 given the onboarding gate */}
          {(metrics.friendships.activeButIsolated > 0 || (metrics.friendships.medianTimeToFirstFriend ?? 0) > 0) && (
            <div className="p-3 rounded-lg border border-danger bg-card mb-4">
              <div className="font-mono text-tiny text-danger uppercase mb-1" style={{ letterSpacing: "0.15em" }}>
                Anomalies (expected 0)
              </div>
              <div className="grid grid-cols-2 gap-y-1 gap-x-3 font-mono text-xs">
                <span className="text-dim">Active but 0 friends</span>
                <span className="text-primary text-right">{metrics.friendships.activeButIsolated}</span>
                <span className="text-dim">Median time-to-first-friend</span>
                <span className="text-primary text-right">
                  {metrics.friendships.medianTimeToFirstFriend !== null
                    ? `${metrics.friendships.medianTimeToFirstFriend}d`
                    : "—"}
                </span>
              </div>
              {metrics.friendships.activeButIsolatedNames.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {metrics.friendships.activeButIsolatedNames.map((n) => (
                    <span key={n} className="font-mono text-tiny text-muted bg-border-light px-2 py-0.5 rounded-md">
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* New friendships per day (30d) */}
          {(() => {
            const days: { date: string; count: number }[] = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
              const key = localDateKey(d);
              days.push({ date: key, count: metrics.friendships.newByDate[key] || 0 });
            }
            const maxN = Math.max(...days.map((d) => d.count), 1);
            return (
              <div className="p-3 rounded-lg border border-border bg-card mb-4">
                <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
                  New friendships (30d)
                </div>
                {days.map(({ date, count }) => (
                  <div key={date} className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-tiny text-dim w-10 shrink-0">{date.slice(5)}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="h-3 bg-dt rounded-sm"
                        style={{
                          width: count > 0 ? `${(count / maxN) * 100}%` : 0,
                          minWidth: count > 0 ? 4 : 0,
                        }}
                      />
                    </div>
                    {count > 0 && <span className="font-mono text-tiny text-muted shrink-0">{count}</span>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Most connected */}
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
              Most connected
            </div>
            {metrics.friendships.mostConnected.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {metrics.friendships.mostConnected.map((u, i) => (
                  <div key={`${u.name}-${i}`} className="flex justify-between items-center font-mono text-xs">
                    <span className="text-primary">
                      <span className="text-faint mr-2">{i + 1}.</span>
                      {u.name}
                    </span>
                    <span>
                      <span className="text-dt font-bold">{u.count}</span>
                      <span className="text-dim"> friends</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-faint font-mono text-xs">No friendships yet</p>
            )}
          </div>
        </>
      )}

      {/* Squads tab */}
      {tab === "squads" && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: "Total active", value: metrics.squads.totalActive },
              { label: "New (7d)", value: metrics.squads.newLast7d },
              { label: "Active by msg (7d)", value: metrics.squads.activeByMessages7d },
              { label: "Avg size", value: metrics.squads.avgSize },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-lg border border-border bg-card">
                <div className="font-mono text-tiny text-dim uppercase" style={{ letterSpacing: "0.15em" }}>
                  {s.label}
                </div>
                <div className="font-serif text-2xl text-primary font-normal mt-1">
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Most active */}
          <div className="p-3 rounded-lg border border-border bg-card">
            <div className="font-mono text-tiny text-dim uppercase mb-2" style={{ letterSpacing: "0.15em" }}>
              Most active (7d messages)
            </div>
            {metrics.squads.mostActive.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {metrics.squads.mostActive.map((s, i) => (
                  <div key={`${s.name}-${i}`} className="flex justify-between items-center font-mono text-xs gap-2">
                    <span className="text-primary min-w-0 truncate">
                      <span className="text-faint mr-2">{i + 1}.</span>
                      {s.name}
                    </span>
                    <span className="shrink-0">
                      <span className="text-dt font-bold">{s.messages7d}</span>
                      <span className="text-dim"> msgs · {s.members} members</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-faint font-mono text-xs">No active squads</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent: accentOverride }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex-[1_1_120px] bg-card border border-border-light rounded-lg px-5 py-4">
      <div className="font-mono text-xs text-dim mb-1">
        {label}
      </div>
      <div className="font-mono font-bold" style={{ fontSize: 32, color: accentOverride ?? "#e8ff5a" }}>
        {value}
      </div>
    </div>
  );
}
