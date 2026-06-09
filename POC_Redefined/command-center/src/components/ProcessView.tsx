/**
 * ProcessView.tsx
 * ---------------
 * Right panel (60% of workspace) — process-centric operational map.
 *
 * 6 tabs, one per ABD process: Adherence · LOB Health · Coaching · Reports · Tickets · Handoff
 * Each tab shows:
 *  · A pressure-tile grid — LOBs as rows with colored health indicators
 *  · Expanding LOB detail on click (queue agents, status, SLA)
 *  · AI-surfaced insights for this process (count of cards, risk level)
 *  · Dispatch feed accessible from Handoff tab
 *
 * The process tabs ARE the primary navigation.
 * LOBs are secondary (rows within each process), not top-level dashboards.
 */

import { useState } from "react";
import type { CardAction, CommandCard, LOBHealth, ProcessId, ReportItem } from "../domain/types";
import { PROCESSES } from "../domain/types";
import { getActiveSorted, getPrimaryAction, primaryActionLabel, statusLabel } from "../utils/cardHelpers";
import { DispatchFeed } from "./DispatchFeed";
import { AlertDetailModal } from "./AlertDetailModal";
import { ReportDetailModal } from "./ReportDetailModal";
import type { AttendanceReportData, DispatchEntry } from "../domain/scenario_types";

// ---------------------------------------------------------------------------
// LOB health color map
// ---------------------------------------------------------------------------
const lobHealthColor: Record<LOBHealth["lineHealthCode"], string> = {
  GREEN:  "var(--ai)",
  YELLOW: "var(--medium)",
  RED:    "var(--critical)",
  BLUE:   "var(--info)",
};

const lobHealthBg: Record<LOBHealth["lineHealthCode"], string> = {
  GREEN:  "var(--ai-dim)",
  YELLOW: "var(--medium-dim)",
  RED:    "var(--critical-dim)",
  BLUE:   "var(--info-dim)",
};

// ---------------------------------------------------------------------------
// LOB tile — compact status tile per LOB
// ---------------------------------------------------------------------------

interface LOBTileProps {
  lob: LOBHealth;
  isExpanded: boolean;
  onClick: () => void;
}

