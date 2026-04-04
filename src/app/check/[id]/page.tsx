import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase-admin";
import CheckPreviewCTA from "./cta";

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
    <div className="min-h-dvh bg-bg flex flex-col items-center justify-center py-6 px-5">
      <div className="w-full max-w-[380px]">
        <p className="font-serif text-2xl text-primary text-center mb-5 font-normal">
          are you down?
        </p>
        {/* Card */}
        <div className="bg-card rounded-xl border border-border p-5 mb-6">
          {/* Author */}
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="w-8 h-8 rounded-full bg-border-light text-dim flex items-center justify-center font-mono text-sm font-bold">
              {check.author.avatar_letter}
            </div>
            <span className="font-mono text-xs text-muted">
              {check.author.display_name}
            </span>
          </div>

          {/* Check text */}
          <p className="font-serif text-xl text-primary leading-[1.4] mb-3.5 font-normal" style={{ margin: "0 0 14px" }}>
            {check.text}
          </p>

          {/* When / Where */}
          {(whenLine || check.location) && (
            <div className="flex flex-col gap-1 mb-3.5">
              {whenLine && (
                <span className="font-mono text-xs text-faint">
                  {whenLine}
                </span>
              )}
              {check.location && (
                <span className="font-mono text-xs text-faint">
                  {check.location}
                </span>
              )}
            </div>
          )}

          {/* Response count */}
          {check.responseCount > 0 && (
            <span className="font-mono text-xs text-dim">
              {check.responseCount} {check.responseCount === 1 ? "person" : "people"} responded
            </span>
          )}
        </div>

        {/* CTA */}
        <CheckPreviewCTA checkId={check.id} />

        {/* Branding */}
        <p className="text-center font-serif text-sm text-faint mt-5">
          down to
        </p>
      </div>
    </div>
  );
}
