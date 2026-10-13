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
  AccountId,
  AuditEvent,
  AutoAction,
  CardAction,
  CommandCard,
  DataClass,
  LearningSignal,
  ReconciliationReport,
  ReportConfig,
  ReportHistoryEntry,
} from "./domain/types";
import { ACCOUNTS, isAccountCard } from "./domain/types";
import { defaultReportConfigFor, ACCOUNT_CATALOG } from "./domain/accounts";

// Shared
import { formatChannel } from "./shared/channelConfig";
import { BASE_CONFIDENCE } from "./shared/constants";

// Hooks
import { useLiveEngine } from "./hooks/useLiveEngine";
import { useExtensionBridge } from "./hooks/useExtensionBridge";
import type { VerintRosterRow } from "./hooks/useExtensionBridge";
import { useCaptureScheduler } from "./hooks/useCaptureScheduler";
import { useReportScheduler } from "./hooks/useReportScheduler";
import { CaptureConfigModal, type CaptureSystem } from "./components/CaptureConfigModal";
import { ReportConfigPanel, saveHistoryEntry, loadReportConfig } from "./components/ReportConfigPanel";

// Components
import { CommandBar }         from "./components/CommandBar";
import { ShiftStartModal }    from "./components/ShiftStartModal";
import { HealthStrip }        from "./components/HealthStrip";
import { PriorityFeed }       from "./components/PriorityFeed";
import { FloorView }          from "./components/FloorView";
import { Board }              from "./components/Board";
import type { BoardState }    from "./components/Board";
import { ProcessView }        from "./components/ProcessView";
import { LearningStrip }      from "./components/LearningStrip";
import { AgentActivityTicker } from "./components/AgentActivityTicker";
import { CloseShiftPanel }    from "./components/CloseShiftPanel";
import { CaptureModal }       from "./components/CaptureModal";
import { AutoActionToast }    from "./components/AutoActionToast";

// Utils
import { calculateShiftScore } from "./utils/score";
import { buildGChatAlertBatchCard, buildChatDigestCard } from "./utils/dispatchHelpers";
import { buildAdherenceSummary } from "./utils/adherenceSummary";

