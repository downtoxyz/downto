"use client";

import { useState, useRef } from "react";

export function useToast() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<(() => void) | null>(null);

  const showToast = (msg: string) => {
    setToastAction(null);
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  const showToastWithAction = (msg: string, action: () => void) => {
    setToastAction(() => action);
    setToastMsg(msg);
    setTimeout(() => { setToastMsg(null); setToastAction(null); }, 4000);
  };

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
