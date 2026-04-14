"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { API_BASE } from "@/lib/db";
import { color } from "@/lib/styles";

type State = "loading" | "logged-out" | "ready" | "submitting" | "done";

export default function CheckPreviewCTA({ checkId }: { checkId: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? "ready" : "logged-out");
    });
  }, []);

  const handleRespond = async () => {
    setState("submitting");
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) { setState("logged-out"); return; }

      const res = await fetch(`${API_BASE}/api/checks/respond-shared`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ checkId, response: "down" }),
      });

      if (res.ok) {
        setState("done");
      } else {
        setState("ready");
      }
    } catch {
      setState("ready");
    }
  };

  if (state === "loading") return null;

  const baseClasses = "block w-full text-center bg-dt text-on-accent rounded-xl font-mono text-xs font-bold uppercase no-underline border-none cursor-pointer";
  const baseStyle = { padding: 14, letterSpacing: "0.08em" };

  // Not logged in — send through auth flow with pending check
  if (state === "logged-out") {
    return (
      <a href={`/?pendingCheck=${checkId}`} className={baseClasses} style={baseStyle}>
        Join to respond
      </a>
    );
  }

  // Already responded
  if (state === "done") {
    return (
      <div className="flex flex-col gap-2.5">
        <div
          className={`${baseClasses} !bg-transparent !text-dt !cursor-default`}
          style={{ ...baseStyle, border: `1px solid ${color.borderMid}` }}
        >
          {"You're down ✦"}
        </div>
        <a href={`/?tab=feed&checkId=${checkId}`} className={`${baseClasses} !bg-card !text-primary`} style={baseStyle}>
          Open downto
        </a>
      </div>
    );
  }

  // Logged in — respond directly
  return (
    <button
      onClick={handleRespond}
      disabled={state === "submitting"}
      className={baseClasses}
      style={{
        ...baseStyle,
        opacity: state === "submitting" ? 0.6 : 1,
      }}
    >
      {state === "submitting" ? "..." : "I'm Down \u270B"}
    </button>
  );
}
