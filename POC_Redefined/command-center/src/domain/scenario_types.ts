/**
 * scenario_types.ts
 * -----------------
 * Types for the 4-scenario simulation layer.
 *
 * Each Scenario bundles CommandCards (for the kanban) with the full set of
 * reports and the dispatch log — so the director can see BOTH the operational
 * view (what the AI is watching) AND the output view (what the RTA used to
 * produce manually.
 *
 * The four scenarios:
 *   A — Steady State:      Normal shift, minor violations, clean close.
 *   B — Queue Spike:       RED/BLUE line health, supervisor/OM escalations.
 *   C — Attendance Crisis: Morning attendance at 71%, near 70% threshold.
 *   D — Tech Outage:       Fraud ITR WDE outage, SNOW TKT-8823, 6 agents affected.
 *
 * All data in scenarios is either "evidence-backed" (from shadowing session) or
 * "seeded"/"simulated". See DataClass in types.ts for details.
 */

import type { CommandCard, OutageEscalationRules, TargetChannel } from "./types";

// ---------------------------------------------------------------------------
// Dispatch log — the record of every alert sent during a shift
// ---------------------------------------------------------------------------

/**
 * How far up the chain an alert was escalated.
 * Mirrors the real escalation protocol from ABD_RT_Adherence_Monitoring.docx:
 *   Cycle 1 → first-alert (LOB chat)
 *   Cycle 2 → supervisor
 *   Cycle 3+ → operations manager or senior RTA
 */
export type EscalationLevel = "first-alert" | "supervisor" | "om" | "senior-rta";

/**
 * Final state of a dispatch entry.
 * - `"sent"`       — message was delivered to the target channel.
 * - `"suppressed"` — RTA decided no action was needed.
 * - `"pending"`    — waiting for RTA approval (not yet dispatched).
 * - `"escalated"`  — sent to a higher level than originally planned.
 */
export type DispatchStatus = "sent" | "suppressed" | "pending" | "escalated";

/**
 * One entry in the shift's dispatch log.
 * Represents one alert or escalation message sent (or not sent) during the shift.
 *
 * In the POC, the dispatch log is built from scenario seed data plus entries
 * added in real time as the RTA approves cards.
 * In production, each entry would be created by the backend when the message
 * is delivered to Google Chat or Teams.
 */
export interface DispatchEntry {
  /** Unique identifier for this dispatch entry. */
  id: string;
  /** ISO 8601 timestamp of when the message was sent or suppressed. */
  timestamp: string;
  /** Which monitoring cycle this was sent in (1 = first 15-min cycle, etc.). */
  cycle: number;
  /** Name of the agent this entry is about. */
  agent: string;
  /** Line of Business (e.g. "TLB", "Fraud ITR"). */
  lob: string;
  /**
   * The target channel for this dispatch.
   * Using TargetChannel keeps this consistent with CommandCard.targetChannels.
   * In scenarios, this may also be a plain string for legacy entries — treat
   * it as TargetChannel where possible.
   */
  channel: TargetChannel | string;
  /** The message that was sent (or would have been sent). */
  message: string;
  /** How far up the chain this entry was escalated. */
  escalationLevel: EscalationLevel;
  /** Final state of this entry. */
  status: DispatchStatus;
  /**
   * Who originated this dispatch.
   * - `"ai"`  → fired by the autonomous engine, zero RTA clicks required.
   * - `"rta"` → RTA manually approved the send action.
   * - undefined → scenario seed data (treat as "rta" for display purposes).
   */
  sentBy?: "rta" | "ai";
  /**
   * Present only on escalated entries.
   * Explains why the AI recommended escalation rather than acting autonomously.
   */
  escalationReason?: string;
  /**
   * Present on outage escalation entries.
   * Carries the timed escalation chain from the originating CommandCard.
   */
  outageEscalationRules?: OutageEscalationRules;
}

// ---------------------------------------------------------------------------
// Attendance reports
// ---------------------------------------------------------------------------

/**
 * Data for one attendance report cycle.
 * RTAs send attendance reports every 3 hours: Morning, Midday, Afternoon, Final.
 * Source: ABD_Attendance_Reporting.docx
 *
 * In the POC, these are seeded per scenario.
 * In production, they are generated from the Workday attendance feed.
 */
export interface AttendanceReportData {
  /** Unique identifier for this report cycle. */
  id: string;
  /** The time this report was generated (e.g. "08:30 GT"). */
  reportTime: string;
  /** Which report cycle this is: "Morning" | "Midday" | "Afternoon" | "Final" */
  cycleLabel: string;
  /** Percentage of agents present and on time (0–100). */
  attendancePct: number;
  /** Percentage of agents absent (0–100). */
  absenteeismPct: number;
  /** Percentage of agents who arrived late (0–100). */
  latenessPct: number;
  /** Average lateness in minutes for late agents. */
  latenessMinutes: number;
  /** Number of agents who did not show up at all. */
  noShowCount: number;
  /** Total agents expected on shift. */
  totalScheduled: number;
  /** True if this report has an anomaly (e.g. attendance below 80%). */
  anomaly: boolean;
  /** Explanation of the anomaly, if present. */
  anomalyNote?: string;
  /** The email subject line the AI pre-populated. */
  emailSubject: string;
  /** The full email body the AI pre-populated. RTA reviews before sending. */
  emailBody: string;
  /** Whether this report was sent, is due soon, or is blocked by missing data. */
  status: "sent" | "due-soon" | "blocked";
}

