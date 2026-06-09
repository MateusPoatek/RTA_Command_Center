/**
 * ReportDetailModal.tsx
 * ---------------------
 * Full-detail inspection modal for a sent attendance report.
 * Opened when the RTA clicks any row in the "Sent this shift" list.
 *
 * Sections:
 *  · Header       — cycle label, status pill, email subject, sent time
 *  · Stats        — attendance %, absenteeism %, lateness %, no-shows, anomaly banner
 *  · Email        — subject + full email body as it was dispatched
 *  · Audit trail  — synthetic timeline: AI assembled → validated → RTA reviewed → sent → read receipt
 *  · Viewed by    — simulated read-receipt list
 *  · Notes        — RTA can add and delete shift notes (local state)
 */

import { useState } from "react";
import type { AttendanceReportData } from "../domain/scenario_types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ---------------------------------------------------------------------------
// Simulated "viewed by" data — seeded for demo realism
// ---------------------------------------------------------------------------

const SIMULATED_VIEWERS: Record<string, { name: string; role: string; minsAfter: number }[]> = {
  Morning: [
    { name: "Lorena Pacheco",       role: "Operations Manager",    minsAfter: 3 },
    { name: "Mark Tolentino",       role: "Philippines RTA",       minsAfter: 8 },
    { name: "Hector Solano",     role: "Team Lead — TLB",       minsAfter: 12 },
    { name: "Senior RTA On-call",role: "RTA Lead",              minsAfter: 22 },
  ],
  Midday: [
    { name: "Lorena Pacheco",       role: "Operations Manager",    minsAfter: 5 },
    { name: "Mark Tolentino",       role: "Philippines RTA",       minsAfter: 9 },
  ],
  Final: [
    { name: "Lorena Pacheco",       role: "Operations Manager",    minsAfter: 4 },
    { name: "Mark Tolentino",       role: "Philippines RTA",       minsAfter: 11 },
    { name: "Senior RTA On-call",role: "RTA Lead",              minsAfter: 18 },
    { name: "Brenda Quevedo",       role: "Incoming RTA",          minsAfter: 35 },
  ],
};

// ---------------------------------------------------------------------------
// Synthetic audit trail builder
// ---------------------------------------------------------------------------

interface AuditLine {
  actor: "ai" | "rta" | "system";
  action: string;
  detail: string;
  time: string;
}

