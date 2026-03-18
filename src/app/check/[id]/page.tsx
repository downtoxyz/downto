import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase-admin";
import { font, color } from "@/lib/styles";

interface CheckData {
  id: string;
  text: string;
  event_date: string | null;
  event_time: string | null;
  location: string | null;
  created_at: string;
  author: { display_name: string; avatar_letter: string };
  responseCount: number;
}

async function getCheck(id: string): Promise<CheckData | null> {
  const supabase = getServiceClient();

  const { data: check, error } = await supabase
    .from("interest_checks")
    .select("id, text, event_date, event_time, location, created_at, author:profiles!author_id(display_name, avatar_letter)")
    .eq("id", id)
    .is("archived_at", null)
    .not("shared_at", "is", null)
    .single();

  if (error || !check) return null;

  const { count } = await supabase
    .from("check_responses")
    .select("id", { count: "exact", head: true })
    .eq("check_id", id);

  const author = Array.isArray(check.author) ? check.author[0] : check.author;

  return {
    id: check.id,
    text: check.text,
    event_date: check.event_date,
    event_time: check.event_time,
    location: check.location,
    created_at: check.created_at,
    author: { display_name: author?.display_name ?? "Someone", avatar_letter: author?.avatar_letter ?? "?" },
    responseCount: count ?? 0,
  };
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const check = await getCheck(id);
  if (!check) return { title: "Check not found — down to" };

  const title = `${check.author.display_name}: ${check.text.slice(0, 60)}`;
  const descParts = [formatDate(check.event_date), check.event_time, check.location].filter(Boolean);
  const description = descParts.length > 0 ? descParts.join(" · ") : "Are you down?";

  return {
    title,
    description,
    openGraph: { title, description, siteName: "downto.xyz" },
  };
}

export default async function CheckPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const check = await getCheck(id);
  if (!check) notFound();

  const dateParts = [formatDate(check.event_date), check.event_time].filter(Boolean);
  const whenLine = dateParts.length > 0 ? dateParts.join(" · ") : null;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: color.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Card */}
        <div
          style={{
            background: color.card,
            borderRadius: 14,
            border: `1px solid ${color.border}`,
            padding: 20,
            marginBottom: 24,
          }}
        >
          {/* Author */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: color.borderLight,
                color: color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {check.author.avatar_letter}
            </div>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.muted }}>
              {check.author.display_name}
            </span>
          </div>

          {/* Check text */}
          <p
            style={{
              fontFamily: font.serif,
              fontSize: 20,
              color: color.text,
              lineHeight: 1.4,
              margin: "0 0 14px",
              fontWeight: 400,
            }}
          >
            {check.text}
          </p>

          {/* When / Where */}
          {(whenLine || check.location) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {whenLine && (
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>
                  {whenLine}
                </span>
              )}
              {check.location && (
                <span style={{ fontFamily: font.mono, fontSize: 11, color: color.faint }}>
                  {check.location}
                </span>
              )}
            </div>
          )}

          {/* Response count */}
          {check.responseCount > 0 && (
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.dim }}>
              {check.responseCount} {check.responseCount === 1 ? "person" : "people"} responded
            </span>
          )}
        </div>

        {/* CTA */}
        <a
          href="/"
          style={{
            display: "block",
            textAlign: "center",
            background: color.accent,
            color: "#000",
            borderRadius: 12,
            padding: 14,
            fontFamily: font.mono,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textDecoration: "none",
          }}
        >
          Join to respond
        </a>

        {/* Branding */}
        <p
          style={{
            textAlign: "center",
            fontFamily: font.serif,
            fontSize: 14,
            color: color.faint,
            marginTop: 20,
          }}
        >
          down to
        </p>
      </div>
    </div>
  );
}
