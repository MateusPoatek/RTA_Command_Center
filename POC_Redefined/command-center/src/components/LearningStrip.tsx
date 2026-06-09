/**
 * LearningStrip.tsx
 * -----------------
 * Bottom bar sitting above the AgentActivityTicker.
 * Shows the AI learning in real time as the RTA makes decisions.
 *
 * This is the most strategically important UX element in the demo.
 * It shows Andrew's team that every RTA decision is a training signal —
 * the system gets smarter because of the people using it.
 *
 * Counts grow as the RTA acts. Confidence trend updates after each decision.
 * The last learning event shows what the AI just learned.
 */

import type { LearningSignal } from "../domain/types";

interface LearningStripProps {
  signals: LearningSignal[];
  /** Baseline confidence (0–100) shown before any signals */
  baseConfidence: number;
}

function countByDecision(signals: LearningSignal[], decision: LearningSignal["decision"]): number {
  return signals.filter((s) => s.decision === decision).length;
}

function currentConfidence(signals: LearningSignal[], base: number): number {
  if (signals.length === 0) return base;
  const last = signals[signals.length - 1];
  return Math.round(last.confidenceAfter * 100);
}

function confidenceDelta(signals: LearningSignal[], base: number): number {
  const curr = currentConfidence(signals, base);
  return curr - base;
}

export function LearningStrip({ signals, baseConfidence }: LearningStripProps) {
  const accepted  = countByDecision(signals, "accepted");
  const edited    = countByDecision(signals, "edited");
  const skipped   = countByDecision(signals, "skipped");
  const conf      = currentConfidence(signals, baseConfidence);
  const delta     = confidenceDelta(signals, baseConfidence);
  const lastSignal= signals.length > 0 ? signals[signals.length - 1] : null;

  return (
    <div className="learning-strip" role="region" aria-label="AI learning activity">

      <span className="learning-strip__label">AI learning</span>
      <span className="learning-strip__divider" />

      {/* Decision counters */}
      <div className="learning-counter learning-counter--accepted">
        <span className="learning-counter__value">{accepted}</span>
        <span className="learning-counter__label">Accepted</span>
      </div>
      <div className="learning-counter learning-counter--edited">
        <span className="learning-counter__value">{edited}</span>
        <span className="learning-counter__label">Edited</span>
      </div>
      <div className="learning-counter learning-counter--skipped">
        <span className="learning-counter__value">{skipped}</span>
        <span className="learning-counter__label">Skipped</span>
      </div>

      <span className="learning-strip__divider" />

      {/* Confidence bar */}
      <div className="learning-confidence">
        <span className="learning-confidence__value">{conf}%</span>
        <div className="learning-confidence__bar">
          <div
            className="learning-confidence__fill"
            style={{ width: `${conf}%` }}
          />
        </div>
        {delta !== 0 && (
          <span
            className="learning-confidence__delta"
            style={{ color: delta > 0 ? "var(--ai)" : "var(--high)" }}
          >
            {delta > 0 ? `+${delta}` : delta}%
          </span>
        )}
        <span className="learning-confidence__label">AI confidence</span>
      </div>

      {/* Last learning event */}
      {lastSignal && (
        <>
          <span className="learning-strip__divider" />
          <span className="learning-strip__last-event">
            Last: {lastSignal.learningNote}
          </span>
        </>
      )}

      {!lastSignal && (
        <>
          <span className="learning-strip__divider" />
          <span className="learning-strip__hint">
            Every decision you make teaches the AI
          </span>
        </>
      )}

    </div>
  );
}
