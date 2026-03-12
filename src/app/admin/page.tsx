"use client";

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { color, font } from "@/lib/styles";

interface PushFailure {
  created_at: string;
  user_id: string;
  endpoint: string;
  status: string;
  error: string | null;
}

type AdminTab = "users" | "push" | "versions";

interface Metrics {
  totalUsers: number;
  onboarded: number;
  notOnboarded: number;
  dauByDate: Record<string, number>;
  signupsByDate: Record<string, number>;
  recentSignups: {
    username: string;
    display_name: string;
    created_at: string;
    onboarded: boolean;
  }[];
  push: {
    sent24h: number;
    failed24h: number;
    stale24h: number;
    recentFailures: PushFailure[];
  };
  versions: {
    distribution: { build_id: string; users: number; pings24h: number; latestPing: string; userNames: string[] }[];
    commitMessages: Record<string, string>;
  };
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

      const res = await fetch("/api/admin/metrics", {
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

  // Fill in all 30 days for both charts
  const days: { date: string; signups: number; dau: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, signups: metrics.signupsByDate[key] || 0, dau: metrics.dauByDate[key] || 0 });
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const dauToday = metrics.dauByDate[todayKey] || 0;
  const maxDau = Math.max(...days.map((d) => d.dau), 1);

  const tabs: { key: AdminTab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "push", label: "Push" },
    { key: "versions", label: "Versions" },
  ];

  return (
    <div style={containerStyle}>
      <h1 style={{ fontFamily: font.serif, fontSize: 28, color: color.text, margin: "0 0 20px" }}>
        Admin
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
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
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, width: 72, flexShrink: 0 }}>
                  {date.slice(5)}
                </span>
                <div
                  style={{
                    height: 14,
                    width: dau > 0 ? `${(dau / maxDau) * 100}%` : 0,
                    backgroundColor: color.accent,
                    borderRadius: 2,
                    minWidth: dau > 0 ? 4 : 0,
                  }}
                />
                {dau > 0 && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
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
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, width: 72, flexShrink: 0 }}>
                  {date.slice(5)}
                </span>
                <div
                  style={{
                    height: 14,
                    width: signups > 0 ? `${(signups / maxSignups) * 100}%` : 0,
                    backgroundColor: color.accent,
                    borderRadius: 2,
                    minWidth: signups > 0 ? 4 : 0,
                  }}
                />
                {signups > 0 && (
                  <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
                    {signups}
                  </span>
                )}
              </div>
            ))}
          </div>

          <h2 style={sectionHeader}>Recent Signups</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font.mono, fontSize: 12 }}>
              <thead>
                <tr>
                  {["Username", "Display Name", "Signed Up", "Onboarded"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        color: color.dim,
                        borderBottom: `1px solid ${color.borderLight}`,
                        fontWeight: 400,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.recentSignups.map((u) => (
                  <tr key={u.username}>
                    <td style={cellStyle}>{u.username}</td>
                    <td style={cellStyle}>{u.display_name || "—"}</td>
                    <td style={cellStyle}>
                      {new Date(u.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td style={cellStyle}>
                      <span style={{ color: u.onboarded ? color.accent : color.dim }}>
                        {u.onboarded ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Push tab */}
      {tab === "push" && (
        <>
          <h2 style={sectionHeader}>Delivery (24h)</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <SummaryCard label="Sent" value={metrics.push.sent24h} />
            <SummaryCard label="Failed" value={metrics.push.failed24h} accent="#ff4444" />
            <SummaryCard label="Stale" value={metrics.push.stale24h} accent={color.muted} />
          </div>

          {metrics.push.recentFailures.length > 0 && (
            <>
              <h2 style={sectionHeader}>Recent Failures</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font.mono, fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Time", "Status", "User ID", "Error"].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "8px 12px",
                            color: color.dim,
                            borderBottom: `1px solid ${color.borderLight}`,
                            fontWeight: 400,
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.push.recentFailures.map((f, i) => (
                      <tr key={i}>
                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                          {new Date(f.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={cellStyle}>
                          <span style={{ color: f.status === "failed" ? "#ff4444" : color.muted }}>
                            {f.status}
                          </span>
                        </td>
                        <td style={{ ...cellStyle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {f.user_id.slice(0, 8)}...
                        </td>
                        <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", color: color.muted }}>
                          {f.error || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
          <h2 style={sectionHeader}>Distribution (7d)</h2>

          {metrics.versions.distribution.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font.mono, fontSize: 12 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        ...sortableHeader,
                        color: versionSort === "latest" ? color.accent : color.dim,
                        cursor: "pointer",
                      }}
                      onClick={() => setVersionSort("latest")}
                    >
                      Build {versionSort === "latest" ? "↓" : ""}
                    </th>
                    <th
                      style={{
                        ...sortableHeader,
                        color: versionSort === "users" ? color.accent : color.dim,
                        cursor: "pointer",
                      }}
                      onClick={() => setVersionSort("users")}
                    >
                      Users {versionSort === "users" ? "↓" : ""}
                    </th>
                    <th style={sortableHeader}>24h</th>
                  </tr>
                </thead>
                <tbody>
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
                        <Fragment key={v.build_id}>
                        <tr
                          onClick={() => setExpandedBuild(isExpanded ? null : v.build_id)}
                          style={{ cursor: "pointer" }}
                        >
                          <td style={{ ...cellStyle, maxWidth: 260 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <span style={{ color: color.faint, marginRight: 6 }}>{isExpanded ? "▾" : "▸"}</span>
                              {v.build_id ? v.build_id.slice(0, 7) : "—"}
                            </div>
                            {msg && (
                              <div style={{ fontSize: 10, color: color.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2, paddingLeft: 16 }}>
                                {msg}
                              </div>
                            )}
                          </td>
                          <td style={cellStyle}>
                            <span style={{ color: color.accent, fontWeight: 700 }}>{v.users}</span>
                          </td>
                          <td style={cellStyle}>
                            <span style={{ color: color.muted }}>{v.pings24h}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={3} style={{ padding: "4px 12px 12px 28px" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {v.userNames.map((name) => (
                                  <span key={name} style={{
                                    fontFamily: font.mono, fontSize: 10, color: color.muted,
                                    background: color.borderLight, padding: "3px 8px", borderRadius: 6,
                                  }}>{name}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
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

const cellStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: color.text,
  borderBottom: `1px solid ${color.border}`,
};

const sortableHeader: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: `1px solid ${color.borderLight}`,
  fontWeight: 400,
};
