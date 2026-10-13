// Engineering reference: where every field comes from, what we compute from it,
// and which scorecard metrics it feeds. Single source for the "Data Sources" tab
// AND the standalone page (scripts/export-lineage.tsx). Examples are synthetic — no PII.
// Paths are relative to the repo root.

export type Src = "GTT" | "Workday via GTT" | "Verint extension" | "Derived";

export interface Field {
  name: string;
  src: Src;
  col?: number | string; // GTT post-mortem report column index
  example: string;
  parsedAt: string; // file:line, or "not parsed yet"
  feeds: string[]; // scorecard metrics / board rules that use it
  note?: string;
  inferred?: boolean; // origin is the usual HR-master path, not documented in the repo
}

const GA = "POC_Redefined/gtt_adapter.py";
const PJ = "POC_Redefined/verint_extension/parse.js";
const RC = "POC_Redefined/gtt_verint_reconciler.py";

export const FIELDS: Field[] = [
  // GTT — Google Global Time Tracker, post-mortem report (22 columns per row)
  { name: "site", src: "GTT", col: 0, example: "SV - Santa Tecla", parsedAt: `${GA}:124`, feeds: ["Onsite vs WFH attribution (candidate)"], note: "May be a Workday location; unverified." },
  { name: "subgroup", src: "GTT", col: 6, example: "Epic Games", parsedAt: `${GA}:130`, feeds: ["LOB grouping"], note: "GTT's LOB label — not the Verint LOB." },
  { name: "aux (event_type)", src: "GTT", col: 7, example: "break-1", parsedAt: `${GA}:130`, feeds: ["A1 not clocked in", "A4 not clocked out", "In-office shrink (8 SOP categories)", "Total Shrink"], note: "16 types seen live: clock_in, clock_out, productivity, break-1, break-2, lunch, personal-time, team-meeting, training-client, daily-communications…" },
  { name: "start date / time (request tz)", src: "GTT", col: "8–9", example: "2026-10-09 05:45:15", parsedAt: `${GA}:131`, feeds: ["Shift start (report)", "Lateness → Absenteeism"], note: "In the request's timezone, not always Eastern." },
  { name: "end date / time", src: "GTT", col: "10–11", example: "2026-10-09 06:00:17", parsedAt: "not parsed yet", feeds: ["Aux durations → in-office shrink"] },
  { name: "duration", src: "GTT", col: 12, example: "00:15:02", parsedAt: "not parsed yet", feeds: ["Aux minutes → Nonbillable Loss %, Total Shrink"], note: "Was misread as the UTC date until 2026-10-09." },
  { name: "ip", src: "GTT", col: 13, example: "10.x.x.x", parsedAt: "not parsed", feeds: [] },
  { name: "comment", src: "GTT", col: 14, example: "Start of the shift", parsedAt: "not parsed", feeds: [] },
  { name: "timezone label", src: "GTT", col: 16, example: "Central America", parsedAt: "not parsed", feeds: [] },
  { name: "start/end date+time UTC", src: "GTT", col: "17–20", example: "2026-10-09 11:45:15", parsedAt: `${GA}:36-37`, feeds: ["Cross-timezone joins with Verint"], note: "Constants fixed 12/13 → 17/18 on 2026-10-09 (test: POC_Redefined/tests/test_gtt_adapter.py)." },
  { name: "startoftimeblock", src: "GTT", col: 21, example: "1760010315782", parsedAt: "not parsed", feeds: [], note: "Epoch ms — the cleanest timestamp in the row." },

  // Workday via GTT — HR master columns GTT carries on every row
  { name: "workdayId", src: "Workday via GTT", col: 2, example: "10000001", parsedAt: `${GA}:126`, feeds: ["Canonical join key", "Assigned/Enabled TM cross-check"], note: "BRD DR-003. The ONLY Workday-documented column; the Verint side has no id yet." },
  { name: "email", src: "Workday via GTT", col: 1, example: "agent@example.com", parsedAt: `${GA}:125`, feeds: [], inferred: true, note: "PII — do not log." },
  { name: "employee", src: "Workday via GTT", col: 3, example: "Luis Ramos Diaz", parsedAt: `${GA}:127`, feeds: ["Name join fallback"], inferred: true, note: "\"Firstname Surname(s)\" — Verint uses \"Surname(s), Firstname\"." },
  { name: "supervisor", src: "Workday via GTT", col: 4, example: "Ana Morales", parsedAt: `${GA}:128`, feeds: ["Alert routing (agent's TL)"], inferred: true },
  { name: "costcenter", src: "Workday via GTT", col: 5, example: "CC-700-GOPS", parsedAt: `${GA}:129`, feeds: ["Account / master-list join"], inferred: true },
  { name: "wdExportStatus", src: "Workday via GTT", col: 15, example: "pending", parsedAt: "not parsed", feeds: [], note: "Direction is GTT → Workday (time export back), not Workday → GTT." },

  // Verint — RTA browser extension intercepts calendar-filter responses
  { name: "name", src: "Verint extension", example: "Ramos Diaz, Luis", parsedAt: `${PJ}:41-63`, feeds: ["Join to GTT (surname / fuzzy)"], note: "Verint's numeric id is dropped; agent_id = sha1(name:lob:geo)[:12]." },
  { name: "scheduled_activity / actual_activity", src: "Verint extension", example: "EPIC_New ticket / Lunch", parsedAt: `${PJ}:389-419`, feeds: ["A2 out of adherence", "A3 break overrun", "A6 unmapped activity"] },
  { name: "out_of_adherence (ooa_seconds)", src: "Verint extension", example: "1145", parsedAt: `${PJ}:406`, feeds: ["A2 severity"] },
  { name: "days_adherence (adherence_pct)", src: "Verint extension", example: "73.0", parsedAt: `${PJ}:179-193`, feeds: ["LOB adherence (report)"] },
  { name: "adherence_minutes / ooa_minutes", src: "Verint extension", example: "131 / 48", parsedAt: `${PJ}:191`, feeds: ["Adherence split"] },
  { name: "scheduled_shift_start / end", src: "Verint extension", example: "ISO 8601", parsedAt: `${PJ}:238-250`, feeds: ["A1 / A4 timing", "Base scheduled minutes → Scheduled/Attended Loss %, Total Shrink, Absenteeism"], note: "Priority #1 for the scorecard: published schedule = Base_Sched." },
  { name: "shift_start / end (actual)", src: "Verint extension", example: "ISO 8601", parsedAt: `${PJ}:205-229`, feeds: ["Shift start corroboration"] },
  { name: "productive_paid / work_minutes", src: "Verint extension", example: "178", parsedAt: `${PJ}:216-220`, feeds: ["Productive hours", "Billable minutes (proxy only)"], note: "isPaid vs isWork — the contractual definition is still open." },
  { name: "planned / actual segments", src: "Verint extension", example: "[{label, start, end, work}]", parsedAt: "RTA_Board_V2/src/data/types.ts:8", feeds: ["Planned-vs-actual timeline", "A3 break overrun", "Repetition bump"] },
  { name: "next_activity (+start)", src: "Verint extension", example: "Break @ 10:00", parsedAt: `${PJ}:256-265`, feeds: ["Proactive alerts (not in v1)"] },

  // Derived — computed by us, never read from a source
  { name: "discrepancy_type", src: "Derived", example: "no_clock_in_no_activity", parsedAt: `${RC}:324-412`, feeds: ["Attendance report", "Absenteeism"] },
  { name: "scheduled_minutes", src: "Derived", example: "480", parsedAt: `${RC}:233-242`, feeds: ["Base_Sched (per agent-day)"] },
  { name: "productive (planned ∧ actual match)", src: "Derived", example: "127", parsedAt: "RTA_Board_V2/src/domain/timeline.ts:22", feeds: ["Report productive cell"] },
  { name: "alert (kind, sev)", src: "Derived", example: "ooa · Sev 1", parsedAt: "RTA_Board_V2/src/domain/exceptions.ts", feeds: ["RTA Board"] },
];

