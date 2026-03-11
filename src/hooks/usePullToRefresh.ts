import { useRef, useCallback } from "react";

export function usePullToRefresh({
  onRefresh,
  enabledTabs,
  chatOpen,
  tab,
}: {
  onRefresh: () => Promise<void>;
  enabledTabs: string[];
  chatOpen: boolean;
  tab: string;
}) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  const pullOffsetRef = useRef(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const isAnimatingRef = useRef(false);
  // The scroll container (has overflowY: auto)
  const scrollRef = useRef<HTMLDivElement>(null);
  // Inner wrapper that gets translated for pull effect
  const innerRef = useRef<HTMLDivElement>(null);
  const spinnerWrapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);

  const applyPullOffset = useCallback((offset: number) => {
    pullOffsetRef.current = offset;
    if (innerRef.current) {
      innerRef.current.style.transform = offset > 0 ? `translateY(${offset}px)` : "none";
    }
    if (spinnerWrapRef.current) {
      spinnerWrapRef.current.style.opacity = String(Math.min(offset / 60, 1));
    }
    if (spinnerRef.current) {
      spinnerRef.current.style.transform = `rotate(${offset * 4}deg)`;
      spinnerRef.current.style.animation = offset > 60 ? "spin 0.8s linear infinite" : "none";
    }
  }, []);

  const snapBack = useCallback(() => {
    isAnimatingRef.current = true;
    const inner = innerRef.current;
    const wrap = spinnerWrapRef.current;
    if (inner) {
      inner.style.transition = "transform 0.25s ease";
      inner.style.transform = "none";
    }
    if (wrap) {
      wrap.style.transition = "opacity 0.25s ease";
      wrap.style.opacity = "0";
    }
    setTimeout(() => {
      if (inner) inner.style.transition = "none";
      if (wrap) wrap.style.transition = "none";
      pullOffsetRef.current = 0;
      isAnimatingRef.current = false;
    }, 260);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;
    if (!enabledTabs.includes(tabRef.current)) return;
    if (chatOpenRef.current) return;
    touchStartY.current = e.touches[0].clientY;
    isPulling.current = false;
    if (innerRef.current) innerRef.current.style.transition = "none";
    if (spinnerWrapRef.current) spinnerWrapRef.current.style.transition = "none";
  }, [enabledTabs]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isAnimatingRef.current) return;
    if (!enabledTabs.includes(tabRef.current)) return;
    if (chatOpenRef.current) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) {
      isPulling.current = false;
      if (pullOffsetRef.current > 0) applyPullOffset(0);
      return;
    }
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      isPulling.current = true;
      applyPullOffset(Math.min(dy * 0.4, 100));
    } else {
      isPulling.current = false;
      if (pullOffsetRef.current > 0) applyPullOffset(0);
    }
  }, [enabledTabs, applyPullOffset]);

  const handleTouchEnd = useCallback(async () => {
    if (!enabledTabs.includes(tabRef.current)) return;
    if (!isPulling.current) {
      if (pullOffsetRef.current > 0) snapBack();
      return;
    }
    isPulling.current = false;
    if (pullOffsetRef.current > 60) {
      isAnimatingRef.current = true;
      applyPullOffset(60);
      if (spinnerRef.current) {
        spinnerRef.current.style.transform = "";
        spinnerRef.current.style.animation = "spin 0.8s linear infinite";
      }
      await onRefresh();
      if (spinnerRef.current) spinnerRef.current.style.animation = "none";
      isAnimatingRef.current = false;
      snapBack();
    } else {
      snapBack();
    }
  }, [enabledTabs, applyPullOffset, snapBack, onRefresh]);

  return {
    scrollRef,
    innerRef,
    spinnerWrapRef,
    spinnerRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
