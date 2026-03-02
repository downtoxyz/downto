"use client";

import { useState, useEffect } from "react";
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

interface Metrics {
  totalUsers: number;
  onboarded: number;
  notOnboarded: number;
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
    distribution: { build_id: string; users: number; pings24h: number }[];
  };
}

export default function AdminPage() {
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Fill in all 30 days for the chart
  const days: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, count: metrics.signupsByDate[key] || 0 });
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ fontFamily: font.serif, fontSize: 28, color: color.text, margin: "0 0 24px" }}>
        Admin
      </h1>

      {/* Summary cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <SummaryCard label="Total Users" value={metrics.totalUsers} />
        <SummaryCard label="Onboarded" value={metrics.onboarded} />
        <SummaryCard label="Not Onboarded" value={metrics.notOnboarded} />
      </div>

      {/* Signups over time */}
      <h2 style={sectionHeader}>Signups (last 30 days)</h2>
      <div style={{ marginBottom: 32 }}>
        {days.map(({ date, count }) => (
          <div key={date} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim, width: 72, flexShrink: 0 }}>
              {date.slice(5)}
            </span>
            <div
              style={{
                height: 14,
                width: count > 0 ? `${(count / maxSignups) * 100}%` : 0,
                backgroundColor: color.accent,
                borderRadius: 2,
                minWidth: count > 0 ? 4 : 0,
              }}
            />
            {count > 0 && (
              <span style={{ fontFamily: font.mono, fontSize: 11, color: color.muted }}>
                {count}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Recent signups table */}
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
                  {new Date(u.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
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

      {/* Push delivery */}
      <h2 style={{ ...sectionHeader, marginTop: 40 }}>Push Delivery (24h)</h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <SummaryCard label="Sent" value={metrics.push.sent24h} />
        <SummaryCard label="Failed" value={metrics.push.failed24h} accent="#ff4444" />
        <SummaryCard label="Stale" value={metrics.push.stale24h} accent={color.muted} />
      </div>

      {metrics.push.recentFailures.length > 0 && (
        <>
          <h2 style={sectionHeader}>Recent Push Failures</h2>
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

      {/* Version distribution */}
      <h2 style={{ ...sectionHeader, marginTop: 40 }}>Versions (7d)</h2>

      {metrics.versions.distribution.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font.mono, fontSize: 12 }}>
            <thead>
              <tr>
                {["Build ID", "Users", "Pings (24h)"].map((h) => (
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
              {metrics.versions.distribution.map((v) => (
                <tr key={v.build_id}>
                  <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {v.build_id || "—"}
                  </td>
                  <td style={cellStyle}>
                    <span style={{ color: color.accent, fontWeight: 700 }}>{v.users}</span>
                  </td>
                  <td style={cellStyle}>
                    <span style={{ color: color.muted }}>{v.pings24h}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent: accentOverride }: { label: string; value: number; accent?: string }) {
  return (
    <div
      style={{
        flex: 1,
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
  minHeight: "100dvh",
  backgroundColor: color.bg,
  padding: "24px 16px",
  display: "flex",
  flexDirection: "column",
  maxWidth: 640,
  margin: "0 auto",
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
