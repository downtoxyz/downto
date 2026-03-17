"use client";

import { useState, useEffect } from "react";
import { font, color } from "@/lib/styles";
import type { Profile } from "@/lib/types";
import * as db from "@/lib/db";
import { logError } from "@/lib/logger";

const UserProfileOverlay = ({
  targetUserId,
  currentUserId,
  onClose,
  onFriendAction,
}: {
  targetUserId: string;
  currentUserId: string | null;
  onClose: () => void;
  onFriendAction: () => void;
}) => {
  const [profileData, setProfileData] = useState<Profile | null>(null);
  const [friendship, setFriendship] = useState<{ id: string; status: string; isRequester: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, f] = await Promise.all([
          db.getProfileById(targetUserId),
          currentUserId ? db.getFriendshipWith(targetUserId) : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setProfileData(p);
          setFriendship(f);
        }
      } catch (err) {
        logError("loadProfile", err, { targetUserId });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [targetUserId, currentUserId]);

  const isSelf = currentUserId === targetUserId;
  const friendStatus = friendship?.status ?? "none";
  const isRequester = friendship?.isRequester ?? false;

  const handleAction = async () => {
    if (!currentUserId || isSelf) return;
    setActing(true);
    try {
      if (friendStatus === "accepted" && friendship) {
        await db.removeFriend(friendship.id);
        setFriendship(null);
      } else if (friendStatus === "pending" && isRequester && friendship) {
        await db.removeFriend(friendship.id);
        setFriendship(null);
      } else if (friendStatus === "none") {
        await db.sendFriendRequest(targetUserId);
        const f = await db.getFriendshipWith(targetUserId);
        setFriendship(f ?? { id: "", status: "pending", isRequester: true });
      } else if (friendStatus === "pending" && !isRequester && friendship) {
        await db.acceptFriendRequest(friendship.id);
        setFriendship({ ...friendship, status: "accepted" });
      }
      onFriendAction();
    } catch (err) {
      logError("friendAction", err, { targetUserId, friendStatus });
    } finally {
      setActing(false);
    }
  };

  const actionLabel =
    friendStatus === "accepted" ? "Remove Friend"
    : friendStatus === "pending" && isRequester ? "Cancel Request"
    : friendStatus === "pending" && !isRequester ? "Accept Request"
    : "Add Friend";

  const actionDisabled = acting;
  const actionColor =
    friendStatus === "accepted" ? "#ff6b6b"
    : friendStatus === "pending" && isRequester ? color.dim
    : color.accent;
  const actionBg =
    friendStatus === "accepted" ? "transparent"
    : friendStatus === "pending" && isRequester ? "transparent"
    : color.accent;
  const actionTextColor =
    friendStatus === "accepted" ? "#ff6b6b"
    : friendStatus === "pending" && isRequester ? color.faint
    : "#000";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      />
      <div
        style={{
          position: "relative",
          background: color.surface,
          borderRadius: 24,
          width: "90%",
          maxWidth: 340,
          padding: "40px 24px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          animation: "slideUp 0.2s ease-out",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "none",
            border: "none",
            color: color.dim,
            fontSize: 18,
            cursor: "pointer",
            padding: 4,
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {loading ? (
          <div style={{ padding: "40px 0", color: color.faint, fontFamily: font.mono, fontSize: 12 }}>
            <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>Loading...</span>
          </div>
        ) : !profileData ? (
          <div style={{ padding: "40px 0", color: color.faint, fontFamily: font.mono, fontSize: 12 }}>
            User not found
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: isSelf ? color.accent : friendStatus === "accepted" ? color.accent : color.borderLight,
                color: isSelf || friendStatus === "accepted" ? "#000" : color.dim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: font.mono,
                fontSize: 28,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {profileData.avatar_letter}
            </div>

            {/* Name */}
            <div style={{ fontFamily: font.serif, fontSize: 22, color: color.text, marginBottom: 4 }}>
              {profileData.display_name}
            </div>

            {/* Username */}
            <div style={{ fontFamily: font.mono, fontSize: 13, color: color.dim, marginBottom: 4 }}>
              @{profileData.username}
            </div>

            {/* IG Handle */}
            {profileData.ig_handle && (
              <a
                href={`https://instagram.com/${profileData.ig_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: font.mono, fontSize: 11, color: color.faint, marginBottom: 8, textDecoration: "none" }}
              >
                ig: @{profileData.ig_handle}
              </a>
            )}

            {/* Availability */}
            <div style={{ fontFamily: font.mono, fontSize: 12, color: color.faint, marginBottom: 32 }}>
              {profileData.availability === "open" && "✨ open to friends!"}
              {profileData.availability === "awkward" && "👀 awkward timing"}
              {profileData.availability === "not-available" && "🌙 not available"}
            </div>

            {/* Action button */}
            {!isSelf && currentUserId && (
              <button
                onClick={handleAction}
                disabled={actionDisabled}
                style={{
                  width: "100%",
                  background: actionBg,
                  color: actionTextColor,
                  border: friendStatus === "accepted"
                    ? "1px solid rgba(255,107,107,0.3)"
                    : friendStatus === "pending" && isRequester
                      ? `1px solid ${color.borderMid}`
                      : "none",
                  borderRadius: 12,
                  padding: "14px 24px",
                  fontFamily: font.mono,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: actionDisabled ? "default" : "pointer",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  opacity: actionDisabled ? 0.6 : 1,
                }}
              >
                {acting ? "..." : actionLabel}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UserProfileOverlay;
