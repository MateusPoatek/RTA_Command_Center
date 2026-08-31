/**
 * useLiveEngine.ts — live demo simulation engine
 *
 * What this hook does:
 *   Simulates the real-time behaviour of the CIBC RTA monitoring environment
 *   so that stakeholders can see a "live" demo without connecting to Verint.
 *
 *   Four simulation loops run here:
 *   1. Scan pulse (every SCAN_PULSE_MS)
 *      Randomly advances a card's status by one step and logs an AI scan message.
 *      Simulates the AI engine continuously watching Verint.
 *
 *   2. New card arrival (every NEW_CARD_INTERVAL_MS)
 *      Pops one card from the scenario queue and injects it at the top of the feed.
 *      Simulates the AI detecting a new adherence violation mid-shift.
 *
 *   3. Auto mode (every AUTO_ACTION_MIN_MS to AUTO_ACTION_MAX_MS, random)
 *      When the RTA enables "Autonomous" mode, the AI picks the highest-severity
 *      actionable card and acts on it without waiting for an RTA click.
 *      This is the "future state" demo — the AI running independently.
 *
 *   4. Verint capture simulation (triggered manually via startCapture)
 *      Takes CAPTURE_SIMULATION_MS to complete, then injects up to
 *      CAPTURE_MAX_CARDS cards from the scenario pool.
 *
 * DEMO NOTE:
 *   All intervals and timing values are defined in src/shared/constants.ts.
 *   To make the demo faster or slower, edit those values — do not change this file.
 *
 * Production note:
 *   In production, this hook is replaced by a WebSocket or SSE connection to the
 *   RTA Command Centre backend. The backend pushes card events when Verint reports
 *   a new violation. This hook is pure simulation code — do not deploy it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountId, CommandCard, Severity } from "../domain/types";
import { isAccountCard } from "../domain/types";
import type { Scenario } from "../domain/scenario_types";
import {
  SCAN_PULSE_MS,
  NEW_CARD_INTERVAL_MS,
  AUTO_ACTION_MIN_MS,
  AUTO_ACTION_MAX_MS,
  NEW_CARD_FLASH_MS,
  CAPTURE_SIMULATION_MS,
  CAPTURE_MAX_CARDS,
  AGENT_LOG_MAX_LINES,
} from "../shared/constants";

// ---------------------------------------------------------------------------
// Static demo data — CSR names, scan messages, LOB rotation
// ---------------------------------------------------------------------------

/**
 * Pool of CSR names used when the live engine injects new cards.
 * Names rotate round-robin so every card has a different agent.
 * All names are seeded (not evidence-backed). See DataClass in types.ts.
 */
const CSR_POOL = [
  "Clara Mendoza", "Hugo Ramos", "Nora Beltran",
  "Diego Salazar", "Paula Vega", "Rosa Campos",
  "Tomas Reyes", "Marco Pineda", "Elena Navarro", "Camila Duarte",
];

/**
 * Messages shown in the Agent Activity Ticker during each scan pulse.
 * These simulate the AI narrating what it is doing in real time.
 * The LOB name is injected at render time.
 */
const SCAN_PULSES: Array<(lob: string) => string> = [
  (lob) => `Scanning ${lob} — adherence check complete`,
  (lob) => `${lob} threshold evaluation — no violations`,
  (lob) => `Watch rule active — ${lob} queue depth within limits`,
  (lob) => `${lob} cycle complete — 1 card flagged for review`,
  (lob) => `Dedup filter applied — ${lob} repeat pattern suppressed`,
  (lob) => `${lob} SLA check — within tolerance`,
];

/** LOBs used in the scan pulse messages — rotates round-robin. */
const LOBS = ["TLB", "Costco", "Cards", "Fraud ITR", "Fraud AAF", "Costco Disputes"];

/**
 * Numeric severity score used to sort cards by urgency.
 * Higher is more urgent. Drives which card the autonomous engine acts on first.
 */
const SEVERITY_SCORE: Record<Severity, number> = {
  critical: 5, high: 4, medium: 3, low: 2, info: 1,
};

// ---------------------------------------------------------------------------
// Hook interface types
// ---------------------------------------------------------------------------

/**
 * Options passed into useLiveEngine from App.tsx.
 * All values come from App-level state and are forwarded here as props.
 */
interface UseLiveEngineOptions {
  /** Whether the live simulation loops are running. */
  liveDemo: boolean;
  /** Whether the AI is acting autonomously without RTA input. */
  autoMode: boolean;
  /** Whether the RTA has pressed "Start Shift" — loops only run post-shift-start. */
  shiftStarted: boolean;
  /** The currently selected demo scenario. Cards are drawn from this pool. */
  activeScenario: Scenario;
  /** Current card list (read by the auto-mode loop to find actionable cards). */
  cards: CommandCard[];
  /** Which account the RTA is currently viewing — autonomous mode only acts within it. */
  activeAccount: AccountId;
  /** Setter for the card list (called by scan pulse and card arrival loops). */
  setCards: React.Dispatch<React.SetStateAction<CommandCard[]>>;
  /**
   * Callback fired when the auto-mode engine picks a card to act on.
   * Defined in App.tsx so that action results (audit, dispatch) are handled
   * at the App level rather than inside this hook.
   */
  onAutoAction: (cardId: string) => void;
}

