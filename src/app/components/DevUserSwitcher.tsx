"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/** Hand-picked roster — covers the "you + a friend" case for most flows.
 *  Expand as new test fixtures land. The server route also checks @test.com,
 *  so additions here must match that pattern. */
const TEST_USERS = [
  "kat@test.com",
  "testuser2@test.com",
  "sara@test.com",
  "leo@test.com",
  "river@test.com",
  "devon@test.com",
];

const DevUserSwitcher = () => {
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setCurrentEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setCurrentEmail(session?.user?.email ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const switchTo = async (email: string) => {
    setBusy(email);
    setError(null);
    try {
      const res = await fetch("/api/dev/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

      await supabase.auth.signOut();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: body.email,
        token: body.otp,
        type: "email",
      });
      if (verifyErr) throw verifyErr;

      // Full reload so every hook re-fetches under the new session, including
      // server components and useAuth's initial bootstrap path.
      window.location.reload();
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Switch failed");
    }
  };

  return (
    <div
      // Sit above the BottomNav so its hit area never overlaps the "You" tab
      // (it used to be `bottom-4`, which lands directly on top of the nav and
      // intercepts pointer events — both annoying in dev and a real blocker
      // for Playwright tests trying to tap the nav).
      className="fixed right-4 z-[300] font-mono text-xs select-none"
      style={{
        pointerEvents: "auto",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
      }}
    >
      {open && (
        <div
          className="mb-2 rounded-xl border border-border bg-surface p-2 shadow-2xl"
          style={{ minWidth: 200 }}
        >
          <div className="px-2 pb-2 text-[10px] uppercase tracking-widest text-dim">
            Switch to
          </div>
          {TEST_USERS.filter((e) => e !== currentEmail).map((email) => (
            <button
              key={email}
              disabled={!!busy}
              onClick={() => switchTo(email)}
              className="block w-full text-left px-2 py-1.5 rounded-lg hover:bg-deep disabled:opacity-50 cursor-pointer text-primary"
            >
              {busy === email ? `signing in as ${email}…` : email}
            </button>
          ))}
          {error && (
            <div className="px-2 pt-2 text-[10px] text-red-500 break-words">
              {error}
            </div>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-border bg-surface px-3 py-2 shadow-2xl flex items-center gap-2 cursor-pointer text-primary"
      >
        <span className="text-[10px] uppercase tracking-widest text-dim">dev</span>
        <span className="truncate max-w-[160px]">{currentEmail ?? "(signed out)"}</span>
        <span className="text-dim">{open ? "▾" : "▸"}</span>
      </button>
    </div>
  );
};

export default DevUserSwitcher;
