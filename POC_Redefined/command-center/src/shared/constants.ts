/**
 * constants.ts — single source of truth for all magic numbers and demo timings.
 *
 * Why this file exists:
 *   The same numeric values (e.g. 248, 8, 78) appeared in multiple files with
 *   no explanation. Any engineer reading the code had to guess what they meant.
 *   This file gives every number a name and a description so the intent is clear.
 *
 * How to use:
 *   import { TOTAL_AGENTS, SCAN_PULSE_MS } from "../shared/constants";
 */

// ---------------------------------------------------------------------------
// Business domain constants
// ---------------------------------------------------------------------------

/**
 * Total agents monitored across Guatemala and Philippines LOBs.
 * This is a planning assumption used in the shift-start briefing.
 * In production, this number comes from the Verint roster API.
 */
export const TOTAL_AGENTS = 248;

/**
 * Maximum cards displayed in the Focus Queue before the list overflows.
 * Cards beyond this limit are still in state — they are not dropped.
 */
export const QUEUE_MAX = 8;

/**
 * Baseline AI confidence percentage before any RTA feedback is received.
 * Displayed in the Learning Strip at session start.
 * Rises as the RTA approves/edits, falls as the RTA suppresses.
 */
export const BASE_CONFIDENCE = 78;

/**
 * Maximum AI response tokens for the Copilot streaming calls.
 * Kept short so answers feel concise and fast.
 * See: src/services/fuelixClient.ts
 */
export const AI_MAX_TOKENS = 200;

/**
 * Alert thresholds sourced from the April 28 shadowing session.
 * Full definitions live in: POC/01_evidence_pack/rules/alert_thresholds.json
 */
export const ALERT_THRESHOLDS = {
  /** On-call duration (seconds) before an alert fires. */
  LONG_CALL_SECONDS: 9 * 60,
  /** Hold duration (seconds) before an alert fires. */
  LONG_HOLD_SECONDS: 3 * 60,
  /** Coaching or meeting duration (seconds) before an alert fires. */
  LONG_COACHING_SECONDS: 30 * 60,
  /** Schedule vs actual mismatch (seconds) before an alert fires. */
  SCHEDULE_MISMATCH_SECONDS: 5 * 60,
} as const;

/**
 * LOB service-level gates for coaching/huddle approvals.
 * Source: ABD_Coaching_Huddle_Approval.docx
 */
export const SL_GATES = {
  /** SL above this value → offline activities allowed. */
  ALLOW_OFFLINE_PCT: 95,
  /** SL in this range → short coaching only. */
  LIMITED_OFFLINE_PCT: 80,
  /** SL below LIMITED_OFFLINE_PCT → deny all offline activities. */
} as const;

// ---------------------------------------------------------------------------
// Demo simulation timings
// ---------------------------------------------------------------------------

/**
 * Milliseconds between AI scan pulse ticks in live demo mode.
 * Each tick advances card statuses and appends a log line.
 * Lower = faster demo; higher = calmer demo.
 */
export const SCAN_PULSE_MS = 3_000;

/**
 * Milliseconds between new card injections in live demo mode.
 * Mimics the 15-minute Verint monitoring cadence, compressed to seconds.
 */
export const NEW_CARD_INTERVAL_MS = 15_000;

/**
 * Minimum delay (ms) between autonomous AI actions in auto mode.
 * The actual delay is random between MIN and MAX.
 */
export const AUTO_ACTION_MIN_MS = 5_000;

/**
 * Maximum delay (ms) between autonomous AI actions in auto mode.
 */
export const AUTO_ACTION_MAX_MS = 8_000;

/**
 * How long (ms) to keep a newly-arrived card highlighted in the feed.
 */
export const NEW_CARD_FLASH_MS = 4_000;

/**
 * How long (ms) the AI "Generating Report" status lasts before reverting.
 */
export const REPORT_STATUS_RESET_MS = 900;

/**
 * How long (ms) the Verint capture simulation takes before cards appear.
 */
export const CAPTURE_SIMULATION_MS = 2_000;

/**
 * Maximum number of cards injected per Verint capture simulation.
 */
export const CAPTURE_MAX_CARDS = 3;

/**
 * Maximum number of log lines kept in the agent activity ticker.
 */
export const AGENT_LOG_MAX_LINES = 20;

// ---------------------------------------------------------------------------
// Verint monitoring cycle
// ---------------------------------------------------------------------------

/**
 * Duration of one Verint monitoring cycle in minutes.
 * RTAs scan all LOBs every 15 minutes — this is the cycle the UI clock tracks.
 * Source: April 28 shadowing session; ABD_RT_Adherence_Monitoring.docx
 */
export const VERINT_CYCLE_MINUTES = 15;
