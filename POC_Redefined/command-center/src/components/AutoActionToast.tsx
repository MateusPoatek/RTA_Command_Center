/**
 * AutoActionToast.tsx
 * -------------------
 * Bottom-right fixed notification fired each time the AI acts autonomously.
 *
 * Behaviour:
 *  · Slides in from the right with a spring animation
 *  · Displays for 3.5 seconds, then fades out
 *  · Purely observational — no interaction required
 *  · A new `key` in the parent forces a fresh mount for each action,
 *    resetting the timer even when actions fire in rapid succession
 *
 * Content:
 *  · Severity dot + "[AI] Sent alert → {channel}"
 *  · Card title (truncated)
 *  · LOB badge
 */

import { useEffect, useState } from "react";
import type { AutoAction } from "../domain/types";

interface AutoActionToastProps {
  action: AutoAction;
}

const severityDot: Record<string, string> = {
  critical: "var(--critical)",
  high:     "var(--high)",
  medium:   "var(--medium)",
  low:      "var(--low)",
  info:     "var(--info)",
};

export function AutoActionToast({ action }: AutoActionToastProps) {
  // Drive CSS classes: "entering" → "visible" → "leaving"
  const [phase, setPhase] = useState<"entering" | "visible" | "leaving">("entering");

  useEffect(() => {
    // Small delay to let the entering animation paint
    const toVisible = window.setTimeout(() => setPhase("visible"), 50);
    // Begin exit animation after 3 seconds
    const toLeave = window.setTimeout(() => setPhase("leaving"), 3000);
    return () => {
      window.clearTimeout(toVisible);
      window.clearTimeout(toLeave);
    };
  }, []);

  return (
    <div
      className={`auto-toast auto-toast--${phase}`}
      role="status"
      aria-live="polite"
      aria-label={`AI sent alert for ${action.title}`}
    >
      {/* Header row */}
      <div className="auto-toast__header">
        <span
          className="auto-toast__severity-dot"
          style={{ background: severityDot[action.severity] ?? "var(--ai)" }}
          aria-hidden="true"
        />
        <span className="auto-toast__headline">
          [AI] Sent alert
        </span>
        <span className="auto-toast__arrow">→</span>
        <span className="auto-toast__channel">{action.channel}</span>
      </div>

      {/* Card title */}
      <div className="auto-toast__title" title={action.title}>
        {action.title.length > 52 ? `${action.title.slice(0, 52)}…` : action.title}
      </div>

      {/* LOB badge */}
      <div className="auto-toast__footer">
        <span className="auto-toast__lob">{action.lob}</span>
        <span className="auto-toast__ai-label">AI · autonomous</span>
      </div>
    </div>
  );
}