export interface Formula { name: string; formula: string; inputs: string; at: string; doc?: string; status?: "target" | "fixed" }

export const FORMULAS: Formula[] = [
  { name: "Adherence %", formula: "round((Σ published − Σ violation) / Σ published × 100), clamped 0–100", inputs: "Verint publishedSchedule, adherence violations", at: `${PJ}:179-193` },
  { name: "Productive minutes (Verint)", formula: "Σ durationMinutes where isPaid   (alt: where isWork)", inputs: "Verint actualSchedule events", at: `${PJ}:205-220`, doc: "Contract definition open ([02] §11.2)" },
  { name: "Productive minutes (planned vs actual)", formula: "Σ minutes where actual.label = planned.label AND planned.work", inputs: "Verint planned + actual segments", at: "RTA_Board_V2/src/domain/timeline.ts:22" },
  { name: "Scheduled minutes", formula: "published shift end − published shift start", inputs: "Verint scheduled_shift_start/end", at: `${RC}:233-242` },
  { name: "GTT ↔ Verint join", formula: "workday_id when present; else exact surname, first candidate; else rapidfuzz token_set_ratio ≥ 85", inputs: "GTT employee/workdayId, Verint name", at: `${RC}:264-310`, doc: "Workday ID is the target key (BRD DR-003); same-surname collisions are a known risk" },
  { name: "Discrepancy type", formula: "matched → match_ok | clocked_out_still_active;  GTT only → clocked_in_not_in_adherence;  Verint only → not_yet_scheduled | in_adherence_no_clock_in | no_clock_in_no_activity", inputs: "Join result, clock events, Verint activity", at: `${RC}:324-412`, doc: "POC_Redefined/docs/REPORT_SCHEMA.md" },
  { name: "Absenteeism %", formula: "no_clock_in_no_activity ÷ (Verint agents − not_yet_scheduled) × 100", inputs: "discrepancy_type", at: "POC_Redefined/report_intelligence.py:~170 · RTA_Board_V2 src/reports/ReportChartsPanel.tsx AbsenteeismStat", status: "fixed", doc: "Fixed 2026-10-09: previously counted GTT-clocked-in agents as absent (EPIC 09-09: 37.2% → 42.4%)" },
  { name: "Shift start agreement", formula: "|GTT clock_in − Verint first actual event| ≤ 10 min → ok, else conflict", inputs: "GTT clock_in, Verint shift_start", at: "RTA_Board_V2/src/domain/report.ts" },
  { name: "Report confidence", formula: "ok cells ÷ non-pending cells", inputs: "Provenance status per cell", at: "RTA_Board_V2/src/domain/report.ts" },
  { name: "Alert severity", formula: "A1–A6 thresholds, repetition bump, LOB incident", inputs: "All of the above", at: "RTA_Board_V2/src/domain/exceptions.ts", doc: "RTA_Board_V2/docs/ALERT_RULES.md" },
  { name: "Total Shrink (scorecard)", formula: "(PlannedAbs + UnplannedAbs + AdminAbs + billable + non-billable online shrink) ÷ Base_Sched_Mins", inputs: "Verint schedule, GTT×Verint absence, aux minutes", at: "BigQuery vw_wfm_combined_v2_Targets", status: "target", doc: "WFM Weekly Scorecard SOP" },
  { name: "Absenteeism (scorecard)", formula: "UnplannedAbs ÷ (Onsite + WFH Base_Sched)", inputs: "GTT×Verint unplanned absence, Verint schedule", at: "BigQuery vw_wfm_combined_v2_Targets", status: "target", doc: "WFM Weekly Scorecard SOP" },
  { name: "Scheduled / Attended Loss % (scorecard)", formula: "(Prod_FTE − Sched_FTE) ÷ Assigned_FTE ;  (Sched_FTE − Attended_FTE) ÷ Assigned_FTE,  FTE = mins / 60 / 40", inputs: "Workday FTE + Verint schedule + absence", at: "BigQuery", status: "target", doc: "WFM Weekly Scorecard SOP" },
];

