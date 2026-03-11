import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Manages open → entering → idle → closing → unmounted lifecycle for modals.
 * Returns `visible` (should render), `entering` (fade in), `closing` (fade out), and `close()`.
 */
export function useModalTransition(
  open: boolean,
  onClose: () => void,
  closeDuration = 200,
) {
  const [visible, setVisible] = useState(false);
  const [entering, setEntering] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const rafRef = useRef(0);
  const visibleRef = useRef(false);
  const closingRef = useRef(false);
  visibleRef.current = visible;
  closingRef.current = closing;

  useEffect(() => {
    if (open) {
      setVisible(true);
      setEntering(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setEntering(false));
      });
    } else if (visibleRef.current && !closingRef.current) {
      setClosing(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, closeDuration);
    }
    return () => {
      clearTimeout(timerRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, [open, closeDuration]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, closeDuration);
  }, [onClose, closeDuration]);

  return { visible, entering, closing, close };
}