function LOBTile({ lob, isExpanded, onClick }: LOBTileProps) {
  return (
    <button
      className={`lob-tile-v2${isExpanded ? " lob-tile-v2--expanded" : ""}`}
      type="button"
      onClick={onClick}
      style={{
        borderLeftColor: lobHealthColor[lob.lineHealthCode],
        background: isExpanded ? lobHealthBg[lob.lineHealthCode] : undefined,
      }}
      aria-expanded={isExpanded}
    >
      <div className="lob-tile-v2__main">
        <span className="lob-tile-v2__name">{lob.lob}</span>
        <span className="lob-tile-v2__geo">{lob.geo}</span>
      </div>
      <div className="lob-tile-v2__metrics">
        <span
          className="lob-tile-v2__health"
          style={{ color: lobHealthColor[lob.lineHealthCode] }}
        >
          {lob.lineHealthCode}
        </span>
        <span className="lob-tile-v2__sla">{lob.sla}% SLA</span>
        <span className="lob-tile-v2__holding">{lob.callsHolding} holding</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// LOB detail — expanded row showing queue agents
// ---------------------------------------------------------------------------

function LOBDetail({ lob }: { lob: LOBHealth }) {
  const longestMin = Math.floor(lob.longestCallSeconds / 60);
  const longestSec = lob.longestCallSeconds % 60;
  const longestFmt = `${String(longestMin).padStart(2, "0")}:${String(longestSec).padStart(2, "0")}`;

  const guidanceColorMap: Record<LOBHealth["lineHealthCode"], string> = {
    RED:    "var(--critical)",
    BLUE:   "var(--info)",
    YELLOW: "var(--medium)",
    GREEN:  "var(--ai)",
  };

  return (
    <div className="lob-detail-v2">
      {/* AI guidance derived from line_health_codes.json */}
      {lob.guidanceText && (
        <div
          className="lob-detail-v2__guidance"
          style={{ borderLeftColor: guidanceColorMap[lob.lineHealthCode] }}
        >
          <span className="lob-detail-v2__guidance-icon" aria-hidden="true">⚡</span>
          <span className="lob-detail-v2__guidance-text">{lob.guidanceText}</span>
        </div>
      )}
      <div className="lob-detail-v2__header">
        <span>Longest wait: {longestFmt}</span>
        <span>{lob.queueDetails.length} agents visible</span>
      </div>
      <div className="lob-detail-v2__agents">
        {lob.queueDetails.map((agent) => (
          <div key={agent.id} className="lob-detail-v2__agent-row">
            <span className="lob-detail-v2__agent-name">{agent.agentName}</span>
            <span className="lob-detail-v2__agent-status">{agent.status}</span>
            <span className="lob-detail-v2__agent-duration">
              {Math.floor(agent.durationSeconds / 60)}:{String(agent.durationSeconds % 60).padStart(2, "0")}
            </span>
            <span className="lob-detail-v2__agent-adh">
              {agent.adherenceOutPercent}% out
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Process panel — content for each tab
// ---------------------------------------------------------------------------

interface ProcessPanelProps {
  processId: ProcessId;
  cards: CommandCard[];
  lobData: LOBHealth[];
  reports: ReportItem[];
  attendanceReports: AttendanceReportData[];
  dispatchLog: DispatchEntry[];
  onAction: (action: CardAction, cardId: string) => void;
  onSelectEntry: (entry: DispatchEntry) => void;
  onSelectReport: (report: AttendanceReportData) => void;
}

function ProcessPanel({ processId, cards, lobData, reports, attendanceReports, dispatchLog, onAction, onSelectEntry, onSelectReport }: ProcessPanelProps) {
  const [expandedLob, setExpandedLob] = useState<string | null>(null);

  // Cards relevant to this process
  const process = PROCESSES.find((p) => p.id === processId)!;
  const processCards = getActiveSorted(
    cards.filter((c) => process.lanes.includes(c.lane))
  );

  // ---------- ADHERENCE ----------
  if (processId === "adherence") {
    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          {processCards.length === 0
            ? "All agents are in adherence. No action required."
            : `${processCards.length} agent${processCards.length !== 1 ? "s" : ""} out of adherence — AI has ranked them by impact.`}
        </p>
        <div className="process-panel__lob-grid">
          {lobData.map((lob) => (
            <div key={lob.lob}>
              <LOBTile
                lob={lob}
                isExpanded={expandedLob === lob.lob}
                onClick={() => setExpandedLob(expandedLob === lob.lob ? null : lob.lob)}
              />
              {expandedLob === lob.lob && <LOBDetail lob={lob} />}
            </div>
          ))}
        </div>
        <ProcessCardList cards={processCards} onAction={onAction} />
      </div>
    );
  }

  // ---------- LOB HEALTH ----------
  if (processId === "lob-health") {
    const criticalLobs = lobData.filter((l) => l.lineHealthCode === "RED" || l.lineHealthCode === "BLUE");
    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          {criticalLobs.length === 0
            ? "All LOBs are healthy. Offline activities permitted."
            : `${criticalLobs.length} LOB${criticalLobs.length !== 1 ? "s" : ""} at risk — restrict offline activities.`}
        </p>
        <div className="process-panel__lob-grid">
          {lobData.map((lob) => (
            <div key={lob.lob}>
              <LOBTile
                lob={lob}
                isExpanded={expandedLob === lob.lob}
                onClick={() => setExpandedLob(expandedLob === lob.lob ? null : lob.lob)}
              />
              {expandedLob === lob.lob && <LOBDetail lob={lob} />}
            </div>
          ))}
        </div>
        <ProcessCardList cards={processCards} onAction={onAction} />
      </div>
    );
  }

  // ---------- COACHING ----------
  if (processId === "coaching") {
    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          {processCards.length === 0
            ? "No coaching or huddle requests pending."
            : `${processCards.length} coaching decision${processCards.length !== 1 ? "s" : ""} pending your approval.`}
        </p>
        <ProcessCardList cards={processCards} onAction={onAction} />
      </div>
    );
  }

  // ---------- REPORTS ----------
  if (processId === "reports") {
    const sentReports = attendanceReports.filter((r) => r.status === "sent");

    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          AI assembles, validates and dispatches every report automatically.
          {sentReports.length > 0 && (
            <span className="process-panel__ai-count">
              {" "}{sentReports.length} report{sentReports.length !== 1 ? "s" : ""} sent this shift — click to inspect.
            </span>
          )}
        </p>

        {/* ── Sent reports ── */}
        {sentReports.length > 0 && (
          <div className="report-section">
            <p className="report-section__label">Sent this shift</p>
            {sentReports.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`sent-report-row${r.anomaly ? " sent-report-row--anomaly" : ""}`}
                onClick={() => onSelectReport(r)}
                aria-label={`Inspect ${r.cycleLabel} report`}
              >
                <div className="sent-report-row__left">
                  <span className="sent-report-row__cycle">{r.cycleLabel}</span>
                  {r.anomaly && (
                    <span className="sent-report-row__anomaly-badge">⚠ Anomaly</span>
                  )}
                </div>
                <div className="sent-report-row__metrics">
                  <span className="sent-report-row__attendance"
                    style={r.attendancePct < 75 ? { color: "var(--critical)", fontWeight: 700 } : undefined}
                  >
                    {r.attendancePct}%
                  </span>
                  <span className="sent-report-row__metric-label">attendance</span>
                  <span className="sent-report-row__noshow">{r.noShowCount} no-show{r.noShowCount !== 1 ? "s" : ""}</span>
                </div>
                <div className="sent-report-row__right">
                  <span className="sent-report-row__time">
                    {new Date(r.reportTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="sent-report-row__inspect-hint">Inspect →</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Upcoming / pending ── */}
        <div className="report-section">
          <p className="report-section__label">Upcoming</p>
          <div className="process-panel__reports">
            {reports.map((r) => (
              <div key={r.id} className={`report-row-v2 report-row-v2--${r.status}`}>
                <span className="report-row-v2__title">{r.title}</span>
                <div className="report-row-v2__right">
                  <span className="report-row-v2__status">{r.status.replace("-", " ").toUpperCase()}</span>
                  {r.dueInMinutes !== undefined && (
                    <span className="report-row-v2__due">Due in {r.dueInMinutes} min</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <ProcessCardList cards={processCards} onAction={onAction} />
      </div>
    );
  }

  // ---------- TICKETS ----------
  if (processId === "tickets") {
    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          {processCards.length === 0
            ? "No open tickets or exceptions."
            : `${processCards.length} open item${processCards.length !== 1 ? "s" : ""} — review before shift close.`}
        </p>
        <ProcessCardList cards={processCards} onAction={onAction} />
      </div>
    );
  }

  // ---------- HANDOFF ----------
  if (processId === "handoff") {
    const aiCount = dispatchLog.filter((e) => e.sentBy === "ai").length;
    return (
      <div className="process-panel">
        <p className="process-panel__insight">
          Items the AI will include in the shift handoff automatically.
          {aiCount > 0 && (
            <span className="process-panel__ai-count">
              {" "}{aiCount} sent autonomously by AI.
            </span>
          )}
        </p>
        <ProcessCardList cards={processCards} onAction={onAction} />
        <div className="process-panel__dispatch-header">
          <span>Sent this shift</span>
          <span className="process-panel__dispatch-hint">
            Click any alert to inspect the full payload
          </span>
        </div>
        <DispatchFeed entries={dispatchLog} onSelect={onSelectEntry} />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Process card list — compact, inside a process panel
// ---------------------------------------------------------------------------

function ProcessCardList({
  cards,
  onAction,
}: {
  cards: CommandCard[];
  onAction: (action: CardAction, cardId: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <div className="process-card-list">
      <p className="process-card-list__label">AI priorities in this process</p>
      {cards.map((card) => {
        const primary = getPrimaryAction(card);
        return (
          <div key={card.id} className="process-card-row">
            <div className="process-card-row__left">
              <span
                className="process-card-row__dot"
                style={{ background: card.severity === "critical" ? "var(--critical)" :
                                      card.severity === "high"     ? "var(--high)"     :
                                      card.severity === "medium"   ? "var(--medium)"   :
                                      "var(--low)" }}
              />
              <div>
                <p className="process-card-row__title">{card.title}</p>
                {card.lob && <span className="process-card-row__lob">{card.lob}</span>}
                <p className="process-card-row__status">{statusLabel(card.status)}</p>
              </div>
            </div>
            <button
              className="process-card-row__action"
              type="button"
              onClick={() => onAction(primary, card.id)}
            >
              {primaryActionLabel(card, primary)}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProcessView — main export
// ---------------------------------------------------------------------------

interface ProcessViewProps {
  cards: CommandCard[];
  lobData: LOBHealth[];
  reports: ReportItem[];
  attendanceReports: AttendanceReportData[];
  dispatchLog: DispatchEntry[];
  onAction: (action: CardAction, cardId: string) => void;
}

export function ProcessView({ cards, lobData, reports, attendanceReports, dispatchLog, onAction }: ProcessViewProps) {
  const [activeProcess, setActiveProcess]       = useState<ProcessId>("adherence");
  const [selectedEntry,  setSelectedEntry]      = useState<DispatchEntry | null>(null);
  const [selectedReport, setSelectedReport]     = useState<AttendanceReportData | null>(null);

  const dispatchCount = dispatchLog.length;

  return (
    <>
      <div className="process-view">
        {/* Tab nav */}
        <div className="process-view__tabs" role="tablist">
          {PROCESSES.map((p) => {
            const cardCount = getActiveSorted(
              cards.filter((c) => p.lanes.includes(c.lane))
            ).length;
            // For the Handoff tab, badge shows total dispatched (not card count)
            const badge = p.id === "handoff" ? dispatchCount : cardCount;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={activeProcess === p.id}
                className={`process-tab${activeProcess === p.id ? " process-tab--active" : ""}${p.id === "handoff" && dispatchCount > 0 ? " process-tab--has-dispatches" : ""}`}
                type="button"
                onClick={() => setActiveProcess(p.id)}
              >
                {p.label}
                {badge > 0 && (
                  <span className={`process-tab__badge${p.id === "handoff" ? " process-tab__badge--dispatch" : ""}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel body */}
        <div className="process-view__body">
          <ProcessPanel
            processId={activeProcess}
            cards={cards}
            lobData={lobData}
            reports={reports}
            attendanceReports={attendanceReports}
            dispatchLog={dispatchLog}
            onAction={onAction}
            onSelectEntry={setSelectedEntry}
            onSelectReport={setSelectedReport}
          />
        </div>
      </div>

      {/* Alert detail modal — rendered outside process-view to avoid stacking context */}
      {selectedEntry && (
        <AlertDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      {/* Report detail modal */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </>
  );
}
