/**
 * App.tsx — root orchestrator for the RTA Command Center
 *
 * Architecture overview:
 * ─────────────────────────────────────────────────────────────────────────
 * App.tsx is intentionally the single source of truth for all operational
 * state. This is a deliberate "wide-but-shallow" design:
 *
 *   - ALL card mutations pass through runCardAction() here.
 *   - ALL audit events are created by appendAudit() here.
 *   - ALL dispatch log entries are appended here.
 *   - Learning signals are generated here and flow down to LearningStrip.
 *
 * Why not split into smaller context providers or Zustand stores?
 *   The demo has ~15 state variables — not enough to justify added abstraction.
 *   Engineers inheriting this codebase should start here and read downward.
 *   For production, consider lifting state to a server-side event store and
 *   replacing local state with optimistic updates via React Query.
 *
 * Component layout (top → bottom, left → right):
 *   [CommandBar]       — top chrome: identity, AI status, controls, capture
 *   [ShiftStartModal]  — full-screen briefing overlay (dismissed on Start Shift)
 *   [HealthStrip]      — 5 live operational metrics
 *   [PriorityFeed]     — left 40%: AI-ranked cards with inline CopilotPanel
 *   [ProcessView]      — right 60%: 6 process tabs, LOB tiles, dispatch
 *   [LearningStrip]    — tracks RTA decisions as AI training signals
 *   [AgentActivityTicker] — bottom: live AI scan feed
 *   [CloseShiftPanel]  — modal on shift close
 *   [AutoActionToast]  — bottom-right toast fired when AI acts autonomously
 *
 * Data flow:
 *   fixtures.ts → initialCards → useState(cards) → components (read-only props)
 *   RTA action → runCardAction() → updateCard() + appendAudit() + setDispatchLog()
 *   useLiveEngine → setCards() (live demo simulation only)
 */

import { useCallback, useEffect, useRef, useState } from "react";

// Data
import { initialCards, lobHealth, reports, rtaProfile, seedAudit } from "./data/fixtures";
import { scenarios } from "./data/scenarios";
import type { ScenarioId } from "./data/scenarios";
import type { DispatchEntry } from "./domain/scenario_types";

// Domain
import type {
  AuditEvent,
  AutoAction,
  CardAction,
  CommandCard,
  DataClass,
  LearningSignal,
} from "./domain/types";

// Shared
import { formatChannel } from "./shared/channelConfig";
import { BASE_CONFIDENCE } from "./shared/constants";

// Hooks
import { useLiveEngine } from "./hooks/useLiveEngine";
import { useExtensionBridge } from "./hooks/useExtensionBridge";
import { useCaptureScheduler } from "./hooks/useCaptureScheduler";
import { CaptureConfigModal, type CaptureSystem } from "./components/CaptureConfigModal";

// Components
import { CommandBar }         from "./components/CommandBar";
import { ShiftStartModal }    from "./components/ShiftStartModal";
import { HealthStrip }        from "./components/HealthStrip";
import { PriorityFeed }       from "./components/PriorityFeed";
import { ProcessView }        from "./components/ProcessView";
import { LearningStrip }      from "./components/LearningStrip";
import { AgentActivityTicker } from "./components/AgentActivityTicker";
import { CloseShiftPanel }    from "./components/CloseShiftPanel";
import { CaptureModal }       from "./components/CaptureModal";
import { AutoActionToast }    from "./components/AutoActionToast";

// Utils
import { calculateShiftScore } from "./utils/score";

// ---------------------------------------------------------------------------
// Learning signal generator — called after every card action
// ---------------------------------------------------------------------------

/**
 * Converts an RTA card action into a structured training signal for the AI.
 * Every decision the RTA makes (approve, edit, suppress, escalate) adjusts
 * the AI's confidence for similar cards in the future.
 *
 * @param card            - The card the RTA acted on.
 * @param action          - The action the RTA chose.
 * @param existingSignals - Current signal list (used to generate a unique ID).
 * @returns               A new LearningSignal to append to the list.
 */