// A single dispatch batch never exceeds this many alerts, even if more are
// queued — flushBatch() splits a large queue into several same-size-or-smaller
// batches (each its own cycle number) instead of one unbounded burst.
const MAX_BATCH_SIZE = 25;

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

  // -- Active account (per-account dedicated area) ----------------------------
  // The extension tags live-captured cards' `lob` with the account name
  // ("EPIC" | "ZILLOW" | "CORELOGIC"). Everything rendered — Priority Feed,
  // Floor View, dispatch history — is filtered to the active account so an
  // RTA working one account never sees another account's alerts mixed in.
  // Demo/scenario cards use `lob` for sub-queue names instead (see
  // isAccountCard below) and are unaffected by this filter.
  const [activeAccount, setActiveAccount] = useState<AccountId>(() => {
    const saved = localStorage.getItem("rta.activeAccount");
    return (ACCOUNTS as readonly string[]).includes(saved ?? "") ? (saved as AccountId) : ACCOUNTS[0];
  });
  useEffect(() => {
    localStorage.setItem("rta.activeAccount", activeAccount);
  }, [activeAccount]);

  // -- Alert dispatch batching (COPC) -----------------------------------------
  // "approve-send" no longer dispatches instantly — it queues the card
  // (status "ready-to-send") and flushBatch() below releases everything
  // queued, in one go, on a configurable interval (default 15 min). This is
  // what keeps GChat/Teams from getting one message per agent per violation.
  const [batchIntervalMinutes, setBatchIntervalMinutes] = useState<number>(() => {
    const saved = Number(localStorage.getItem("rta.batchIntervalMinutes"));
    return saved > 0 ? saved : 15;
  });
  useEffect(() => {
    localStorage.setItem("rta.batchIntervalMinutes", String(batchIntervalMinutes));
  }, [batchIntervalMinutes]);
  const [lastBatchAt, setLastBatchAt] = useState<number>(() => Date.now());
  const [secondsUntilNextBatch, setSecondsUntilNextBatch] = useState<number>(batchIntervalMinutes * 60);
  const batchSeqRef = useRef(0); // -> DispatchEntry.cycle, shared by every alert in one flush
  const pendingSentByRef = useRef<Map<string, "rta" | "ai">>(new Map()); // cardId -> who approved it, until flush

  // -- Per-shift dedup ("up to speed") -----------------------------------------
  // A recapture can re-surface the same underlying violation (new raw card id)
  // before it's resolved server-side. Once a violation has been acted on this
  // shift, it must not resurrect as a fresh "needs-review" card.
  const actionedKeysRef = useRef<Set<string>>(new Set());
  function cardIdentityKey(c: CommandCard): string {
    return `${c.lob ?? "—"}:${c.rule?.id ?? c.title}:${c.agent?.id ?? c.agent?.name ?? c.id}`;
  }

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

  // -- GTT × Verint reconciliation report -----------------------------------
  // Every piece of report state here is scoped to activeAccount — a shared
  // slot was the root of the account-mixing bug (switching EPIC → CORELOGIC
  // kept showing EPIC's report, roster, and functionalArea/sites config).
  const [reportPayload,    setReportPayload]    = useState<ReconciliationReport | null>(null);
  const [reportConfigOpen, setReportConfigOpen] = useState(false);
  const [reportConfig,     setReportConfig]     = useState<ReportConfig>(() => loadReportConfig(activeAccount, defaultReportConfigFor(activeAccount)));
  // Today's generations (manual + scheduled), for the GTT-vs-Verint totals
  // chart. Resets when the calendar day rolls over — no multi-day history.
  const [reportSnapshotsToday, setReportSnapshotsToday] = useState<ReportHistoryEntry[]>([]);
  const snapshotsDayRef = useRef<string>(new Date().toISOString().slice(0, 10));

  // Walk back up to 3 days to find the most recent report for THIS account.
  const fetchLatestReport = useCallback(async (account: AccountId): Promise<ReconciliationReport | null> => {
    for (let daysBack = 0; daysBack < 4; daysBack++) {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      const dateStr = d.toISOString().slice(0, 10);
      try {
        const r = await fetch(`/runs/reports/reconciliation_${account}_${dateStr}.json`);
        if (r.ok) {
          const data: ReconciliationReport = await r.json();
          setReportPayload(data);
          return data;
        }
      } catch (e) {
        console.warn('[report] fetch error:', e);
      }
    }
    console.warn(`[report] no report found for ${account} in the last 4 days`);
    setReportPayload(null);
    return null;
  }, []);

  // Appends a fresh generation to today's snapshot series (manual + scheduled
  // both funnel through here); resets the series on a calendar-day rollover
  // since the chart is "today only" by design.
  const appendReportSnapshot = useCallback((report: ReconciliationReport) => {
    const today = new Date().toISOString().slice(0, 10);
    if (snapshotsDayRef.current !== today) {
      snapshotsDayRef.current = today;
      setReportSnapshotsToday([]);
    }
    const entry: ReportHistoryEntry = {
      date: report.date,
      gtt_total: report.gtt_total,
      verint_total: report.verint_total,
      matched: report.matched,
      discrepancy_count: report.discrepancy_count,
      intelligence: report.intelligence,
      generated_at: report.generated_at,
    };
    setReportSnapshotsToday((prev) => [...prev, entry]);
  }, []);

  // The Verint rows to send with the next report generation always come from
  // the latest bridge push — a ref (populated below, once verintRoster
  // exists) avoids a stale closure in the scheduler's setTimeout chain.
  const verintRosterRef = useRef<VerintRosterRow[]>([]);

  // Shared by the manual "Generate Report" button and the scheduler: POST to
  // the local API, load the result back, and record it in today's series.
  // Always generates for whichever account is CURRENTLY active — reads
  // activeAccount fresh via a ref (see below) so a scheduled generation
  // queued before an account switch still targets the right account.
  const activeAccountRef = useRef<AccountId>(activeAccount);
  useEffect(() => { activeAccountRef.current = activeAccount; }, [activeAccount]);

  const generateReport = useCallback(async () => {
    const account = activeAccountRef.current;
    const today = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: today,
          account,
          source: reportConfig.source,
          functional_area: reportConfig.functionalArea,
          sites: reportConfig.sites,
          verint_rows: verintRosterRef.current,
        }),
      });
      if (res.ok) {
        const report = await fetchLatestReport(account);
        if (report) appendReportSnapshot(report);
        return;
      }
    } catch {/* API not running — fall through to disk load */}
    const report = await fetchLatestReport(account);
    if (report) appendReportSnapshot(report);
  }, [reportConfig.source, reportConfig.functionalArea, reportConfig.sites, fetchLatestReport, appendReportSnapshot]);


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
    activeAccount,
  });

  // Live cards pushed by the RTA Live Bridge browser extension (Verint -> here).
  // Inert unless the extension posts; replaces the feed with real captured cards
  // and flips on a "LIVE" banner so it's obvious the data is real.
  const [liveBridgeActive, setLiveBridgeActive] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  // Persisted per-account (a shared key was part of the account-mixing bug —
  // switching accounts kept the PREVIOUS account's roster in memory and sent
  // it as verint_rows for the new account's report) so a page reload (or a
  // dev-server HMR full-reload) doesn't silently wipe the captured roster
  // and make the next "Report" click send verint_rows: [] either.
  const verintRosterKey = (account: AccountId) => `rta.verintRoster.${account}`;
  const [verintRoster, setVerintRoster] = useState<VerintRosterRow[]>(() => {
    try {
      const saved = localStorage.getItem(verintRosterKey(activeAccount));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      if (verintRoster.length > 0) {
        localStorage.setItem(verintRosterKey(activeAccount), JSON.stringify(verintRoster));
      }
    } catch {
      /* localStorage full/unavailable — roster still works for this session */
    }
  }, [verintRoster, activeAccount]);
  useEffect(() => { verintRosterRef.current = verintRoster; }, [verintRoster]);
  // Which surface fills the left panel: the priority feed, or the spatial Floor View.
  const [mainView, setMainView] = useState<"priority-feed" | "floor" | "board">("priority-feed");
  const [boardState, setBoardState] = useState<BoardState>({});
  useExtensionBridge((liveCards, syncedAt, roster) => {
    // Merge instead of blind-replace: a violation already actioned this shift
    // (sent/queued/suppressed/etc.) must not resurrect as "needs-review" just
    // because a recapture still sees it, even under a new raw card id.
    setCards((prevCards) => {
      const prevByKey = new Map(prevCards.map((c) => [cardIdentityKey(c), c]));
      return liveCards.map((incoming) => {
        const key = cardIdentityKey(incoming);
        if (actionedKeysRef.current.has(key)) {
          return prevByKey.get(key) ?? incoming;
        }
        return incoming;
      });
    });
    setLiveBridgeActive(true);
    setLastSynced(syncedAt ?? new Date().toISOString());
    if (roster.length > 0) setVerintRoster(roster);
  });

  // Heartbeat: tick once a second so the banner shows a LIVING "synced Ns ago"
  // that resets on each push and visibly goes quiet if pushes stop — the bridge
  // isn't truly "LIVE" forever once it connected.
  const [heartbeatNow, setHeartbeatNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveBridgeActive) return;
    const id = setInterval(() => setHeartbeatNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveBridgeActive]);
  const lastSyncAgoSec =
    lastSynced != null ? Math.max(0, Math.round((heartbeatNow - Date.parse(lastSynced)) / 1000)) : null;
  const liveFresh = lastSyncAgoSec != null && lastSyncAgoSec < 90; // heartbeat alarm is ~1 min

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

  // Scheduled report trigger: ask the extension for a fresh Full Capture
  // first (per Mateus — GTT's total grows through the day as more agents
  // clock in, so Verint's roster needs to be re-pulled or the two totals
  // just drift apart), force a push once it's had time to run, then generate.
  const generateScheduledReport = useCallback(() => {
    postToExtension("run-full-capture");
    window.setTimeout(() => {
      postToExtension("push-now"); // guarantee delivery regardless of autoPush
      window.setTimeout(() => { generateReport(); }, 2000);
    }, 20_000); // Full Capture "only lasts seconds" per popup.js — generous margin
  }, [postToExtension, generateReport]);

  useReportScheduler(reportConfig.schedule, generateScheduledReport);

  // Attendance + Adherence digest to Google Chat — independent of the report
  // GENERATION schedule above; this just formats+sends whatever Attendance
  // report and live Adherence state already exist right now. Manual trigger
  // (Report Config's "Send Now" button) reuses this same function.
  const sendChatDigest = useCallback(() => {
    const accountCards = cards.filter((c) => !isAccountCard(c.lob) || c.lob === activeAccount);
    const adherence = buildAdherenceSummary(accountCards);
    const label = ACCOUNT_CATALOG[activeAccount]?.label ?? activeAccount;
    const card = buildChatDigestCard(reportPayload, adherence, label);
    fetch("/api/dispatch-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: activeAccount, card }),
    })
      .then((res) => res.json())
      .then((data) => { if (!data.ok) console.warn(`[chat-digest] ${data.error}`); })
      .catch((e) => console.warn("[chat-digest] request failed", e));
  }, [cards, activeAccount, reportPayload]);

  // Reuses the same generic "fire every N seconds" hook as the capture
  // frequency timer above — 30 minutes is a fixed cadence for now, not a
  // user-configurable interval (nothing asked for one yet).
  useCaptureScheduler(reportConfig.chatDigestEnabled ? 1800 : null, sendChatDigest);

  // Account switch: reload every account-scoped slot instead of leaving the
  // PREVIOUS account's report/config/roster sitting in shared state, and
  // tell the extension to switch its capture LOB so it stays in lockstep
  // with the Command Center (the two were previously two independent,
  // unsynchronized pieces of state).
  useEffect(() => {
    postToExtension("set-lob", { lob: activeAccount });
    setReportConfig(loadReportConfig(activeAccount, defaultReportConfigFor(activeAccount)));
    setVerintRoster(() => {
      try {
        const saved = localStorage.getItem(verintRosterKey(activeAccount));
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    });
    setReportPayload(null);
    setReportSnapshotsToday([]);
    fetchLatestReport(activeAccount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount]);

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
   *
   * "approve-send" resolves to "ready-to-send", not "sent" — the alert is
   * queued for the next dispatch batch (see flushBatch), which is what
   * actually creates the DispatchEntry and moves it to "sent". Only
   * "generate-report" (the Report tab's own action, unrelated to GChat/Teams
   * dispatch) still resolves straight to "sent".
   */
  function resolveStatus(action: CardAction): CommandCard["status"] {
    switch (action) {
      case "approve-send":                 return "ready-to-send";
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

  const HANDLED_STATUSES: CommandCard["status"][] = [
    "ready-to-send", "sent", "suppressed", "resolved", "escalated", "added-to-handoff",
  ];

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function startShift(): void {
    setShiftStarted(true);
    setShiftClosed(false);
    setAiStatus("Watching");
    setBriefingOpen(false);
    // Per-shift dedup + batching reset — a new shift starts with a clean slate.
    actionedKeysRef.current = new Set();
    batchSeqRef.current = 0;
    pendingSentByRef.current = new Map();
    setLastBatchAt(Date.now());
    setSecondsUntilNextBatch(batchIntervalMinutes * 60);
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
      action === "approve-send" ? "Queue alert" : action,
      action === "approve-send"
        ? `Queued "${card.title}" for the next dispatch batch.`
        : `${action} on "${card.title}".`,
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

    // Per-shift dedup memory: once a violation is handled (queued, sent,
    // suppressed, etc.) it must not resurface as "needs-review" on a recapture.
    if (HANDLED_STATUSES.includes(nextStatus)) {
      actionedKeysRef.current.add(cardIdentityKey(card));
    }

    // "approve-send" queues the alert for the next dispatch batch instead of
    // sending immediately — see flushBatch(). Remember who approved it so the
    // DispatchEntry created at flush time still has the right attribution.
    if (action === "approve-send") {
      pendingSentByRef.current.set(card.id, sentBy);
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
        // Tag with the CURRENT (not-yet-flushed) batch cycle — one ahead of
        // batchSeqRef, so it never collides with an already-flushed batch's
        // cycle number, and merges into that batch's rollup once it flushes.
        cycle:          batchSeqRef.current + 1,
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
      "ready-to-send", "sent", "suppressed", "resolved", "escalated", "added-to-handoff",
    ];
    if (terminalStatuses.includes(nextStatus) && focusedCardId === cardId) {
      setFocusedCardId(null);
    }
  }

  /** Applies one action to every card in a group at once (grouped Priority Feed cards). */
  function runGroupAction(action: CardAction, cardIds: string[]): void {
    cardIds.forEach((id) => runCardAction(action, id));
  }

  /**
   * Releases every "ready-to-send" card as one or more dispatch batches:
   * groups them by account first (a batch never mixes accounts — keeps the
   * per-account dispatch history rollup clean), then splits each account's
   * group into chunks of at most MAX_BATCH_SIZE. Each chunk gets its own
   * `cycle` number and DispatchEntry set (so the dispatch history can roll
   * them up as "Batch #N"), and moves those cards to "sent". This — not
   * runCardAction's approve-send — is what actually delivers alerts to
   * GChat/Teams, on the configured interval instead of instantly per card,
   * and never as one unbounded burst.
   *
   * Real Google Chat sends: cards on the "google-chat-lob" channel for an
   * account with a configured backend webhook (local_api.py /dispatch-alert,
   * env var GCHAT_WEBHOOK_<ACCOUNT>) go out for real, fire-and-forget,
   * alongside the simulated dispatch log above. Accounts with no webhook
   * configured stay simulated-only — this is additive, not a replacement.
   */
  function flushBatch(): void {
    // Computed from the CURRENT `cards` (closed over from this render) —
    // NOT inside the setCards updater below. setCards' updater callback is
    // invoked asynchronously by React (during the next render pass), so
    // side-effecting code placed inside it — building realSends, calling
    // appendAudit/setDispatchLog — was running AFTER this function had
    // already returned and its `for (const send of realSends)` loop had
    // already finished iterating an EMPTY array. That's the actual reason
    // real GChat sends never fired: not a channel-resolution bug, a
    // state-updater-timing bug. setCards below is now a pure, trivial map.
    const ready = cards.filter((c) => c.status === "ready-to-send");
    if (ready.length === 0) return;

    const byAccount = new Map<string, CommandCard[]>();
    for (const c of ready) {
      const key = c.lob ?? "—";
      const list = byAccount.get(key);
      if (list) list.push(c);
      else byAccount.set(key, [c]);
    }

    const allEntries: DispatchEntry[] = [];
    const sentIds = new Set<string>();
    // Cards headed to Chat, grouped by real account — ONE consolidated
    // message per account per flush, not one message per card (a burst of
    // individual pings was unreadable and easy to miss in a busy space).
    const realSendCardsByAccount = new Map<string, CommandCard[]>();

    for (const group of byAccount.values()) {
      for (let i = 0; i < group.length; i += MAX_BATCH_SIZE) {
        const chunk = group.slice(i, i + MAX_BATCH_SIZE);
        batchSeqRef.current += 1;
        const cycle = batchSeqRef.current;
        const flushedAt = new Date().toISOString();

        for (const card of chunk) {
          // selectedChannel is only ever set by one demo fixture — for
          // every real/live card it's undefined, so the card's actual
          // destination is its FIRST target channel, not a hardcoded
          // "audit-only". This resolved value is what both the dispatch
          // log AND the real-send gate below must use.
          const channel = card.selectedChannel ?? card.targetChannels[0] ?? "audit-only";

          allEntries.push({
            id:             `dispatch-${Date.now()}-${card.id}`,
            timestamp:      flushedAt,
            cycle,
            agent:          card.agent?.name ?? card.title,
            lob:            card.lob ?? "—",
            channel,
            message:        card.draftMessage ?? `Alert sent for ${card.title}.`,
            escalationLevel: "first-alert",
            status:         "sent",
            sentBy:         pendingSentByRef.current.get(card.id) ?? "rta",
          });
          pendingSentByRef.current.delete(card.id);
          sentIds.add(card.id);

          // Live-captured cards are tagged with the real account in `lob`
          // (see isAccountCard). Demo/scenario cards use `lob` for a
          // sub-queue name instead (e.g. "TLB", "COSTCO") — they carry no
          // account of their own, so fall back to whichever account is
          // currently selected in the Command Center header.
          if (channel === "google-chat-lob") {
            const account = isAccountCard(card.lob) ? card.lob : activeAccount;
            const list = realSendCardsByAccount.get(account);
            if (list) list.push(card);
            else realSendCardsByAccount.set(account, [card]);
          }
        }

        appendAudit(
          "ai",
          "Batch dispatch",
          `Batch #${cycle}: ${chunk.length} alert(s) sent.`,
          "simulated",
        );
      }
    }

    setDispatchLog((prev) => [...prev, ...allEntries]);
    setCards((prevCards) => prevCards.map((c) => (sentIds.has(c.id) ? { ...c, status: "sent" as const } : c)));
    setLastBatchAt(Date.now());
    setSecondsUntilNextBatch(batchIntervalMinutes * 60);

    const realSends = [...realSendCardsByAccount.entries()].map(([account, accountCards]) => ({
      account,
      card: buildGChatAlertBatchCard(accountCards),
    }));

    // Fire-and-forget: an account with no webhook configured just stays
    // simulated (backend returns ok:false, not a 500) — the dispatch log
    // above already recorded it as "sent" either way.
    for (const send of realSends) {
      fetch("/api/dispatch-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(send),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok) console.warn(`[dispatch] ${send.account}: ${data.error}`);
        })
        .catch((e) => console.warn(`[dispatch] ${send.account}: request failed`, e));
    }
  }

  // Keep a stable ref to the latest flushBatch/batch-interval so the interval
  // effect below never needs to tear down and restart the timer mid-countdown.
  const flushBatchRef = useRef(flushBatch);
  flushBatchRef.current = flushBatch;

  // Batch countdown + auto-flush — ticks every second; flushes when the
  // configured interval elapses. Wall-clock relative to lastBatchAt (not
  // aligned to :00/:15/:30/:45) so the interval is genuinely configurable.
  useEffect(() => {
    const id = setInterval(() => {
      const elapsedMs = Date.now() - lastBatchAt;
      const remaining = Math.max(0, batchIntervalMinutes * 60 - Math.floor(elapsedMs / 1000));
      setSecondsUntilNextBatch(remaining);
      if (remaining === 0) flushBatchRef.current();
    }, 1000);
    return () => clearInterval(id);
  }, [lastBatchAt, batchIntervalMinutes]);

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

  // -- Per-account view: everything rendered is scoped to activeAccount ------
  // Cards/dispatch entries tagged with one of the known account ids are
  // partitioned; anything else (demo/scenario data) is shown regardless of
  // which account is selected, so the scenario picker keeps working as-is.
  const visibleCards = cards.filter((c) => !isAccountCard(c.lob) || c.lob === activeAccount);
  const visibleDispatchLog = dispatchLog.filter((e) => !isAccountCard(e.lob) || e.lob === activeAccount);
  const queuedForBatchCount = visibleCards.filter((c) => c.status === "ready-to-send").length;
  const handledThisShiftCount = visibleCards.filter((c) =>
    HANDLED_STATUSES.includes(c.status) && c.status !== "ready-to-send",
  ).length;

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
        activeAccount={activeAccount}
        isOutageActive={isOutageActive}
        onStart={startShift}
        onClose={closeShift}
        onToggleLiveDemo={() => setLiveDemo((v) => !v)}
        onToggleAutoMode={() => setAutoMode((v) => !v)}
        onCapture={() => setCaptureConfigOpen(true)}
        onOpenBriefing={() => setBriefingOpen(true)}
        onScenarioChange={(id) => setActiveScenarioId(id)}
        onAccountChange={(id) => setActiveAccount(id)}
        hasReport={reportPayload !== null}
        onGenerateReport={generateReport}
      />

      {liveBridgeActive && (
        <div
          data-testid="live-bridge-banner"
          style={{
            background: liveFresh ? "#c0392b" : "#6b7280",
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
              opacity: liveFresh ? 1 : 0.5,
              animation: liveFresh ? "rtaPulse 1.6s ease-in-out infinite" : "none",
            }}
          />
          <span>
            {liveFresh
              ? "LIVE — captured from Verint via the RTA Live Bridge extension (evidence-backed)"
              : "IDLE — bridge connected, no fresh capture (page the Verint calendar to resume)"}
          </span>
          {lastSynced && (
            <span
              data-testid="live-bridge-synced"
              style={{ marginLeft: "auto", fontWeight: 400, fontSize: 12 }}
            >
              ♥ synced{" "}
              {lastSyncAgoSec == null
                ? "—"
                : lastSyncAgoSec < 60
                ? `${lastSyncAgoSec}s ago`
                : `${Math.floor(lastSyncAgoSec / 60)}m ${lastSyncAgoSec % 60}s ago`}{" "}
              · {new Date(lastSynced).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      <HealthStrip
        cards={visibleCards}
        lobData={lobHealth}
        aiHandledCount={aiHandledCount}
        autoMode={autoMode}
        autoSentCount={autoSentCount}
        isOutageActive={isOutageActive}
      />

      <div className="workspace">
        <div className="workspace__left">
          <div className="left-view-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mainView === "priority-feed"}
              className={`lvt-btn${mainView === "priority-feed" ? " lvt-btn--active" : ""}`}
              onClick={() => setMainView("priority-feed")}
            >
              Priority Feed
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainView === "floor"}
              className={`lvt-btn${mainView === "floor" ? " lvt-btn--active" : ""}`}
              onClick={() => setMainView("floor")}
            >
              Floor View
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mainView === "board"}
              className={`lvt-btn${mainView === "board" ? " lvt-btn--active" : ""}`}
              onClick={() => setMainView("board")}
            >
              Alert Board
            </button>
          </div>
          {mainView === "board" ? (
            <Board
              cards={visibleCards}
              roster={verintRoster}
              state={boardState}
              onChange={(id, patch) => setBoardState((s) => ({ ...s, [id]: { ...s[id], ...patch } }))}
              onOpenCard={(cardId) => { setFocusedCardId(cardId); setMainView("priority-feed"); }}
            />
          ) : mainView === "floor" ? (
            <FloorView
              cards={visibleCards}
              lobData={lobHealth}
              onAgentClick={(cardId) => {
                setFocusedCardId(cardId); // promote the card in the feed (radar finds, card resolves)
                setMainView("priority-feed");
              }}
            />
          ) : (
            <PriorityFeed
              cards={visibleCards}
              newCardIds={newCardIds}
              focusedCardId={focusedCardId}
              onAction={(action, cardId) => runCardAction(action, cardId)}
              onGroupAction={(action, cardIds) => runGroupAction(action, cardIds)}
              onFocus={(cardId) => setFocusedCardId(cardId)}
              onShowBoard={() => {/* future: full kanban toggle */}}
              activeAccount={activeAccount}
              handledThisShiftCount={handledThisShiftCount}
              batchIntervalMinutes={batchIntervalMinutes}
              onBatchIntervalChange={setBatchIntervalMinutes}
              queuedForBatchCount={queuedForBatchCount}
              secondsUntilNextBatch={secondsUntilNextBatch}
              onFlushNow={flushBatch}
            />
          )}
        </div>

        <div className="workspace__right">
          <ProcessView
            cards={visibleCards}
            lobData={lobHealth}
            reports={reports}
            attendanceReports={activeScenario.reports.attendanceReports}
            dispatchLog={visibleDispatchLog}
            onAction={(action, cardId) => runCardAction(action, cardId)}
            reportPayload={reportPayload}
            reportConfig={reportConfig}
            reportSnapshotsToday={reportSnapshotsToday}
            onOpenReportConfig={() => setReportConfigOpen(true)}
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
          dispatchLog={dispatchLog}
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

      {reportConfigOpen && (
        <ReportConfigPanel
          accountId={activeAccount}
          defaults={reportConfig}
          onClose={() => setReportConfigOpen(false)}
          onConfigSave={(cfg) => {
            setReportConfig(cfg);
            setReportConfigOpen(false);
          }}
          onSendChatDigestNow={sendChatDigest}
        />
      )}

    </main>
  );
}

export default App;
