"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { color } from "@/lib/styles";
import Grain from "@/app/components/Grain";

/**
 * /friend?token=<uuid>
 *
 * Landing page for one-time instant friendship links.
 * - If logged in: redeems immediately
 * - If not logged in: shows creator info + "Join to connect" -> stores token, redirects to auth
 *
 * Security:
 * - UUID v4 token (128-bit, unguessable)
 * - One-time use (redeemed_by set on first use)
 * - 24h expiry
 * - Max 5 active links per creator (enforced in create_friend_link RPC)
 * - Cannot use your own link
 * - Signup cap still enforced (auth flow checks independently)
 */

export default function FriendLinkPage() {
  const [status, setStatus] = useState<"loading" | "redeemed" | "error" | "login-needed">("loading");
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [creatorAvatar, setCreatorAvatar] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setErrorMsg("Invalid link");
      return;
    }

    (async () => {
      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Store token for post-auth redemption
        localStorage.setItem("pendingFriendToken", token);

        // Fetch creator info via public lookup (service client not needed — use anon)
        // We can't look up the creator without auth, so just show generic UI
        setStatus("login-needed");
        return;
      }

      // Logged in — try to redeem
      try {
        const { data, error } = await supabase.rpc("redeem_friend_link", { p_token: token });

        if (error) {
          setStatus("error");
          setErrorMsg(error.message);
          return;
        }

        const result = data as { success?: boolean; error?: string; creator_name?: string; already_friends?: boolean };

        if (result.error) {
          if (result.already_friends) {
            setStatus("redeemed");
            setCreatorName(result.creator_name ?? null);
          } else {
            setStatus("error");
            setErrorMsg(result.error);
          }
          return;
        }

        setStatus("redeemed");
        setCreatorName(result.creator_name ?? null);
        setCreatorAvatar(result.creator_name?.[0]?.toUpperCase() ?? null);

        // Clear the pending token
        localStorage.removeItem("pendingFriendToken");
      } catch {
        setStatus("error");
        setErrorMsg("Something went wrong");
      }
    })();
  }, []);

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-bg py-20 px-6 flex flex-col items-center text-center">
      <Grain />

      {status === "loading" && (
        <p className="font-mono text-xs text-dim">Loading...</p>
      )}

      {status === "redeemed" && (
        <>
          {creatorAvatar && (
            <div className="w-16 h-16 rounded-full bg-dt text-on-accent flex items-center justify-center font-mono text-2xl font-bold mb-5">
              {creatorAvatar}
            </div>
          )}
          <h1 className="font-serif text-[32px] text-primary font-normal mb-2">
            you&apos;re connected!
          </h1>
          <p className="font-mono text-sm text-dim mb-8" style={{ lineHeight: 1.6 }}>
            you and {creatorName ?? "your friend"} are now friends on down to
          </p>
          <a
            href="/"
            className="block w-full p-4 bg-dt text-on-accent border-none rounded-xl font-mono text-sm font-bold text-center no-underline uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            Open App
          </a>
        </>
      )}

      {status === "login-needed" && (
        <>
          <h1 className="font-serif text-[32px] text-primary font-normal mb-2">
            you&apos;ve been invited
          </h1>
          <p className="font-mono text-sm text-dim mb-8" style={{ lineHeight: 1.6 }}>
            someone wants to connect with you on down to. sign up or log in to accept.
          </p>
          <a
            href="/?pendingFriend=1"
            className="block w-full p-4 bg-dt text-on-accent border-none rounded-xl font-mono text-sm font-bold text-center no-underline uppercase"
            style={{ letterSpacing: "0.1em" }}
          >
            Join to Connect
          </a>
        </>
      )}

      {status === "error" && (
        <>
          <h1 className="font-serif text-[32px] text-primary font-normal mb-2">
            link expired
          </h1>
          <p className="font-mono text-sm text-dim mb-8" style={{ lineHeight: 1.6 }}>
            {errorMsg || "This friend link is no longer valid. Ask your friend to send a new one."}
          </p>
          <a
            href="/"
            className="block w-full p-4 bg-transparent text-primary rounded-xl font-mono text-sm font-bold text-center no-underline uppercase"
            style={{
              border: `1px solid ${color.borderMid}`,
              letterSpacing: "0.1em",
            }}
          >
            Go to App
          </a>
        </>
      )}
    </div>
  );
}