/**
 * Values returned by useLiveEngine to App.tsx.
 */
interface UseLiveEngineReturn {
  /** Lines shown in the Agent Activity Ticker. Newest line is first. */
  agentLog: string[];
  /** Set of card IDs currently flashing (newly arrived). */
  newCardIds: Set<string>;
  /** True while the Verint capture simulation is running. */
  captureRunning: boolean;
  /** Allows App.tsx to write the first few lines of the log at shift start. */
  setAgentLog: React.Dispatch<React.SetStateAction<string[]>>;
  /** Triggers a Verint capture simulation. */
  startCapture: () => void;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useLiveEngine({
  liveDemo,
  autoMode,
  shiftStarted,
  activeScenario,
  cards,
  setCards,
  onAutoAction,
  activeAccount,
}: UseLiveEngineOptions): UseLiveEngineReturn {
  const [agentLog, setAgentLog] = useState<string[]>([
    "AI agent initialised — awaiting shift start",
  ]);
  const [newCardIds, setNewCardIds] = useState<Set<string>>(new Set());
  const [captureRunning, setCaptureRunning] = useState(false);

  // Refs let interval callbacks read the latest state without stale closures.
  const cardQueueRef    = useRef<CommandCard[]>([]);
  const cardsRef        = useRef<CommandCard[]>(cards);
  const onAutoActionRef = useRef(onAutoAction);
  const activeAccountRef = useRef(activeAccount);
  const csrIndexRef     = useRef(0);
  const pulseIndexRef   = useRef(0);
  const lobIndexRef     = useRef(0);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { onAutoActionRef.current = onAutoAction; }, [onAutoAction]);
  useEffect(() => { activeAccountRef.current = activeAccount; }, [activeAccount]);

  // Reset the card queue whenever the scenario changes.
  useEffect(() => {
    cardQueueRef.current = [];
  }, [activeScenario]);

