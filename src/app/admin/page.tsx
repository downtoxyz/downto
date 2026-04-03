"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { API_BASE } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { color, font } from "@/lib/styles";

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
      <div style={{ ...containerStyle, justifyContent: "center", alignItems: "center" }}>
        <p style={{ color: color.muted, fontFamily: font.mono, fontSize: 14 }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...containerStyle, justifyContent: "center", alignItems: "center" }}>
        <p style={{ color: color.muted, fontFamily: font.mono, fontSize: 14 }}>{error}</p>
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
    <div style={containerStyle}>
      <h1 style={{ fontFamily: font.serif, fontSize: 28, color: color.text, margin: "0 0 20px" }}>
        Admin
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: tab === t.key ? color.accent : "transparent",
              color: tab === t.key ? "#000" : color.dim,
              border: tab === t.key ? "none" : `1px solid ${color.borderMid}`,
              borderRadius: 10,
              padding: "8px 16px",
              fontFamily: font.mono,
              fontSize: 11,
              fontWeight: tab === t.key ? 700 : 400,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === "users" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
            <SummaryCard label="DAU Today" value={dauToday} />
            <SummaryCard label="Total Users" value={metrics.totalUsers} />
            <SummaryCard label="Onboarded" value={metrics.onboarded} />
          </div>

          <h2 style={sectionHeader}>Active Users (last 30 days)</h2>
          <div style={{ marginBottom: 32 }}>
            {days.map(({ date, dau }) => (
              <div key={date} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, width: 40, flexShrink: 0 }}>
                  {date.slice(5)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      height: 14,
                      width: dau > 0 ? `${(dau / maxDau) * 100}%` : 0,
                      backgroundColor: color.accent,
                      borderRadius: 2,
                      minWidth: dau > 0 ? 4 : 0,
                    }}
                  />
                </div>
                {dau > 0 && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted, flexShrink: 0 }}>
                    {dau}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h2 style={sectionHeader}>Signups (last 30 days)</h2>
          <div style={{ marginBottom: 32 }}>
            {days.map(({ date, signups }) => (
              <div key={`s-${date}`} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, width: 40, flexShrink: 0 }}>
                  {date.slice(5)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      height: 14,
                      width: signups > 0 ? `${(signups / maxSignups) * 100}%` : 0,
                      backgroundColor: color.accent,
                      borderRadius: 2,
                      minWidth: signups > 0 ? 4 : 0,
                    }}
                  />
                </div>
                {signups > 0 && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted, flexShrink: 0 }}>
                    {signups}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h2 style={sectionHeader}>Recent Signups</h2>
          {metrics.recentSignups.length === 0 ? (
            <p style={{ color: color.faint, fontFamily: font.mono, fontSize: 12, textAlign: "center", padding: "32px 0" }}>
              No signups
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {metrics.recentSignups.map((u) => (
                <div key={u.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${color.border}` }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: font.mono, fontSize: 12, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.display_name || u.username}</div>
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                      @{u.username}
                      {u.created_at && <> · {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
                    </div>
                  </div>
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: u.onboarded ? color.accent : color.dim, flexShrink: 0 }}>
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
            <SummaryCard label="Active (7d)" value={metrics.engagement.active7d} />
            <SummaryCard label="Engaged (7d)" value={metrics.engagement.engaged7d} />
            <SummaryCard label="Lurking (7d)" value={metrics.engagement.lurkers7d} accent={metrics.engagement.lurkers7d > 0 ? "#ff8c00" : undefined} />
          </div>

          <h2 style={sectionHeader}>Activity (last 7 days)</h2>
          <div style={{ marginBottom: 32 }}>
            {engagementDays.map(({ date, checks, responses, comments, messages }) => {
              const total = checks + responses + comments + messages;
              const maxActivity = Math.max(...engagementDays.map(d => d.checks + d.responses + d.comments + d.messages), 1);
              return (
                <div key={date} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, flexShrink: 0 }}>{date.slice(5)}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: color.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {total > 0 && `${checks}c · ${responses}r · ${comments}cm · ${messages}m`}
                    </span>
                  </div>
                  <div style={{ display: "flex", height: 14, borderRadius: 2, overflow: "hidden", width: total > 0 ? `${(total / maxActivity) * 100}%` : 0, minWidth: total > 0 ? 4 : 0 }}>
                    {checks > 0 && <div style={{ flex: checks, background: color.accent }} />}
                    {responses > 0 && <div style={{ flex: responses, background: "#AF52DE" }} />}
                    {comments > 0 && <div style={{ flex: comments, background: "#5AC8FA" }} />}
                    {messages > 0 && <div style={{ flex: messages, background: "#34C759" }} />}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {[
                { label: "checks", color: color.accent },
                { label: "responses", color: "#AF52DE" },
                { label: "comments", color: "#5AC8FA" },
                { label: "messages", color: "#34C759" },
              ].map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  <span style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {metrics.engagement.lurkerNames.length > 0 && (
            <>
              <h2 style={sectionHeader}>Lurkers (opened app, no activity)</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {metrics.engagement.lurkerNames.map((name) => (
                  <span key={name} style={{
                    fontFamily: font.mono, fontSize: 10, color: color.muted,
                    background: color.borderLight, padding: "3px 8px", borderRadius: 6,
                  }}>{name}</span>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Push tab */}
      {tab === "push" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <SummaryCard label="Subscribers" value={metrics.push.subscribers} />
            <SummaryCard label="Sent (24h)" value={metrics.push.sent24h} />
            <SummaryCard label="Failed (24h)" value={metrics.push.failed24h} accent="#ff4444" />
            <SummaryCard label="Stale (24h)" value={metrics.push.stale24h} accent={color.muted} />
          </div>

          {metrics.push.subscriberNames.length > 0 && (
            <>
              <h2 style={sectionHeader}>Subscribed Users</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 24 }}>
                {metrics.push.subscriberNames.map((name) => (
                  <span key={name} style={{
                    fontFamily: font.mono, fontSize: 10, color: color.muted,
                    background: color.borderLight, padding: "3px 8px", borderRadius: 6,
                  }}>{name}</span>
                ))}
              </div>
            </>
          )}

          {metrics.push.recentFailures.length > 0 && (
            <>
              <h2 style={sectionHeader}>Recent Failures</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {metrics.push.recentFailures.map((f, i) => (
                  <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${color.border}`, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, flexShrink: 0 }}>
                        {new Date(f.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span style={{ fontFamily: font.mono, fontSize: 11, color: f.status === "failed" ? "#ff4444" : color.muted, flexShrink: 0 }}>
                        {f.status}
                      </span>
                    </div>
                    <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim }}>
                      {f.display_name}
                    </div>
                    {f.error && (
                      <div style={{ fontFamily: font.mono, fontSize: 10, color: color.muted, marginTop: 2, wordBreak: "break-word" }}>
                        {f.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {metrics.push.recentFailures.length === 0 && (
            <p style={{ color: color.faint, fontFamily: font.mono, fontSize: 12, textAlign: "center", padding: "32px 0" }}>
              No recent failures
            </p>
          )}
        </>
      )}

      {/* Versions tab */}
      {tab === "versions" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            {["latest", "users"].map((s) => (
              <button
                key={s}
                onClick={() => setVersionSort(s as "latest" | "users")}
                style={{
                  background: "none",
                  border: "none",
                  fontFamily: font.mono,
                  fontSize: 11,
                  color: versionSort === s ? color.accent : color.dim,
                  cursor: "pointer",
                  padding: 0,
                  textTransform: "uppercase",
                }}
              >
                Sort by {s} {versionSort === s ? "↓" : ""}
              </button>
            ))}
          </div>

          {metrics.versions.distribution.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: `1px solid ${color.border}`,
                        background: color.card,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: msg ? 4 : 0 }}>
                        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.text, flexShrink: 0 }}>
                          <span style={{ color: color.faint, marginRight: 6 }}>{isExpanded ? "▾" : "▸"}</span>
                          {v.build_id ? v.build_id.slice(0, 7) : "—"}
                        </span>
                        <span style={{ fontFamily: font.mono, fontSize: 11, flexShrink: 0 }}>
                          <span style={{ color: color.accent, fontWeight: 700 }}>{v.users}</span>
                          <span style={{ color: color.dim }}> users</span>
                          <span style={{ color: color.faint, marginLeft: 8 }}>{v.pings24h} 24h</span>
                        </span>
                      </div>
                      {msg && (
                        <div style={{ fontFamily: font.mono, fontSize: 10, color: color.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingLeft: 18 }}>
                          {msg}
                        </div>
                      )}
                      {isExpanded && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8, paddingLeft: 18 }}>
                          {v.userNames.map((name) => (
                            <span key={name} style={{
                              fontFamily: font.mono, fontSize: 10, color: color.muted,
                              background: color.borderLight, padding: "3px 8px", borderRadius: 6,
                            }}>{name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <p style={{ color: color.faint, fontFamily: font.mono, fontSize: 12, textAlign: "center", padding: "32px 0" }}>
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
    <div
      style={{
        flex: "1 1 120px",
        backgroundColor: color.card,
        border: `1px solid ${color.borderLight}`,
        borderRadius: 8,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: font.mono, fontSize: 32, color: accentOverride ?? color.accent, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: color.bg,
  padding: "24px 16px",
  display: "flex",
  flexDirection: "column",
  maxWidth: 640,
  width: "100%",
  margin: "0 auto",
  overflowX: "hidden",
  overflowY: "auto",
};

const sectionHeader: React.CSSProperties = {
  fontFamily: font.mono,
  fontSize: 13,
  color: color.muted,
  fontWeight: 400,
  margin: "0 0 12px",
  textTransform: "uppercase",
  letterSpacing: 1,
};
