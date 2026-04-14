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

type AdminTab = "users" | "engagement" | "push" | "versions";

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

export default function AdminPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionSort, setVersionSort] = useState<"latest" | "users">("latest");
  const [expandedBuild, setExpandedBuild] = useState<string | null>(null);
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
