"use client";

import { useState, useEffect } from "react";
import { color } from "@/lib/styles";
import type { Profile } from "@/lib/types";
import * as db from "@/lib/db";
import { logError } from "@/lib/logger";
import cn from "@/lib/tailwindMerge";

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
  const actionTextColor =
    friendStatus === "accepted" ? "#ff6b6b"
    : friendStatus === "pending" && isRequester ? color.faint
    : "#000";
  const actionBg =
    friendStatus === "accepted" ? "transparent"
    : friendStatus === "pending" && isRequester ? "transparent"
    : color.accent;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      />
      <div className="relative bg-surface rounded-3xl w-[90%] max-w-[340px] pt-10 px-6 pb-8 flex flex-col items-center animate-slide-up">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 bg-transparent border-none text-dim text-lg cursor-pointer p-1 leading-none"
        >
          ✕
        </button>

        {loading ? (
          <div className="py-10 text-faint font-mono text-xs">
            <span style={{ animation: "pulse 1.5s ease-in-out infinite" }}>Loading...</span>
          </div>
        ) : !profileData ? (
          <div className="py-10 text-faint font-mono text-xs">
            User not found
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div
              className={cn(
                "w-[72px] h-[72px] rounded-full flex items-center justify-center font-mono text-[28px] font-bold mb-4",
                (isSelf || friendStatus === "accepted") ? "bg-dt text-black" : "bg-border-light text-dim"
              )}
            >
              {profileData.avatar_letter}
            </div>

            {/* Name */}
            <div className="font-serif text-2xl text-primary mb-1">
              {profileData.display_name}
            </div>

            {/* Username */}
            <div className="font-mono text-sm text-dim mb-1">
              @{profileData.username}
            </div>

            {/* IG Handle */}
            {profileData.ig_handle && (
              <a
                href={`https://instagram.com/${profileData.ig_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-faint mb-2 no-underline"
              >
                ig: @{profileData.ig_handle}
              </a>
            )}

            {/* Availability */}
            <div className="font-mono text-xs text-faint mb-8">
              {profileData.availability === "open" && "✨ open to friends!"}
              {profileData.availability === "awkward" && "👀 awkward timing"}
              {profileData.availability === "not-available" && "🌙 not available"}
            </div>

            {/* Action button */}
            {!isSelf && currentUserId && (
              <button
                onClick={handleAction}
                disabled={actionDisabled}
                className={cn(
                  "w-full rounded-xl py-3.5 px-6 font-mono text-xs font-bold uppercase",
                  actionDisabled ? "cursor-default opacity-60" : "cursor-pointer opacity-100"
                )}
                style={{
                  background: actionBg,
                  color: actionTextColor,
                  border: friendStatus === "accepted"
                    ? "1px solid rgba(255,107,107,0.3)"
                    : friendStatus === "pending" && isRequester
                      ? `1px solid ${color.borderMid}`
                      : "none",
                  letterSpacing: "0.08em",
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
