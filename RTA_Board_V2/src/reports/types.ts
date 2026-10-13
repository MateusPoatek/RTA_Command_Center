// Report types, ported from the old command-center (domain/types.ts) unchanged: they mirror the
// JSON local_api.py /generate-report writes (POC_Redefined/docs/REPORT_SCHEMA.md).
export type DiscrepancyType =
  | "clocked_in_not_in_adherence"
  | "in_adherence_no_clock_in"
  | "no_clock_in_no_activity"
  | "clocked_out_still_active"
  | "not_yet_scheduled"
  | "match_ok";

export interface DiscrepancyRow {
  workday_id: string;
  employee: string;
  subgroup: string;
  lob: string;
  /** Summary of this employee's distinct GTT event types (e.g. "clock_in, daily-communications +2 more") — one row per employee, not per event. */
  gtt_event: string;
  /** Raw count of GTT event rows this employee generated today. */
  gtt_event_count: number;
  verint_status: string;
  adherence_pct: number | null;
  ooa_seconds: number | null;
  /** Minutes in-adherence so far today (cumulative, not a full-shift total). Null if no Verint row. */
  adherence_minutes: number | null;
  /** Productive (paid) minutes so far today (cumulative, not a full-shift total). Null if no Verint row. */
  productive_minutes: number | null;
  /** Total out-of-adherence minutes today (NOT the single-worst-violation ooa_seconds above). Null if no Verint row. */
  ooa_minutes: number | null;
  /** Scheduled (planned) shift length in minutes — the projected/target ceiling for the day. Null if no scheduled bounds. */
  scheduled_minutes: number | null;
  discrepancy_type: DiscrepancyType;
}

/** One hour's aggregate across every captured agent — see ReconciliationReport.hourly_attendance. */
export interface HourlyAttendanceBucket {
  hour: number;
  agent_count: number;
  productive_minutes: number;
}

export interface ReconciliationMeta {
  schema_version: string;
  generated_by: string;
  sources: string[];
  join_strategy: string;
  ai_context: string;
  /** False if rapidfuzz wasn't installed when this report was generated — fuzzy name matching was disabled. */
  fuzzy_match_available?: boolean;
  earliest_shift_start?: string | null;
  latest_shift_end?: string | null;
  /** Raw GTT event-row count before grouping by employee (gtt_total is now the employee count). */
  gtt_event_rows_total?: number;
}

export interface ReconciliationReport {
  _meta: ReconciliationMeta;
  generated_at: string;
  functional_area: string;
  date: string;
  /** "gtt_verint" (default) or "verint_only" — set when GTT isn't available for this account. gtt_total/matched are always 0 in that mode. */
  source: "gtt_verint" | "verint_only";
  gtt_total: number;
  verint_total: number;
  matched: number;
  discrepancy_count: number;
  /** Sum of productive_minutes across all discrepancy rows — mirrors ProductiveHoursMeter's own reduce, computed once backend-side. */
  total_productive_minutes: number;
  intelligence: string[];
  /** The real-gap subset of `intelligence` (mismatch/ghost/absenteeism/OOA-severity) — for a report section that should only show what's worth acting on. */
  points_of_attention: string[];
  discrepancies: DiscrepancyRow[];
  /** Total occurrences of each GTT AUX event type across the whole raw pull (not deduped per employee). */
  gtt_event_type_counts: Record<string, number>;
  /** Per-hour aggregation across all captured agents, sorted ascending — feeds the peak-hour and attendance-evolution charts. */
  hourly_attendance: HourlyAttendanceBucket[];
}

// ---------------------------------------------------------------------------
// Adherence shift summary — rolled up client-side from the live CommandCard
// queue (lane "real-time-adherence"), since that data has no backend/
// persisted representation the way the GTT×Verint report does. See
// utils/adherenceSummary.ts.
// ---------------------------------------------------------------------------

export interface AdherenceOutcomeTotals {
  resolved: number;
  escalated: number;
  sent: number;
  suppressed: number;
  active: number;
}

export interface AdherenceLobBreakdown {
  lob: string;
  violationCount: number;
  avgAdherenceOutPercent: number | null;
}

export interface AdherenceTopOffender {
  agentName: string;
  lob: string;
  violationCount: number;
  worstAdherenceOutPercent: number | null;
}

export interface AdherenceSummary {
  totalViolations: number;
  byOutcome: AdherenceOutcomeTotals;
  perLob: AdherenceLobBreakdown[];
  topOffenders: AdherenceTopOffender[];
}

// Global report-generation schedule (one schedule for now, not per-account).
// "preset" spaces `timesPerDay` generations evenly across the shift window;
// "custom" fires at exact HH:mm times (in the report's configured tz).
export type ReportSchedule =
  | { mode: "off" }
  | { mode: "preset"; timesPerDay: 3 | 5 }
  | { mode: "custom"; times: string[] };

export interface ReportConfig {
  /** "gtt_verint" (default) or "verint_only" for accounts where GTT isn't available yet. */
  source: "gtt_verint" | "verint_only";
  functionalArea: string;
  sites: string;
  visibleColumns: (keyof DiscrepancyRow)[];
  recipients: string;
  schedule: ReportSchedule;
  /** Independent of `schedule` above (which drives report GENERATION) — this drives pushing an Attendance+Adherence digest to Google Chat every 30 min. */
  chatDigestEnabled: boolean;
}

export interface ReportHistoryEntry {
  date: string;
  gtt_total: number;
  verint_total: number;
  matched: number;
  discrepancy_count: number;
  intelligence: string[];
  generated_at: string;
}

export const DEFAULT_REPORT_CONFIG: ReportConfig = {
  source: "gtt_verint",
  functionalArea: "FA_Epic Games",
  sites: "SV - Antiguo Cuscatlan - Torre Emblema",
  visibleColumns: [
    "employee",
    "subgroup",
    "gtt_event",
    "verint_status",
    "adherence_pct",
    "ooa_seconds",
    "productive_minutes",
    "discrepancy_type",
  ],
  recipients: "",
  schedule: { mode: "off" },
  chatDigestEnabled: false,
};
