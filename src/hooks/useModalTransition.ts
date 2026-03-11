import { useState, useEffect, useRef } from "react";

/**
 * Manages open → visible → closing → unmounted lifecycle for modals.
 * Returns `visible` (should render), `closing` (animate out), and `close()`.
 *
 * Usage:
 *   const { visible, closing, close } = useModalTransition(open, onClose, 250);
 *   if (!visible) return null;
 *   // Use `closing` to drive exit animations (backdrop fade, panel slide)
 */
export function useModalTransition(
  open: boolean,
  onClose: () => void,
  duration = 250,
) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible && !closing) {
      // Parent set open=false without calling close() — trigger close animation
      setClosing(true);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, duration);
    }
    return () => clearTimeout(timerRef.current);
  }, [open]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setClosing(false);
      onClose();
    }, duration);
  };

  return { visible, closing, close };
}
