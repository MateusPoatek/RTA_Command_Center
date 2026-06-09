/**
 * ShiftStartModal.tsx
 * --------------------
 * Full-screen overlay that appears when the RTA opens the app.
 * Answers the first cognitive question every RTA asks: "What happened
 * while I was gone, and what do I need to do right now?"
 *
 * Sections:
 *  1. Previous shift summary  — who ran it, what happened, AI learned what
 *  2. Needs your attention NOW — current risks (from scenario seed data)
 *  3. Today's forecast         — peak windows, report deadlines, coaching
 *  4. Messages                 — simulated Teams / GChat inbox
 *
 * Dismissed via "Start shift" CTA.
 * Re-accessible from the CommandBar "Shift brief" button.
 */

import { shiftBriefing } from "../data/shiftBriefing";
import type { CurrentPriority, ForecastItem, InboxMessage } from "../data/shiftBriefing";

interface ShiftStartModalProps {
  onStart: () => void;
  /** First name of the currently logged-in RTA.
   *  Used in the greeting ("Good morning, Lorena.").
   *  Defaults to the previous shift's RTA name if not provided (legacy behaviour). */
  rtaFirstName?: string;
}

// ---------------------------------------------------------------------------
// Sub-section: Previous shift
// ---------------------------------------------------------------------------

