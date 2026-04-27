"use client";

import { useState, useRef, useCallback } from "react";

export function useToast() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<(() => void) | null>(null);

  // Memoized so consumers (Home, hooks that take showToast as input) get a
  // stable reference — fresh function identities upstream cascade into a lot
  // of unnecessary re-renders downstream. setToastMsg / setToastAction are
  // stable React state setters, so empty deps are safe.
  const showToast = useCallback((msg: string) => {
    setToastAction(null);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  }, []);

  const showToastWithAction = useCallback((msg: string, action: () => void, persistent = false) => {
    setToastAction(() => action);
    setToastMsg(msg);
    if (!persistent) {
      setTimeout(() => { setToastMsg(null); setToastAction(null); }, 4000);
    }
  }, []);

  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  return {
    toastMsg,
    setToastMsg,
    toastAction,
    setToastAction,
    showToast,
    showToastWithAction,
    showToastRef,
  };
}