  // ---------------------------------------------------------------------------
  // Flash helper — marks a card as "new" for NEW_CARD_FLASH_MS milliseconds.
  // ---------------------------------------------------------------------------
  const flashCard = useCallback((id: string) => {
    setNewCardIds((prev) => new Set([...prev, id]));
    window.setTimeout(() => {
      setNewCardIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, NEW_CARD_FLASH_MS);
  }, []);

  // ---------------------------------------------------------------------------
  // Simulation loop 1 — scan pulse + card arrival
  // Runs only when liveDemo = true AND shiftStarted = true.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!liveDemo || !shiftStarted) return;

    // Scan pulse: advance one random card's status and log an AI message.
    const scanInterval = setInterval(() => {
      setCards((current) => {
        const actionable = current.filter(
          (c) => c.status === "detected" || c.status === "classified",
        );
        if (actionable.length === 0) return current;
        const target = actionable[Math.floor(Math.random() * actionable.length)];
        return current.map((c) =>
          c.id === target.id
            ? { ...c, status: c.status === "detected" ? "classified" : "needs-review" }
            : c,
        );
      });

      const lob    = LOBS[lobIndexRef.current % LOBS.length];
      const msgFn  = SCAN_PULSES[pulseIndexRef.current % SCAN_PULSES.length];
      lobIndexRef.current   += 1;
      pulseIndexRef.current += 1;
      setAgentLog((prev) => [`[AI] ${msgFn(lob)}`, ...prev].slice(0, AGENT_LOG_MAX_LINES));
    }, SCAN_PULSE_MS);

    // New card arrival: pop one card from the scenario queue and inject it.
    const cardInterval = setInterval(() => {
      // Refill the queue if empty.
      if (cardQueueRef.current.length === 0) {
        setCards((current: CommandCard[]) => {
          const existingIds = new Set(current.map((c: CommandCard) => c.id));
          cardQueueRef.current = activeScenario.cards.filter(
            (c: CommandCard) => !existingIds.has(c.id),
          );
          return current;
        });
      }

      const next = cardQueueRef.current.shift();
      if (!next) return;

      const csrName = CSR_POOL[csrIndexRef.current % CSR_POOL.length];
      csrIndexRef.current += 1;

      const newCard: CommandCard = {
        ...next,
        id:     `live-${Date.now()}`,
        status: "detected",
        agent:  next.agent ? { ...next.agent, name: csrName } : undefined,
        title:  next.agent
          ? `${next.title.split("—")[0].trim()} — ${csrName}`
          : next.title,
        auditEvents: [],
      };

      setCards((prev) => [newCard, ...prev]);
      flashCard(newCard.id);

      setAgentLog((prev) =>
        [`[AI] New card → ${newCard.title} (${newCard.lob ?? "unknown LOB"})`, ...prev].slice(
          0,
          AGENT_LOG_MAX_LINES,
        ),
      );
    }, NEW_CARD_INTERVAL_MS);

    return () => {
      clearInterval(scanInterval);
      clearInterval(cardInterval);
    };
  }, [liveDemo, shiftStarted, activeScenario, setCards, flashCard]);

  // ---------------------------------------------------------------------------
  // Simulation loop 2 — autonomous AI action
  // Fires on a random interval between AUTO_ACTION_MIN_MS and AUTO_ACTION_MAX_MS.
  // Picks the highest-severity actionable card and calls onAutoAction.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!autoMode || !shiftStarted) return;

    function scheduleNext() {
      const delay = AUTO_ACTION_MIN_MS + Math.random() * (AUTO_ACTION_MAX_MS - AUTO_ACTION_MIN_MS);
      return window.setTimeout(() => {
        const current = cardsRef.current;
        const account = activeAccountRef.current;

        // Only "needs-review"/"classified" — NOT "ready-to-send": once
        // approve-send queues a card for the next dispatch batch, it must not
        // be picked again every tick (it isn't undecided anymore, it's just
        // waiting to flush). Also scoped to the account currently being
        // viewed, so autonomous mode never acts on — or toasts about — a
        // card the RTA can't currently see.
        const actionable = current.filter(
          (c) =>
            (c.status === "needs-review" || c.status === "classified") &&
            (!isAccountCard(c.lob) || c.lob === account),
        );

        if (actionable.length === 0) {
          timerRef.current = scheduleNext();
          return;
        }

        const sorted = [...actionable].sort(
          (a, b) => (SEVERITY_SCORE[b.severity] ?? 0) - (SEVERITY_SCORE[a.severity] ?? 0),
        );
        const target = sorted[0];

        setAgentLog((prev) =>
          [
            `[AI] Autonomous → "${target.title.slice(0, 40)}"`,
            ...prev,
          ].slice(0, AGENT_LOG_MAX_LINES),
        );

        onAutoActionRef.current(target.id);
        timerRef.current = scheduleNext();
      }, delay);
    }

    const timerRef = { current: scheduleNext() };
    return () => { window.clearTimeout(timerRef.current); };
  }, [autoMode, shiftStarted]);

  // ---------------------------------------------------------------------------
  // Verint capture simulation — triggered by startCapture() from App.tsx
  // ---------------------------------------------------------------------------

  /**
   * Simulates scanning the Verint window for unprocessed exceptions.
   * Takes CAPTURE_SIMULATION_MS to complete, then injects up to
   * CAPTURE_MAX_CARDS cards from the scenario pool.
   *
   * DEMO NOTE: In production, this is replaced by a real OCR call to the
   * Verint Capture Service. The card creation logic remains the same.
   */
  const startCapture = useCallback(() => {
    if (captureRunning) return;
    setCaptureRunning(true);
    setAgentLog((prev) =>
      ["[AI] Capture initiated — scanning Verint window...", ...prev].slice(0, AGENT_LOG_MAX_LINES),
    );

    window.setTimeout(() => {
      setCards((current: CommandCard[]) => {
        const existingIds = new Set(current.map((c: CommandCard) => c.id));
        const candidates  = activeScenario.cards
          .filter((c: CommandCard) => !existingIds.has(c.id))
          .slice(0, CAPTURE_MAX_CARDS);

        if (candidates.length === 0) {
          setAgentLog((prev) =>
            ["[AI] Capture complete — no new exceptions found", ...prev].slice(0, AGENT_LOG_MAX_LINES),
          );
          return current;
        }

        const captured = candidates.map((c: CommandCard, i: number) => {
          const id = `capture-${Date.now()}-${i}`;
          const card: CommandCard = {
            ...c,
            id,
            status: "detected",
            title:  `[Captured] ${c.title}`,
            auditEvents: [],
          };
          window.setTimeout(() => flashCard(id), 100);
          return card;
        });

        setAgentLog((prev) =>
          [
            `[AI] Capture complete — ${captured.length} exception${captured.length !== 1 ? "s" : ""} extracted from Verint`,
            ...prev,
          ].slice(0, AGENT_LOG_MAX_LINES),
        );

        return [...captured, ...current];
      });

      setCaptureRunning(false);
    }, CAPTURE_SIMULATION_MS);
  }, [captureRunning, activeScenario, setCards, flashCard]);

  return {
    agentLog,
    newCardIds,
    captureRunning,
    setAgentLog,
    startCapture,
  };
}