function PrevShiftSection() {
  const { prevShift } = shiftBriefing;
  return (
    <div className="briefing-card">
      <p className="briefing-card__eyebrow">Previous shift</p>
      <p className="briefing-card__heading">{prevShift.rta} · {prevShift.date}</p>
      <div className="briefing-card__stats">
        <div className="briefing-stat">
          <span className="briefing-stat__value">{prevShift.alertsSent}</span>
          <span className="briefing-stat__label">Alerts sent</span>
        </div>
        <div className="briefing-stat">
          <span className="briefing-stat__value">{prevShift.aiHandledPct}%</span>
          <span className="briefing-stat__label">AI handled</span>
        </div>
        <div className="briefing-stat">
          <span className="briefing-stat__value">{prevShift.escalations}</span>
          <span className="briefing-stat__label">Escalations</span>
        </div>
        <div className="briefing-stat">
          <span className="briefing-stat__value briefing-stat__value--ai">{prevShift.aiLearnedCount}</span>
          <span className="briefing-stat__label">AI learned</span>
        </div>
      </div>
      {prevShift.openItems.length > 0 && (
        <div className="briefing-card__open-items">
          <p className="briefing-card__open-label">Left open for you</p>
          {prevShift.openItems.map((item, i) => (
            <div key={i} className="briefing-open-item">
              <span className="briefing-open-item__dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-section: Morning reconciliation
// ---------------------------------------------------------------------------

function ReconciliationSection() {
  const { reconciliation: r } = shiftBriefing;
  const headcountDelta = r.presentAgents - r.scheduledAgents;

  return (
    <div className="briefing-card">
      <p className="briefing-card__eyebrow">Morning reconciliation</p>
      <div className="briefing-card__stats">
        <div className="briefing-stat">
          <span className="briefing-stat__value">{r.scheduledAgents}</span>
          <span className="briefing-stat__label">Scheduled</span>
        </div>
        <div className="briefing-stat">
          <span
            className="briefing-stat__value"
            style={{ color: headcountDelta < 0 ? "var(--high)" : "var(--ai)" }}
          >
            {r.presentAgents}
          </span>
          <span className="briefing-stat__label">Present</span>
        </div>
        <div className="briefing-stat">
          <span className="briefing-stat__value briefing-stat__value--warn">{r.absentAgents.length}</span>
          <span className="briefing-stat__label">Absent</span>
        </div>
      </div>

      {r.absentAgents.length > 0 && (
        <div className="briefing-card__open-items">
          <p className="briefing-card__open-label">Absent today</p>
          {r.absentAgents.map((a, i) => (
            <div key={i} className="briefing-open-item">
              <span className="briefing-open-item__dot" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      {r.lobCoverageAdjusted.length > 0 && (
        <div className="briefing-card__open-items">
          <p className="briefing-card__open-label">Coverage adjustments</p>
          {r.lobCoverageAdjusted.map((adj, i) => (
            <div key={i} className="briefing-open-item">
              <span className="briefing-open-item__dot" style={{ background: "var(--medium)" }} />
              <span>{adj}</span>
            </div>
          ))}
        </div>
      )}

      <div className="briefing-card__ai-action">
        <span className="briefing-card__ai-action-icon" aria-hidden="true">⚡</span>
        <span>{r.aiAction}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-section: Current priorities
// ---------------------------------------------------------------------------

const priorityBorderColor: Record<CurrentPriority["severity"], string> = {
  critical: "var(--critical)",
  high:     "var(--high)",
  medium:   "var(--medium)",
};

function PrioritiesSection() {
  return (
    <div className="briefing-card">
      <p className="briefing-card__eyebrow">Needs your attention now</p>
      <div className="briefing-priorities">
        {shiftBriefing.currentPriorities.map((p) => (
          <div
            key={p.id}
            className="briefing-priority"
            style={{ borderLeftColor: priorityBorderColor[p.severity] }}
          >
            <p className="briefing-priority__title">{p.title}</p>
            <p className="briefing-priority__detail">{p.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-section: Forecast
// ---------------------------------------------------------------------------

const forecastIcon: Record<ForecastItem["type"], string> = {
  peak:     "↑",
  report:   "R",
  coaching: "C",
  info:     "i",
};

const forecastColor: Record<ForecastItem["type"], string> = {
  peak:     "var(--critical)",
  report:   "var(--accent)",
  coaching: "var(--ai)",
  info:     "var(--text-muted)",
};

function ForecastSection() {
  return (
    <div className="briefing-card">
      <p className="briefing-card__eyebrow">Today's forecast</p>
      <div className="briefing-forecast">
        {shiftBriefing.forecast.map((item, i) => (
          <div key={i} className="briefing-forecast-item">
            <span
              className="briefing-forecast-item__icon"
              style={{ color: forecastColor[item.type] }}
            >
              {forecastIcon[item.type]}
            </span>
            <span className="briefing-forecast-item__time">{item.time}</span>
            <span className="briefing-forecast-item__event">{item.event}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-section: Messages
// ---------------------------------------------------------------------------

const channelColor: Record<InboxMessage["channel"], string> = {
  teams:  "var(--info)",
  gchat:  "var(--ai)",
};

function MessagesSection() {
  return (
    <div className="briefing-card">
      <p className="briefing-card__eyebrow">Messages while you were out</p>
      <div className="briefing-messages">
        {shiftBriefing.inbox.map((msg) => (
          <div key={msg.id} className="briefing-message">
            <div className="briefing-message__header">
              <span
                className="briefing-message__channel"
                style={{ background: channelColor[msg.channel] }}
              >
                {msg.channel === "teams" ? "Teams" : "GChat"}
              </span>
              <span className="briefing-message__from">{msg.from}</span>
              <span className="briefing-message__time">{msg.time}</span>
            </div>
            <p className="briefing-message__text">{msg.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShiftStartModal — main export
// ---------------------------------------------------------------------------

export function ShiftStartModal({ onStart, rtaFirstName }: ShiftStartModalProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    "Good evening";

  // Use the current RTA's first name if provided; fall back to the previous
  // shift's RTA name as a safe default until the prop is wired from App.
  const firstName = rtaFirstName ?? shiftBriefing.prevShift.rta.split(" ")[0];

  return (
    <div className="shift-modal-backdrop" role="dialog" aria-modal="true" aria-label="Shift briefing">
      <div className="shift-modal">

        {/* Header */}
        <div className="shift-modal__header">
          <div>
            <p className="shift-modal__greeting">{greeting}, {firstName}.</p>
            <p className="shift-modal__subline">
              Here is what happened while you were out, and what needs your attention now.
            </p>
          </div>
          <div className="shift-modal__ai-badge">
            <span className="shift-modal__ai-dot" />
            <span>AI briefing ready</span>
          </div>
        </div>

        {/* Grid of sections */}
        <div className="shift-modal__grid">
          <PrevShiftSection />
          <ReconciliationSection />
          <PrioritiesSection />
          <ForecastSection />
          <MessagesSection />
        </div>

        {/* Footer CTA */}
        <div className="shift-modal__footer">
          <p className="shift-modal__footer-note">
            The AI is already watching 248 agents across 6 LOBs.
          </p>
          <button
            className="shift-modal__start-btn"
            type="button"
            onClick={onStart}
          >
            Start shift
          </button>
        </div>

      </div>
    </div>
  );
}
