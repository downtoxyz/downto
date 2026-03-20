"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";

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

      const res = await fetch("/api/checks/respond-shared", {
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

  const buttonStyle = {
    display: "block",
    width: "100%",
    textAlign: "center" as const,
    background: color.accent,
    color: "#000",
    borderRadius: 12,
    padding: 14,
    fontFamily: font.mono,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
  };

  // Not logged in — send through auth flow with pending check
  if (state === "logged-out") {
    return (
      <a href={`/?pendingCheck=${checkId}`} style={buttonStyle}>
        Join to respond
      </a>
    );
  }

  // Already responded
  if (state === "done") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            ...buttonStyle,
            background: "transparent",
            color: color.accent,
            border: `1px solid ${color.borderMid}`,
            cursor: "default",
          }}
        >
          {"You're down \u{1F919}"}
        </div>
        <a href={`/?tab=feed&checkId=${checkId}`} style={{ ...buttonStyle, background: color.card, color: color.text }}>
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
      style={{
        ...buttonStyle,
        opacity: state === "submitting" ? 0.6 : 1,
      }}
    >
      {state === "submitting" ? "..." : "I'm Down \u270B"}
    </button>
  );
}
