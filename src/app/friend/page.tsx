"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { font, color } from "@/lib/styles";
import Grain from "@/app/components/Grain";

/**
 * /friend?token=<uuid>
 *
 * Landing page for one-time instant friendship links.
 * - If logged in: redeems immediately
 * - If not logged in: shows creator info + "Join to connect" → stores token, redirects to auth
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
    <div style={{
      maxWidth: 420,
      margin: "0 auto",
      minHeight: "100vh",
      background: color.bg,
      padding: "80px 24px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
    }}>
      <Grain />

      {status === "loading" && (
        <p style={{ fontFamily: font.mono, fontSize: 12, color: color.dim }}>Loading...</p>
      )}

      {status === "redeemed" && (
        <>
          {creatorAvatar && (
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              background: color.accent, color: "#000",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: font.mono, fontSize: 24, fontWeight: 700,
              marginBottom: 20,
            }}>
              {creatorAvatar}
            </div>
          )}
          <h1 style={{ fontFamily: font.serif, fontSize: 32, color: color.text, fontWeight: 400, marginBottom: 8 }}>
            you&apos;re connected!
          </h1>
          <p style={{ fontFamily: font.mono, fontSize: 13, color: color.dim, marginBottom: 32, lineHeight: 1.6 }}>
            you and {creatorName ?? "your friend"} are now friends on down to
          </p>
          <a
            href="/"
            style={{
              display: "block",
              width: "100%",
              padding: 16,
              background: color.accent,
              color: "#000",
              border: "none",
              borderRadius: 12,
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Open App
          </a>
        </>
      )}

      {status === "login-needed" && (
        <>
          <h1 style={{ fontFamily: font.serif, fontSize: 32, color: color.text, fontWeight: 400, marginBottom: 8 }}>
            you&apos;ve been invited
          </h1>
          <p style={{ fontFamily: font.mono, fontSize: 13, color: color.dim, marginBottom: 32, lineHeight: 1.6 }}>
            someone wants to connect with you on down to. sign up or log in to accept.
          </p>
          <a
            href="/?pendingFriend=1"
            style={{
              display: "block",
              width: "100%",
              padding: 16,
              background: color.accent,
              color: "#000",
              border: "none",
              borderRadius: 12,
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Join to Connect
          </a>
        </>
      )}

      {status === "error" && (
        <>
          <h1 style={{ fontFamily: font.serif, fontSize: 32, color: color.text, fontWeight: 400, marginBottom: 8 }}>
            link expired
          </h1>
          <p style={{ fontFamily: font.mono, fontSize: 13, color: color.dim, marginBottom: 32, lineHeight: 1.6 }}>
            {errorMsg || "This friend link is no longer valid. Ask your friend to send a new one."}
          </p>
          <a
            href="/"
            style={{
              display: "block",
              width: "100%",
              padding: 16,
              background: "transparent",
              color: color.text,
              border: `1px solid ${color.borderMid}`,
              borderRadius: 12,
              fontFamily: font.mono,
              fontSize: 14,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
              textTransform: "uppercase",
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