export interface Priority { rank: number; what: string; from: string; unlocks: string; effort: string; blocker: string }

export const PRIORITIES: Priority[] = [
  { rank: 1, what: "Base scheduled minutes", from: "Verint publishedSchedule", unlocks: "~7 · Scheduled/Attended/Billable Loss %, Total Shrink, Absenteeism, Onsite, Remote", effort: "M", blocker: "Non-40h normalisation; trainee flag" },
  { rank: 2, what: "Unplanned absence minutes", from: "GTT × Verint (reconciler)", unlocks: "~7 · Absenteeism ×3, Attended Loss %, Total Shrink, Billable Loss %", effort: "M", blocker: "Partial-shift minutes; Workday ID join" },
  { rank: 3, what: "In-office aux minutes", from: "GTT aux + duration, Verint activities", unlocks: "~7 · Online shrink, Nonbillable Loss %, Total Shrink", effort: "M / L", blocker: "Billable split needs the SOW billability map" },
  { rank: 4, what: "Productive / billable minutes", from: "Verint actualSchedule", unlocks: "~10 · Payable FTE, Billable Hours, Staffing Loss %, B2B…", effort: "L", blocker: "Proxy only — never feed invoicing" },
  { rank: 5, what: "Planned absence + schedule publish date", from: "Verint draft/approvals", unlocks: "~3 · planned vs unplanned split", effort: "L", blocker: "Publish date not captured anywhere" },
  { rank: 6, what: "Onsite vs WFH", from: "GTT site (candidate)", unlocks: "~3 · Onsite / Remote absenteeism", effort: "M", blocker: "Unverified" },
  { rank: 7, what: "Workday fields via GTT", from: "GTT cols 2–5", unlocks: "0 new · join key + head-count cross-check", effort: "S", blocker: "—" },
];

export const DOCS: Array<{ title: string; path: string }> = [
  { title: "GTT 22-column schema (authoritative)", path: "POC_Redefined/GTT_JSON/CR Function - GTT Post Morten Report.docx" },
  { title: "GTT × Verint capture findings & roadmap", path: "POC_Redefined/Product_and_Architecture_docs/GTT_VERINT_CAPTURE_FINDINGS_AND_ROADMAP.md" },
  { title: "Data lineage diagram (archify)", path: "POC_Redefined/Product_and_Architecture_docs/gtt-verint-data-lineage.html" },
  { title: "Scorecard data priorities", path: "POC_Redefined/Product_and_Architecture_docs/SCORECARD_DATA_PRIORITIES.md" },
  { title: "Alert rules v1", path: "RTA_Board_V2/docs/ALERT_RULES.md" },
  { title: "Report schema", path: "POC_Redefined/docs/REPORT_SCHEMA.md" },
  { title: "Attendance process", path: "POC_Redefined/docs/ATTENDANCE_PROCESS.md" },
  { title: "Verint extraction capabilities", path: "POC_Redefined/floor_view/docs/VERINT_EXTRACTION_CAPABILITIES.md" },
  { title: "BRD Phase 1 (DR-003 Workday ID key)", path: "POC_Redefined/KPIs_BRD/Draft Reviewed 04_08_2026 - BRD_RTA_Command_Center_Phase1.md" },
];
