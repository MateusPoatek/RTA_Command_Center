/**
 * AlertDetailModal.tsx
 * --------------------
 * Full-payload inspection modal for a single dispatched alert.
 * Opened when the user clicks any row in the DispatchFeed.
 *
 * Sections:
 *  · Header    — status pill, cycle number, timestamp, sentBy attribution
 *  · Who       — agent name, LOB, channel, escalation level
 *  · Message   — full draft message / payload body
 *  · Audit log — ordered timeline of AI and RTA events (if available)
 *
 * Design intent: makes the AI's decision-making legible.
 * When sentBy === "ai" the header carries an "Autonomous" banner so
 * it's immediately obvious that no RTA click triggered this alert.
 */

import type { DispatchEntry } from "../domain/scenario_types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const channelLabels: Record<string, string> = {
  "google-chat-lob":  "Google Chat LOB",
  "teams-workforce":  "Teams Workforce",
  supervisor:         "Supervisor",
  om:                 "Operations Manager",
  "senior-rta":       "Senior RTA",
  servicenow:         "ServiceNow",
  handoff:            "Shift Handoff",
  "audit-only":       "Audit Only",
};

const escalationLabels: Record<string, string> = {
  "first-alert":  "First alert",
  supervisor:     "Supervisor escalation",
  om:             "OM escalation",
  "senior-rta":   "Senior RTA escalation",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="adm-detail-row">
      <span className="adm-detail-row__label">{label}</span>
      <span className={`adm-detail-row__value${mono ? " adm-detail-row__value--mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface AlertDetailModalProps {
  entry: DispatchEntry;
  onClose: () => void;
}

export function AlertDetailModal({ entry, onClose }: AlertDetailModalProps) {
  const isAi         = entry.sentBy === "ai";
  const isEscalation = entry.status === "escalated";
  const channelLabel    = channelLabels[entry.channel] ?? entry.channel;
  const escalationLabel = escalationLabels[entry.escalationLevel] ?? entry.escalationLevel;

  // Synthetic audit trail — built from what we know about the entry
  const auditTrail = buildAuditTrail(entry, isAi, isEscalation);

  return (
    // Backdrop
    <div
      className="adm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={isEscalation ? "Escalation details" : "Alert details"}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="adm">

        {/* Modal header */}
        <div className={`adm__header${isAi ? " adm__header--ai" : ""}${isEscalation ? " adm__header--escalated" : ""}`}>
          <div className="adm__header-left">
            {isAi && (
              <span className="adm__autonomous-banner">
                ⚡ AI · Autonomous
              </span>
            )}
            {isEscalation && (
              <span className="adm__escalation-banner">
                ⚠ Escalated to {escalationLabel}
              </span>
            )}
            <h2 className="adm__title">
              {isEscalation ? "Escalation" : "Alert"} #{entry.cycle} — {entry.agent}
            </h2>
            <span className="adm__timestamp">{formatDateTime(entry.timestamp)}</span>
          </div>

          <div className="adm__header-right">
            <span
              className="adm__status-pill"
              style={{
                background:
                  entry.status === "sent"      ? "var(--ai-dim)"     :
                  entry.status === "escalated" ? "var(--medium-dim)" :
                  "var(--accent-dim)",
                borderColor:
                  entry.status === "sent"      ? "var(--ai)"     :
                  entry.status === "escalated" ? "var(--medium)" :
                  "var(--info)",
                color:
                  entry.status === "sent"      ? "var(--ai)"     :
                  entry.status === "escalated" ? "var(--medium)" :
                  "var(--info)",
              }}
            >
              {entry.status.toUpperCase()}
            </span>
            <button
              className="adm__close"
              type="button"
              onClick={onClose}
              aria-label="Close alert detail"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="adm__body">

          {/* Who section */}
          <section className="adm__section">
            <h3 className="adm__section-title">Who &amp; Where</h3>
            <div className="adm__detail-grid">
              <DetailRow label="Agent"      value={entry.agent} />
              <DetailRow label="LOB"        value={entry.lob} />
              <DetailRow label="Channel"    value={channelLabel} />
              <DetailRow label="Escalation" value={escalationLabel} />
              <DetailRow
                label="Sent by"
                value={
                  isAi         ? "AI (autonomous mode)"  :
                  isEscalation ? "RTA (escalation)"      :
                  "RTA (manual approval)"
                }
              />
              <DetailRow label="Cycle"      value={`#${entry.cycle}`} mono />
              <DetailRow label="Timestamp"  value={formatDateTime(entry.timestamp)} mono />
            </div>
          </section>

          {/* Why escalated — only for escalated entries */}
          {isEscalation && entry.escalationReason && (
            <section className="adm__section adm__section--escalation-reason">
              <h3 className="adm__section-title">Why the AI Escalated</h3>
              <div className="adm__escalation-reason-box">
                <p className="adm__escalation-reason-text">{entry.escalationReason}</p>
                <p className="adm__escalation-reason-note">
                  AI confidence was below the autonomous-action threshold for this
                  situation. Rather than acting unilaterally, the AI surfaced it for
                  human judgement — a deliberate guardrail.
                </p>
              </div>
            </section>
          )}

          {/* Message payload section */}
          <section className="adm__section">
            <h3 className="adm__section-title">
              {isEscalation ? "Escalation Message" : "Message Payload"}
            </h3>
            <div className="adm__message-box">
              <div className="adm__message-meta">
                <span className="adm__message-channel">→ {channelLabel}</span>
                {isAi && (
                  <span className="adm__message-ai-note">
                    Drafted and sent by AI
                  </span>
                )}
                {isEscalation && (
                  <span className="adm__message-escalation-note">
                    Escalation — sent by RTA
                  </span>
                )}
              </div>
              <p className="adm__message-body">{entry.message}</p>
            </div>
          </section>

          {/* Escalation Protocol section — only for outage escalations */}
          {entry.outageEscalationRules && (
            <section className="adm__section adm__section--escalation-protocol">
              <h3 className="adm__section-title">Escalation Protocol</h3>
              <div className="adm__protocol">
                <div className="adm__protocol-trigger">
                  <span className="adm__protocol-label">Trigger</span>
                  <span className="adm__protocol-value">{entry.outageEscalationRules.trigger}</span>
                </div>
                {[
                  { label: "Immediate", actions: entry.outageEscalationRules.immediateActions },
                  { label: "At 5 min", actions: entry.outageEscalationRules.at5min },
                  { label: "At 15 min", actions: entry.outageEscalationRules.at15min },
                  { label: "On resolution", actions: entry.outageEscalationRules.onResolution },
                ].map(({ label, actions }) => (
                  <div key={label} className="adm__protocol-row">
                    <span className="adm__protocol-label">{label}</span>
                    <div className="adm__protocol-actions">
                      {actions.map((a) => (
                        <span key={a} className="adm__protocol-chip">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Audit trail section */}
          <section className="adm__section">
            <h3 className="adm__section-title">Audit Trail</h3>
            <ol className="adm__audit-trail">
              {auditTrail.map((event, i) => (
                <li key={i} className={`adm__audit-event adm__audit-event--${event.actor}`}>
                  <span className="adm__audit-event__actor">
                    {event.actor === "ai" ? "AI" : "RTA"}
                  </span>
                  <div className="adm__audit-event__body">
                    <span className="adm__audit-event__action">{event.action}</span>
                    <span className="adm__audit-event__detail">{event.detail}</span>
                  </div>
                  <span className="adm__audit-event__time">{event.time}</span>
                </li>
              ))}
            </ol>
          </section>

        </div>

        {/* Footer */}
        <div className="adm__footer">
          <span className="adm__footer-note">
            This record is read-only. All actions are immutably logged.
          </span>
          <button className="adm__close-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Synthetic audit trail builder
// Reconstructs the decision chain from the DispatchEntry fields.
// In a production system this would come from the real audit log.
// ---------------------------------------------------------------------------

interface AuditEvent {
  actor: "ai" | "rta";
  action: string;
  detail: string;
  time: string;
}

function buildAuditTrail(entry: DispatchEntry, isAi: boolean, isEscalation: boolean): AuditEvent[] {
  const base = new Date(entry.timestamp);
  const ago = (seconds: number) =>
    new Date(base.getTime() - seconds * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const at = base.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const channelLabel = channelLabels[entry.channel] ?? entry.channel;

  const trail: AuditEvent[] = [
    {
      actor: "ai",
      action: "Anomaly detected",
      detail: `AI watch rule triggered for ${entry.agent} in ${entry.lob}.`,
      time: ago(45),
    },
    {
      actor: "ai",
      action: "Card classified",
      detail: "Severity assigned, draft message generated, channel selected.",
      time: ago(30),
    },
  ];

  if (isEscalation) {
    trail.push(
      {
        actor: "ai",
        action: "Confidence below threshold",
        detail: "AI evaluated the situation and determined it requires human judgement. Escalation recommended.",
        time: ago(20),
      },
      {
        actor: "rta",
        action: "Card reviewed",
        detail: "RTA reviewed AI recommendation and escalation reason.",
        time: ago(12),
      },
      {
        actor: "rta",
        action: `Escalated to ${channelLabel}`,
        detail: `RTA confirmed escalation. ${channelLabel} notified directly.`,
        time: ago(4),
      },
    );
  } else if (isAi) {
    trail.push({
      actor: "ai",
      action: "Autonomous send",
      detail: `AI sent alert to ${channelLabel} without RTA input. Confidence ≥ threshold.`,
      time: ago(2),
    });
  } else {
    trail.push(
      {
        actor: "rta",
        action: "Card reviewed",
        detail: "RTA opened card, reviewed draft message.",
        time: ago(15),
      },
      {
        actor: "rta",
        action: "Approved — send",
        detail: `RTA clicked Approve & Send. Alert dispatched to ${channelLabel}.`,
        time: ago(5),
      },
    );
  }

  trail.push({
    actor: "ai",
    action: isEscalation ? "Escalation confirmed" : "Dispatch confirmed",
    detail: `${isEscalation ? "Escalation" : "Alert"} ${entry.id} recorded in shift log. Learning signal generated.`,
    time: at,
  });

  return trail;
}
