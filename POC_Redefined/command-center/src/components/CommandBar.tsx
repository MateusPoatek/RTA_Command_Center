/**
 * CommandBar.tsx
 * --------------
 * Top chrome bar replacing the old ShiftBar + ScenarioPicker.
 * Single fixed row with all shift controls and the AI Capture trigger.
 *
 * Left:   Shift identity (RTA name, shift time, assigned LOBs)
 * Center: AI health indicator + scenario picker
 * Right:  Auto mode · Live demo · Capture Verint · Shift brief · Start/Close shift
 *
 * Auto mode button:
 *   OFF → ghost "Auto mode"
 *   ON  → pulsing green "AUTO · N sent" (animated border, green background)
 */

import type { RTAProfile } from "../domain/types";
import type { ScenarioId } from "../data/scenarios";
import { scenarios } from "../data/scenarios";

interface CommandBarProps {
  profile: RTAProfile;
  shiftStarted: boolean;
  shiftClosed: boolean;
  aiStatus: "Idle" | "Watching" | "Needs Review" | "Generating Report" | "Autonomous";
  liveDemo: boolean;
  autoMode: boolean;
  autoSentCount: number;
  captureRunning: boolean;
  activeScenarioId: ScenarioId;
  isOutageActive?: boolean;
  hasReport?: boolean;
  onStart: () => void;
  onClose: () => void;
  onToggleLiveDemo: () => void;
  onToggleAutoMode: () => void;
  onCapture: () => void;
  onOpenBriefing: () => void;
  onScenarioChange: (id: ScenarioId) => void;
  onGenerateReport?: () => void;
}

const aiStatusColor: Record<string, string> = {
  Idle:               "var(--text-muted)",
  Watching:           "var(--ai)",
  "Needs Review":     "var(--high)",
  "Generating Report":"var(--info)",
  Autonomous:         "var(--ai)",
  Incident:           "var(--critical)",
};

export function CommandBar({
  profile,
  shiftStarted,
  shiftClosed,
  aiStatus,
  liveDemo,
  autoMode,
  autoSentCount,
  captureRunning,
  activeScenarioId,
  isOutageActive,
  hasReport,
  onStart,
  onClose,
  onToggleLiveDemo,
  onToggleAutoMode,
  onCapture,
  onOpenBriefing,
  onScenarioChange,
  onGenerateReport,
}: CommandBarProps) {
  // Effective status: override to "Incident" when outage is detected
  const effectiveStatus = isOutageActive ? "Incident" : (autoMode ? "Autonomous" : aiStatus);

  return (
    <header className="command-bar">

      {/* Left — shift identity */}
      <div className="command-bar__identity">
        <div className="command-bar__name-row">
          <span className="command-bar__name">{profile.name}</span>
          <span className="command-bar__shift">{profile.shift}</span>
        </div>
        <div className="command-bar__lobs">
          {profile.assignedLOBs.slice(0, 4).map((lob) => (
            <span key={lob} className="command-bar__lob-chip">{lob}</span>
          ))}
          {profile.assignedLOBs.length > 4 && (
            <span className="command-bar__lob-chip">+{profile.assignedLOBs.length - 4}</span>
          )}
        </div>
      </div>

      {/* Center — AI status + scenario */}
      <div className="command-bar__center">
        <div className="command-bar__ai-status">
          <span
            className={`command-bar__ai-dot${autoMode && !isOutageActive ? " command-bar__ai-dot--autonomous" : ""}${isOutageActive ? " command-bar__ai-dot--incident" : ""}`}
            style={{ background: aiStatusColor[effectiveStatus] }}
          />
          <span
            className="command-bar__ai-label"
            style={isOutageActive ? { color: "var(--critical)", fontWeight: 700 } : undefined}
          >
            {effectiveStatus}
          </span>
        </div>

        <span className="command-bar__divider" />

        <select
          className="command-bar__scenario-select"
          value={activeScenarioId}
          onChange={(e) => onScenarioChange(e.target.value as ScenarioId)}
          aria-label="Demo scenario"
        >
          {(Object.keys(scenarios) as ScenarioId[]).map((id) => (
            <option key={id} value={id}>
              {scenarios[id].label}
            </option>
          ))}
        </select>
      </div>

      {/* Right — action controls */}
      <div className="command-bar__actions">

        {/* Shift brief (re-open modal) */}
        {shiftStarted && (
          <button
            className="command-bar__btn command-bar__btn--ghost"
            type="button"
            onClick={onOpenBriefing}
            title="Re-open shift briefing"
          >
            Shift brief
          </button>
        )}

        {/* Live demo toggle */}
        {shiftStarted && !shiftClosed && (
          <button
            className={`command-bar__btn ${liveDemo ? "command-bar__btn--live-on" : "command-bar__btn--ghost"}`}
            type="button"
            onClick={onToggleLiveDemo}
            title={liveDemo ? "Stop live simulation" : "Start live simulation"}
          >
            {liveDemo ? "Live — ON" : "Live demo"}
          </button>
        )}

        {/* Autonomous AI mode toggle — the WOW button */}
        {shiftStarted && !shiftClosed && (
          <button
            className={`command-bar__btn ${autoMode ? "command-bar__btn--auto-on" : "command-bar__btn--auto-off"}`}
            type="button"
            onClick={onToggleAutoMode}
            title={autoMode ? "Disable autonomous AI mode" : "Enable autonomous AI mode — AI will act without RTA clicks"}
            aria-pressed={autoMode}
          >
            {autoMode
              ? `AUTO · ${autoSentCount} sent`
              : "Auto mode"}
          </button>
        )}

        {/* AI Capture */}
        {shiftStarted && !shiftClosed && (
          <button
            className={`command-bar__btn command-bar__btn--capture ${captureRunning ? "command-bar__btn--capturing" : ""}`}
            type="button"
            onClick={onCapture}
            disabled={captureRunning}
            title="Configure data capture (system · method · frequency) + sync now"
          >
            {captureRunning ? "Scanning..." : "Capture Data"}
          </button>
        )}

        {/* Generate GTT × Verint Report */}
        {shiftStarted && !shiftClosed && onGenerateReport && (
          <button
            className="command-bar__btn command-bar__btn--capture"
            type="button"
            onClick={onGenerateReport}
            title="Generate GTT × Verint reconciliation report"
            style={hasReport ? { borderColor: "var(--ai)", color: "var(--ai)" } : undefined}
          >
            {hasReport ? "Report ✓" : "Report"}
          </button>
        )}

        {/* Shift start / close */}
        {!shiftStarted ? (
          <button
            className="command-bar__btn command-bar__btn--primary"
            type="button"
            onClick={onStart}
          >
            Start shift
          </button>
        ) : !shiftClosed ? (
          <button
            className="command-bar__btn command-bar__btn--danger"
            type="button"
            onClick={onClose}
          >
            Close shift
          </button>
        ) : (
          <span className="command-bar__closed-badge">Shift closed</span>
        )}

      </div>
    </header>
  );
}
