"use client";

import { useState, useCallback, useEffect } from "react";
import * as db from "@/lib/db";
import type { Profile, CheckComment } from "@/lib/types";
import { logError } from "@/lib/logger";

export interface CommentUI {
  id: string;
  checkId: string;
  userId: string;
  text: string;
  createdAt: string;
  userName: string;
  userAvatar: string;
  isYours: boolean;
}

function toCommentUI(c: CheckComment, userId: string | null): CommentUI {
  return {
    id: c.id,
    checkId: c.check_id,
    userId: c.user_id,
    text: c.text,
    createdAt: c.created_at,
    userName: c.user_id === userId ? "You" : (c.user?.display_name ?? "Unknown"),
    userAvatar: c.user?.avatar_letter ?? "?",
    isYours: c.user_id === userId,
  };
}

export function useCheckComments({
  checkId,
  userId,
  profile,
  initialCommentCount = 0,
}: {
  checkId: string;
  userId: string | null;
  profile: Profile | null;
  initialCommentCount?: number;
}) {
  const [comments, setComments] = useState<CommentUI[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [realtimeCount, setRealtimeCount] = useState(0);

  // Always-on subscription — open when check card mounts
  useEffect(() => {
    const channel = db.subscribeToCheckComments(checkId, (comment) => {
      if (comment.user_id === userId) return;
      const ui = toCommentUI(comment, userId);
      setComments(prev => prev.some(c => c.id === ui.id) ? prev : [...prev, ui]);
      setRealtimeCount(n => n + 1);
    });
    return () => channel.unsubscribe();
  }, [checkId, userId]);

  const openComments = useCallback(async () => {
    if (loaded) return;
    try {
      const fetched = await db.getCheckComments(checkId);
      setComments(fetched.map(c => toCommentUI(c, userId)));
      setLoaded(true);
      setRealtimeCount(0);
    } catch (err) {
      logError("loadCheckComments", err, { checkId });
    }
  }, [checkId, userId]);

  const postComment = useCallback(async (text: string, mentions: string[] = []) => {
    if (!userId || !profile) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: CommentUI = {
      id: optimisticId,
      checkId,
      userId,
      text,
      createdAt: new Date().toISOString(),
      userName: "You",
      userAvatar: profile.avatar_letter,
      isYours: true,
    };

    setComments(prev => [...prev, optimistic]);

    try {
      const saved = await db.postCheckComment(checkId, text, mentions);
      setComments(prev => prev.map(c => c.id === optimisticId ? toCommentUI(saved, userId) : c));
    } catch (err) {
      logError("postCheckComment", err, { checkId });
      setComments(prev => prev.filter(c => c.id !== optimisticId));
    }
  }, [checkId, userId, profile]);

  // Before first open: initialCommentCount + realtime arrivals
  // After open: authoritative from fetched list
  const commentCount = loaded ? comments.length : initialCommentCount + realtimeCount;

  return { comments, commentCount, openComments, postComment };
}