// ---------------------------------------------------------------------------
// Escalation report
// ---------------------------------------------------------------------------

/**
 * One row in the shift's escalation summary report.
 * Shows each agent whose situation was escalated during the shift.
 */
export interface EscalationEntry {
  /** Agent's full name. */
  agent: string;
  /** Line of Business. */
  lob: string;
  /** The status that triggered escalation (e.g. "COAC 38min"). */
  status: string;
  /** How many monitoring cycles the situation was escalated. */
  cyclesEscalated: number;
  /** The highest escalation level reached. */
  escalatedTo: EscalationLevel;
  /** Who resolved the situation (e.g. "Supervisor", "Operations Manager"). */
  resolvedBy: string;
  /** Free-text notes on the resolution. */
  notes: string;
}

// ---------------------------------------------------------------------------
// Shrinkage
// ---------------------------------------------------------------------------

/**
 * One category of shrinkage (unproductive time) in the shift's shrinkage report.
 * RTAs track shrinkage to ensure staffing plans remain accurate.
 * Source: ABD_Attendance_Reporting.docx
 */
export interface ShrinkageCategory {
  /** Category name (e.g. "Coaching", "Lunch", "Sick", "Meeting"). */
  category: string;
  /** Total minutes of shrinkage in this category for the shift. */
  minutes: number;
  /** Percentage of total scheduled time this category represents. */
  pct: number;
  /** Emoji icon used in the shrinkage table for this category. */
  icon: string;
}

// ---------------------------------------------------------------------------
// Shift handoff
// ---------------------------------------------------------------------------

/**
 * Content of the end-of-shift handoff note passed to the incoming RTA.
 * The AI pre-populates this from unresolved cards and audit events.
 * The outgoing RTA reviews and sends before logging off.
 * Source: ABD_Shift_Start_End.docx
 */
export interface ShiftHandoffData {
  /** Name of the RTA who is ending their shift. */
  outgoingRTA: string;
  /** Date of the shift (e.g. "2026-04-28"). */
  shiftDate: string;
  /** Shift hours (e.g. "09:00–17:00 GT"). */
  shiftHours: string;
  /** Number of unresolved alert cards at shift end. */
  openAlerts: number;
  /** Number of open ServiceNow tickets at shift end. */
  openTickets: number;
  /** List of end-of-day findings and observations. */
  eodFindings: string[];
  /** The full handoff message for the incoming RTA. */
  handoffMessage: string;
  /** A note from the incoming RTA (shown when they load the briefing). */
  incomingRTANote: string;
}

// ---------------------------------------------------------------------------
// Forecast / staffing outlook
// ---------------------------------------------------------------------------

/**
 * One 15-minute interval in the staffing forecast shown in LOB Health view.
 * Compares how many agents are required vs. how many are available.
 */
export interface ForecastInterval {
  /** Time label for this interval (e.g. "14:00", "14:15"). */
  time: string;
  /** Agents required to meet SLA in this interval. */
  required: number;
  /** Agents available in this interval. */
  available: number;
  /** Difference: positive = overstaffed, negative = understaffed. */
  delta: number;
  /** Health status based on delta. Drives the forecast chart colour. */
  health: "GREEN" | "YELLOW" | "RED" | "BLUE";
}

// ---------------------------------------------------------------------------
// Full scenario bundle
// ---------------------------------------------------------------------------

/**
 * All report data associated with one scenario.
 * Loaded when the user switches scenarios in the demo.
 */
export interface ScenarioReports {
  /** Four attendance reports (Morning, Midday, Afternoon, Final). */
  attendanceReports: AttendanceReportData[];
  /** Seeded dispatch log entries (pre-shift history). */
  dispatchLog: DispatchEntry[];
  /** Escalation summary rows for this scenario's shifts. */
  escalations: EscalationEntry[];
  /** Shrinkage breakdown table. */
  shrinkage: ShrinkageCategory[];
  /** 15-minute staffing forecast for the shift. */
  forecast: ForecastInterval[];
  /** End-of-shift handoff document. */
  handoff: ShiftHandoffData;
}

/**
 * A complete demo scenario bundle.
 *
 * Each scenario gives the director a different "story" to tell:
 *   A — Steady State:      AI handles routine load, confidence grows.
 *   B — Queue Spike:       AI escalates correctly when SLA collapses.
 *   C — Attendance Crisis: AI detects anomaly and prepares alerts early.
 *   D — Tech Outage:       AI runs the outage playbook autonomously.
 *
 * Switching scenarios replaces all cards and reports in the UI simultaneously.
 * See App.tsx → useEffect on activeScenarioId.
 */
export interface Scenario {
  /** Single-letter identifier used as the switching key. */
  id: "A" | "B" | "C" | "D" | "E";
  /** Display name (e.g. "Steady State", "Queue Spike"). */
  label: string;
  /** One-word theme shown in the scenario picker (e.g. "Outage"). */
  theme: string;
  /** One-sentence description of what this scenario demonstrates. */
  description: string;
  /** Summary of overall line health in this scenario (shown in CommandBar). */
  lineHealthSummary: string;
  /** The cards the AI would have generated for this scenario. */
  cards: CommandCard[];
  /** Reports and dispatch log pre-populated for this scenario. */
  reports: ScenarioReports;
}
