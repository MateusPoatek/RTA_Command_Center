/**
 * useCaptureScheduler.ts
 * ----------------------
 * Fires `onTick()` every `seconds` while seconds > 0 (the "Frequency" setting of
 * the Capture Data hub). Off when null/0. The page drives the timer in Phase A;
 * Phase B's real re-fetch is triggered the same way (via the extension).
 *
 * Additive + inert: does nothing unless a frequency is set.
 */
import { useEffect, useRef } from "react";

export function useCaptureScheduler(seconds: number | null, onTick: () => void): void {
  const cb = useRef(onTick);
  cb.current = onTick;
  useEffect(() => {
    if (!seconds || seconds <= 0) return;
    const id = window.setInterval(() => cb.current(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [seconds]);
}