function buildLearningSignal(
  card: CommandCard,
  action: CardAction,
  existingSignals: LearningSignal[],
): LearningSignal {
  const decision: LearningSignal["decision"] =
    action === "approve-send" || action === "generate-report" ? "accepted" :
    action === "edit-message"                                 ? "edited"   :
    action === "suppress"                                     ? "skipped"  :
    action === "escalate-supervisor" || action === "escalate-om" ? "escalated" :
    "accepted";

  const baseConf = card.confidence ?? BASE_CONFIDENCE / 100;

  // Confidence delta per decision type:
  //   accepted  → small positive (model was right)
  //   edited    → tiny positive  (model was close)
  //   skipped   → small negative (model over-triggered)
  //   escalated → moderate positive (model under-estimated urgency)
  const delta =
    decision === "accepted"  ? 0.02 :
    decision === "edited"    ? 0.01 :
    decision === "skipped"   ? -0.01 :
    0.015;

  const confAfter = Math.min(0.99, Math.max(0.5, baseConf + delta));

  const learningNotes: Record<LearningSignal["decision"], string> = {
    accepted:  `Confirmed: "${card.title.slice(0, 40)}" → rule confidence +2%`,
    edited:    `Improved draft for "${card.title.slice(0, 36)}" → messaging updated`,
    skipped:   `Suppressed "${card.title.slice(0, 38)}" → noise filter reinforced`,
    escalated: `Escalation pattern logged for "${card.title.slice(0, 30)}" → routing updated`,
  };

  return {
    id:              `signal-${Date.now()}-${existingSignals.length}`,
    timestamp:       new Date().toISOString(),
    decision,
    cardTitle:       card.title,
    processId:       card.processId ?? "adherence",
    confidenceBefore: baseConf,
    confidenceAfter:  confAfter,
    learningNote:     learningNotes[decision],
  };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const idCounter = useRef(0);

  // -- Shift lifecycle -------------------------------------------------------
  const [shiftStarted,     setShiftStarted]    = useState(false);
  const [shiftClosed,      setShiftClosed]     = useState(false);
  const [briefingOpen,     setBriefingOpen]    = useState(true);
  const [closePanelOpen,   setClosePanelOpen]  = useState(false);
  const [captureModalOpen, setCaptureModalOpen] = useState(false);
  // Capture Data hub: source + cadence (override + transparency live in the modal).
  const [captureConfigOpen, setCaptureConfigOpen] = useState(false);
  const [captureSystem, setCaptureSystem] = useState<CaptureSystem>("verint");
  const [captureFrequency, setCaptureFrequency] = useState<number | null>(null);
  const [aiStatus, setAiStatus] = useState<"Idle" | "Watching" | "Needs Review" | "Generating Report" | "Autonomous">("Idle");

  // -- Cards and selection ---------------------------------------------------
  const [cards,        setCards]        = useState<CommandCard[]>(initialCards);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [liveDemo,     setLiveDemo]     = useState(false);

  // -- Autonomous AI mode ----------------------------------------------------
  const [autoMode,        setAutoMode]        = useState(false);
  const [autoSentCount,   setAutoSentCount]   = useState(0);
  const [lastAutoAction,  setLastAutoAction]  = useState<AutoAction | null>(null);

  // -- Scenario --------------------------------------------------------------
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>("A");
  const activeScenario = scenarios[activeScenarioId];

  // -- Audit + reporting -----------------------------------------------------
  // globalAudit accumulates every action for the export.ts audit CSV.
  // The leading underscore signals it is collected but not yet rendered —
  // wire it to exportAuditCsv() in CloseShiftPanel to activate the export.
  const [_globalAudit,      setGlobalAudit]      = useState<AuditEvent[]>(seedAudit);
  const [aiReportGenerated, setAiReportGenerated] = useState(false);
  const [handoffGenerated,  setHandoffGenerated]  = useState(false);
  const [dispatchLog,       setDispatchLog]       = useState<DispatchEntry[]>(
    () => scenarios["A"].reports.dispatchLog,
  );

  // -- Learning signals — grows as the RTA makes decisions ------------------
  const [learningSignals, setLearningSignals] = useState<LearningSignal[]>([]);

  // Count of cards fully accepted by the RTA (no editing needed) — shown in HealthStrip.
  const aiHandledCount = learningSignals.filter((s) => s.decision === "accepted").length;

  // ---------------------------------------------------------------------------
  // Autonomous mode handler — called by useLiveEngine when AI acts on a card
  // ---------------------------------------------------------------------------

  const handleAutoAction = useCallback((cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const channelLabel = formatChannel(card.selectedChannel ?? "google-chat-lob");

    runCardAction("approve-send", cardId, "ai");

    setAutoSentCount((n) => n + 1);
    setLastAutoAction({
      id:       `auto-${Date.now()}`,
      title:    card.title,
      channel:  channelLabel,
      lob:      card.lob ?? "—",
      severity: card.severity,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // Sync aiStatus with autoMode and shift state.
  useEffect(() => {
    if (autoMode && shiftStarted)              setAiStatus("Autonomous");
    else if (!autoMode && shiftStarted && !shiftClosed) setAiStatus("Watching");
  }, [autoMode, shiftStarted, shiftClosed]);

  // -- Live demo engine ------------------------------------------------------
  const { agentLog, newCardIds, captureRunning, setAgentLog, startCapture } = useLiveEngine({
    liveDemo,
    autoMode,
    shiftStarted,
    activeScenario,
    cards,
    setCards,
    onAutoAction: handleAutoAction,
  });

  // Live cards pushed by the RTA Live Bridge browser extension (Verint -> here).
  // Inert unless the extension posts; replaces the feed with real captured cards
  // and flips on a "LIVE" banner so it's obvious the data is real.
  const [liveBridgeActive, setLiveBridgeActive] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  useExtensionBridge((liveCards, syncedAt) => {
    setCards(liveCards);
    setLiveBridgeActive(true);
    setLastSynced(syncedAt ?? new Date().toISOString());
  });

  // --- Capture Data hub: trigger logic (auto on frequency + manual override) ---
  const postToExtension = useCallback((kind: string, extra: Record<string, unknown> = {}) => {
    window.postMessage({ __rtaLiveBridge: true, kind, ...extra }, window.location.origin);
  }, []);

  // Scheduled / quiet tick: real source posts to the extension; simulated runs the demo capture.
  const triggerCaptureTick = useCallback(() => {
    if (captureSystem === "verint") postToExtension("trigger-capture");
    else startCapture();
  }, [captureSystem, postToExtension, startCapture]);

  useCaptureScheduler(captureFrequency, triggerCaptureTick);

  // Manual "Sync now": Verint posts to the extension; simulated shows the scan animation.
  const handleSyncNow = useCallback(() => {
    if (captureSystem === "verint") {
      postToExtension("trigger-capture");
    } else {
      setCaptureConfigOpen(false);
      setCaptureModalOpen(true); // existing CaptureModal → onComplete → startCapture()
    }
  }, [captureSystem, postToExtension]);

  const changeFrequency = useCallback((n: number | null) => {
    setCaptureFrequency(n);
    postToExtension("set-frequency", { seconds: n ?? 0 });
  }, [postToExtension]);

  // Re-seed cards and dispatch log when scenario changes.
  useEffect(() => {
    setCards(activeScenario.cards);
    setDispatchLog(activeScenario.reports.dispatchLog);
    setFocusedCardId(null);
  }, [activeScenarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function nextId(prefix: string): string {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  }

  function appendAudit(
    actor: AuditEvent["actor"],
    action: string,
    detail: string,
    dataClass: DataClass = "simulated",
  ): AuditEvent {
    const event: AuditEvent = {
      id: nextId("audit"),
      timestamp: new Date().toISOString(),
      actor, action, detail, dataClass,
    };
    setGlobalAudit((prev) => [event, ...prev]);
    return event;
  }

  function updateCard(cardId: string, updater: (c: CommandCard) => CommandCard): void {
    setCards((prev) => prev.map((c) => (c.id === cardId ? updater(c) : c)));
  }

  /**
   * Maps a CardAction to the resulting CardStatus.
   * This is the single place that defines what happens to a card after an action.
   */
  function resolveStatus(action: CardAction): CommandCard["status"] {
    switch (action) {
      case "approve-send":
      case "generate-report":              return "sent";
      case "suppress":                     return "suppressed";
      case "escalate-supervisor":
      case "escalate-om":
      case "create-servicenow-follow-up":  return "escalated";
      case "mark-resolved":                return "resolved";
      case "add-to-handoff":              return "added-to-handoff";
      default:                            return "needs-review";
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function startShift(): void {
    setShiftStarted(true);
    setShiftClosed(false);
    setAiStatus("Watching");
    setBriefingOpen(false);
    setAgentLog([
      "[AI] Watch mode active — monitoring 248 agents across 6 LOBs",
      "[AI] Rules engine loaded — 6 active thresholds",
      "Shift started",
    ]);
    appendAudit("rta", "Start Shift",    "RTA opened the shift from the briefing modal.", "simulated");
    appendAudit("ai",  "Watch mode enabled", "AI agent loaded scenario data and started monitoring.", "simulated");
  }

  /**
   * Executes an action on a card.
   * This is the single mutation point for all card state changes:
   *   1. Creates an audit event.
   *   2. Updates the card's status.
   *   3. Appends a dispatch log entry (if applicable).
   *   4. Generates a learning signal.
   *   5. Clears focus if the card reached a terminal state.
   *
   * @param action - The action to execute.
   * @param cardId - The ID of the card to act on.
   * @param sentBy - Whether this was triggered by the RTA or autonomous AI.
   */
  function runCardAction(action: CardAction, cardId: string, sentBy: "rta" | "ai" = "rta"): void {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const audit = appendAudit(
      action === "approve-send" || action === "generate-report" ? "ai" : "rta",
      action === "approve-send" ? "Send alert" : action,
      `${action} on "${card.title}".`,
      card.dataClass,
    );

    const nextStatus = resolveStatus(action);

    updateCard(card.id, (c) => ({
      ...c,
      status:     nextStatus,
      auditEvents: [audit, ...c.auditEvents],
    }));

    const signal = buildLearningSignal(card, action, learningSignals);
    setLearningSignals((prev) => [...prev, signal]);

    // Dispatch log on "Send alert"
    if (action === "approve-send") {
      const entry: DispatchEntry = {
        id:             `dispatch-${Date.now()}`,
        timestamp:      new Date().toISOString(),
        cycle:          dispatchLog.length + 1,
        agent:          card.agent?.name ?? card.title,
        lob:            card.lob ?? "—",
        channel:        card.selectedChannel ?? "audit-only",
        message:        card.draftMessage ?? `Alert sent for ${card.title}.`,
        escalationLevel: "first-alert",
        status:         "sent",
        sentBy,
      };
      setDispatchLog((prev) => [...prev, entry]);
    }

    // Dispatch log on escalation
    if (action === "escalate-supervisor" || action === "escalate-om") {
      const escalationTarget = action === "escalate-om" ? "om" : "supervisor";
      const escalationLabel  = action === "escalate-om" ? "Operations Manager" : "Supervisor";
      const reason =
        card.aiRecommendation?.trim()
          ? card.aiRecommendation.slice(0, 120)
          : `Situation requires ${escalationLabel} judgement — AI confidence below action threshold.`;

      const entry: DispatchEntry = {
        id:             `dispatch-${Date.now()}`,
        timestamp:      new Date().toISOString(),
        cycle:          dispatchLog.length + 1,
        agent:          card.agent?.name ?? card.title,
        lob:            card.lob ?? "—",
        channel:        escalationTarget,
        message:        `[Escalated to ${escalationLabel}] ${card.title} — ${reason}`,
        escalationLevel: escalationTarget,
        status:         "escalated",
        sentBy:         "rta",
        escalationReason: reason,
        outageEscalationRules: card.escalationRules,
      };
      setDispatchLog((prev) => [...prev, entry]);
    }

    if (action === "generate-report" && card.id === "card-ai-report") {
      setAiStatus("Generating Report");
      setAiReportGenerated(true);
      window.setTimeout(() => setAiStatus("Watching"), 900);
    }

    if (action === "add-to-handoff") setHandoffGenerated(true);

    const terminalStatuses: CommandCard["status"][] = [
      "sent", "suppressed", "resolved", "escalated", "added-to-handoff",
    ];
    if (terminalStatuses.includes(nextStatus) && focusedCardId === cardId) {
      setFocusedCardId(null);
    }
  }

  function closeShift(): void {
    setClosePanelOpen(true);
    setHandoffGenerated(true);
    setShiftClosed(true);
    setAiStatus("Idle");
    setLiveDemo(false);
    appendAudit("rta", "Close Shift", "Shift close checklist generated.", "simulated");
  }

  const shiftScore = calculateShiftScore(cards, aiReportGenerated, handoffGenerated);

  // Computed: is there an active tech outage? (drives the outage banner in CommandBar + HealthStrip)
  const isOutageActive = cards.some(
    (c) => c.type === "exception" && c.rule?.id === "tech_cluster_detection" && !["resolved", "sent"].includes(c.status),
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="app-shell">

      {/* Shift briefing modal — shown on load, dismissed by "Start Shift" */}
      {briefingOpen && !shiftStarted && (
        <ShiftStartModal
          onStart={startShift}
          rtaFirstName={rtaProfile.name.split(" ")[0]}
        />
      )}

      {/* Re-openable briefing (pre-shift review after shift has started) */}
      {briefingOpen && shiftStarted && (
        <div className="briefing-reopen-backdrop" onClick={() => setBriefingOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ShiftStartModal
              onStart={() => setBriefingOpen(false)}
              rtaFirstName={rtaProfile.name.split(" ")[0]}
            />
          </div>
        </div>
      )}

      <CommandBar
        profile={rtaProfile}
        shiftStarted={shiftStarted}
        shiftClosed={shiftClosed}
        aiStatus={aiStatus}
        liveDemo={liveDemo}
        autoMode={autoMode}
        autoSentCount={autoSentCount}
        captureRunning={captureRunning}
        activeScenarioId={activeScenarioId}
        isOutageActive={isOutageActive}
        onStart={startShift}
        onClose={closeShift}
        onToggleLiveDemo={() => setLiveDemo((v) => !v)}
        onToggleAutoMode={() => setAutoMode((v) => !v)}
        onCapture={() => setCaptureConfigOpen(true)}
        onOpenBriefing={() => setBriefingOpen(true)}
        onScenarioChange={(id) => setActiveScenarioId(id)}
      />

      {liveBridgeActive && (
        <div
          data-testid="live-bridge-banner"
          style={{
            background: "#c0392b",
            color: "#fff",
            padding: "6px 16px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <style>{"@keyframes rtaPulse{0%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.6)}100%{opacity:1;transform:scale(1)}}"}</style>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#fff",
              display: "inline-block",
              animation: "rtaPulse 1.6s ease-in-out infinite",
            }}
          />
          <span>LIVE — captured from Verint via the RTA Live Bridge extension (evidence-backed)</span>
          {lastSynced && (
            <span
              key={lastSynced}
              data-testid="live-bridge-synced"
              style={{
                marginLeft: "auto",
                fontWeight: 400,
                fontSize: 12,
                animation: "rtaPulse 0.6s ease-in-out",
              }}
            >
              last synced {new Date(lastSynced).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <HealthStrip
        cards={cards}
        lobData={lobHealth}
        aiHandledCount={aiHandledCount}
        autoMode={autoMode}
        autoSentCount={autoSentCount}
        isOutageActive={isOutageActive}
      />

      <div className="workspace">
        <div className="workspace__left">
          <PriorityFeed
            cards={cards}
            newCardIds={newCardIds}
            focusedCardId={focusedCardId}
            onAction={(action, cardId) => runCardAction(action, cardId)}
            onFocus={(cardId) => setFocusedCardId(cardId)}
            onShowBoard={() => {/* future: full kanban toggle */}}
          />
        </div>

        <div className="workspace__right">
          <ProcessView
            cards={cards}
            lobData={lobHealth}
            reports={reports}
            attendanceReports={activeScenario.reports.attendanceReports}
            dispatchLog={dispatchLog}
            onAction={(action, cardId) => runCardAction(action, cardId)}
          />
        </div>
      </div>

      <LearningStrip
        signals={learningSignals}
        baseConfidence={BASE_CONFIDENCE}
      />

      <AgentActivityTicker log={agentLog} liveDemo={liveDemo} />

      {captureConfigOpen && (
        <CaptureConfigModal
          system={captureSystem}
          setSystem={setCaptureSystem}
          frequency={captureFrequency}
          setFrequency={changeFrequency}
          lastSynced={lastSynced}
          live={liveBridgeActive}
          onSyncNow={handleSyncNow}
          onClose={() => setCaptureConfigOpen(false)}
        />
      )}

      {captureModalOpen && (
        <CaptureModal
          onComplete={(count) => {
            setCaptureModalOpen(false);
            startCapture();
            setAgentLog((prev) =>
              [`[AI] Capture complete — ${count} exceptions extracted from Verint`, ...prev].slice(0, 20),
            );
          }}
          onCancel={() => setCaptureModalOpen(false)}
        />
      )}

      {closePanelOpen && (
        <CloseShiftPanel
          cards={cards}
          shiftScore={shiftScore}
          aiReportGenerated={aiReportGenerated}
          handoffGenerated={handoffGenerated}
          onClose={() => setClosePanelOpen(false)}
        />
      )}

      {lastAutoAction && (
        <AutoActionToast
          key={lastAutoAction.id}
          action={lastAutoAction}
        />
      )}

    </main>
  );
}

export default App;
