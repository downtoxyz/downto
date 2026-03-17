"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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

interface UseCheckCommentsParams {
  userId: string | null;
  profile: Profile | null;
  isDemoMode: boolean;
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

export function useCheckComments({ userId, profile, isDemoMode }: UseCheckCommentsParams) {
  const [commentsByCheck, setCommentsByCheck] = useState<Record<string, CommentUI[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [expandedCommentCheckId, setExpandedCommentCheckId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof db.subscribeToCheckComments> | null>(null);

  const hydrateCommentCounts = useCallback((counts: Record<string, number>) => {
    setCommentCounts(counts);
  }, []);

  const toggleComments = useCallback(async (checkId: string) => {
    if (expandedCommentCheckId === checkId) {
      setExpandedCommentCheckId(null);
      return;
    }
    setExpandedCommentCheckId(checkId);
    // Lazy-load comments on first expand
    if (!commentsByCheck[checkId] && !isDemoMode) {
      try {
        const comments = await db.getCheckComments(checkId);
        setCommentsByCheck(prev => ({
          ...prev,
          [checkId]: comments.map(c => toCommentUI(c, userId)),
        }));
      } catch (err) {
        logError("loadCheckComments", err, { checkId });
      }
    }
  }, [expandedCommentCheckId, commentsByCheck, isDemoMode, userId]);

  const postComment = useCallback(async (checkId: string, text: string) => {
    if (!userId || !profile || isDemoMode) return;

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

    setCommentsByCheck(prev => ({
      ...prev,
      [checkId]: [...(prev[checkId] ?? []), optimistic],
    }));
    setCommentCounts(prev => ({ ...prev, [checkId]: (prev[checkId] ?? 0) + 1 }));

    try {
      const saved = await db.postCheckComment(checkId, text);
      // Replace optimistic with real
      setCommentsByCheck(prev => ({
        ...prev,
        [checkId]: (prev[checkId] ?? []).map(c =>
          c.id === optimisticId ? toCommentUI(saved, userId) : c
        ),
      }));
    } catch (err) {
      logError("postCheckComment", err, { checkId });
      // Rollback
      setCommentsByCheck(prev => ({
        ...prev,
        [checkId]: (prev[checkId] ?? []).filter(c => c.id !== optimisticId),
      }));
      setCommentCounts(prev => ({ ...prev, [checkId]: Math.max(0, (prev[checkId] ?? 1) - 1) }));
    }
  }, [userId, profile, isDemoMode]);

  // Realtime: subscribe when a check's comments are expanded
  useEffect(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    if (!expandedCommentCheckId || isDemoMode) return;

    const channel = db.subscribeToCheckComments(expandedCommentCheckId, (comment) => {
      // Skip own messages (already optimistic)
      if (comment.user_id === userId) return;
      const ui = toCommentUI(comment, userId);
      setCommentsByCheck(prev => {
        const existing = prev[expandedCommentCheckId] ?? [];
        if (existing.some(c => c.id === ui.id)) return prev;
        return { ...prev, [expandedCommentCheckId]: [...existing, ui] };
      });
      setCommentCounts(prev => ({ ...prev, [expandedCommentCheckId]: (prev[expandedCommentCheckId] ?? 0) + 1 }));
    });
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [expandedCommentCheckId, isDemoMode, userId]);

  return {
    commentsByCheck,
    commentCounts,
    expandedCommentCheckId,
    hydrateCommentCounts,
    toggleComments,
    postComment,
  };
}