function buildAuditTrail(report: AttendanceReportData): AuditLine[] {
  const base   = new Date(report.reportTime);
  const ago    = (s: number) => new Date(base.getTime() - s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const atTime = formatTime(report.reportTime);

  const trail: AuditLine[] = [
    {
      actor:  "ai",
      action: "Data assembled",
      detail: "GTT export pulled and cross-referenced with Workday approvals. Headcount verified.",
      time:   ago(300),
    },
    {
      actor:  "ai",
      action: "Thresholds evaluated",
      detail: report.anomaly
        ? `Anomaly detected — attendance ${report.attendancePct}% is near or below 70% threshold. Senior RTA CC'd.`
        : `All metrics within normal range. Attendance ${report.attendancePct}% — no anomaly flags.`,
      time:   ago(180),
    },
    {
      actor:  "ai",
      action: "Email drafted",
      detail: `Subject: "${report.emailSubject}" — body assembled from template with live figures.`,
      time:   ago(90),
    },
    {
      actor:  "rta",
      action: "Draft reviewed",
      detail: "RTA reviewed figures and email copy before dispatch.",
      time:   ago(30),
    },
    {
      actor:  "system",
      action: "Email dispatched",
      detail: `Sent to Operations Distribution List${report.anomaly ? " + Senior RTA (direct CC)" : ""}.`,
      time:   atTime,
    },
  ];

  if (report.anomaly) {
    trail.push({
      actor:  "ai",
      action: "Anomaly learning signal",
      detail: "AI logged anomaly pattern for future threshold calibration.",
      time:   atTime,
    });
  }

  return trail;
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function StatBox({ value, label, warn = false }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="rdm-stat">
      <span className="rdm-stat__value" style={warn ? { color: "var(--critical)" } : undefined}>
        {value}
      </span>
      <span className="rdm-stat__label">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ReportDetailModalProps {
  report: AttendanceReportData;
  onClose: () => void;
}

export function ReportDetailModal({ report, onClose }: ReportDetailModalProps) {
  const [notes,    setNotes]    = useState<string[]>([]);
  const [noteText, setNoteText] = useState("");

  const auditTrail = buildAuditTrail(report);
  const viewers    = SIMULATED_VIEWERS[report.cycleLabel] ?? [];

  function addNote() {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setNotes((prev) => [...prev, trimmed]);
    setNoteText("");
  }

  return (
    <div
      className="rdm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Report detail"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rdm">

        {/* ── Header ── */}
        <div className={`rdm__header${report.anomaly ? " rdm__header--anomaly" : ""}`}>
          <div className="rdm__header-left">
            <div className="rdm__header-top">
              <span className="rdm__cycle-badge">{report.cycleLabel} Report</span>
              <span
                className="rdm__status-pill"
                style={{
                  background:  report.status === "sent" ? "var(--ai-dim)" : "var(--medium-dim)",
                  borderColor: report.status === "sent" ? "var(--ai)"     : "var(--medium)",
                  color:       report.status === "sent" ? "var(--ai)"     : "var(--medium)",
                }}
              >
                {report.status.toUpperCase()}
              </span>
              {report.anomaly && (
                <span className="rdm__anomaly-pill">⚠ ANOMALY</span>
              )}
            </div>
            <p className="rdm__subject">{report.emailSubject}</p>
            <span className="rdm__timestamp">{formatDateTime(report.reportTime)}</span>
          </div>
          <button
            className="rdm__close"
            type="button"
            onClick={onClose}
            aria-label="Close report detail"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="rdm__body">

          {/* Anomaly banner */}
          {report.anomaly && report.anomalyNote && (
            <div className="rdm__anomaly-banner">
              <span className="rdm__anomaly-banner-icon" aria-hidden="true">⚠</span>
              <span>{report.anomalyNote}</span>
            </div>
          )}

          {/* Stats */}
          <section className="rdm__section">
            <h3 className="rdm__section-title">Attendance Metrics</h3>
            <div className="rdm__stats-row">
              <StatBox
                value={`${report.attendancePct}%`}
                label="Attendance"
                warn={report.attendancePct < 75}
              />
              <StatBox
                value={`${report.absenteeismPct}%`}
                label="Absenteeism"
                warn={report.absenteeismPct > 15}
              />
              <StatBox
                value={`${report.latenessPct}%`}
                label="Lateness"
                warn={report.latenessPct > 10}
              />
              <StatBox
                value={String(report.noShowCount)}
                label="No-shows"
                warn={report.noShowCount > 5}
              />
              <StatBox
                value={String(report.totalScheduled)}
                label="Scheduled"
              />
            </div>
            {report.latenessMinutes > 0 && (
              <p className="rdm__lateness-note">
                Combined lateness: <strong>{report.latenessMinutes} min</strong>
              </p>
            )}
          </section>

          {/* Email preview */}
          <section className="rdm__section">
            <h3 className="rdm__section-title">Email Dispatched</h3>
            <div className="rdm__email-frame">
              <div className="rdm__email-subject">
                <span className="rdm__email-subject-label">Subject</span>
                <span className="rdm__email-subject-value">{report.emailSubject}</span>
              </div>
              <div className="rdm__email-meta">
                <span>To: Operations Distribution List</span>
                {report.anomaly && <span className="rdm__email-cc">CC: Senior RTA (anomaly)</span>}
              </div>
              <pre className="rdm__email-body">{report.emailBody}</pre>
            </div>
          </section>

          {/* Audit trail */}
          <section className="rdm__section">
            <h3 className="rdm__section-title">Audit Trail</h3>
            <ol className="rdm__audit-trail">
              {auditTrail.map((ev, i) => (
                <li
                  key={i}
                  className={`rdm__audit-event rdm__audit-event--${ev.actor}`}
                >
                  <span className="rdm__audit-event__actor">
                    {ev.actor === "ai" ? "AI" : ev.actor === "rta" ? "RTA" : "SYS"}
                  </span>
                  <div className="rdm__audit-event__body">
                    <span className="rdm__audit-event__action">{ev.action}</span>
                    <span className="rdm__audit-event__detail">{ev.detail}</span>
                  </div>
                  <span className="rdm__audit-event__time">{ev.time}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* Viewed by */}
          {viewers.length > 0 && (
            <section className="rdm__section">
              <h3 className="rdm__section-title">Viewed By</h3>
              <div className="rdm__viewers">
                {viewers.map((v, i) => (
                  <div key={i} className="rdm__viewer-row">
                    <div className="rdm__viewer-avatar" aria-hidden="true">
                      {v.name.charAt(0)}
                    </div>
                    <div className="rdm__viewer-info">
                      <span className="rdm__viewer-name">{v.name}</span>
                      <span className="rdm__viewer-role">{v.role}</span>
                    </div>
                    <span className="rdm__viewer-time">
                      {v.minsAfter} min after send
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Notes */}
          <section className="rdm__section rdm__section--notes">
            <h3 className="rdm__section-title">Shift Notes</h3>

            {notes.length > 0 && (
              <ul className="rdm__notes-list">
                {notes.map((note, i) => (
                  <li key={i} className="rdm__note-item">
                    <span className="rdm__note-author">Bruno Castillo · now</span>
                    <p className="rdm__note-text">{note}</p>
                    <button
                      className="rdm__note-delete"
                      type="button"
                      onClick={() => setNotes((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="Delete note"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="rdm__note-input-row">
              <textarea
                className="rdm__note-textarea"
                placeholder="Add a note to this report… (e.g. anomaly context, follow-up action)"
                rows={2}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
                }}
              />
              <button
                className="rdm__note-add-btn"
                type="button"
                onClick={addNote}
                disabled={!noteText.trim()}
              >
                Add note
              </button>
            </div>
            <p className="rdm__note-hint">Cmd/Ctrl+Enter to add quickly</p>
          </section>

        </div>

        {/* ── Footer ── */}
        <div className="rdm__footer">
          <span className="rdm__footer-note">
            All dispatch records are immutably logged. Notes are visible to the incoming RTA.
          </span>
          <button className="rdm__close-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
