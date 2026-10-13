// Three source systems, one join key (Workday ID). Shapes mirror what the
// POC already receives: the RTA Live Bridge roster (Verint), the GTT adapter
// rows (gtt_adapter.py GTTRow) and a Workday employee/exception record.
export type Source = "GTT" | "Verint" | "Workday";
export type Origin = "fixture" | "live";

/** One block on the Verint calendar: what was planned, or what actually happened. */
export interface Segment {
  label: string;
  start: number; // epoch ms
  end: number;
  work: boolean; // productive activity (Verint isWork); the exact definition is a contract decision
}

export interface VerintAgent {
  name: string;
  workdayId?: string; // the extension roster has no id today — joins fall back to name
  lob: string;
  scheduledActivity: string;
  actualActivity: string;
  ooaSeconds: number;
  adherencePct: number | null;
  scheduledStart?: number; // epoch ms, publishedSchedule
  scheduledEnd?: number;
  shiftStart?: number; // epoch ms, actualSchedule — undefined until the agent has started
  actualEnd?: number;  // epoch ms, end of the last CLOSED actual activity (Verint posts actuals in ~15-min blocks)
  productiveMin?: number;
  scheduleState?: "published" | "draft_only" | "none"; // extension >= 2026-10-09
  paidPlan?: Array<[number, number]>; // paid published slices, epoch ms (precedence-resolved, unpaid lunch removed)
  timeOff?: Array<[number, number]>;  // published time-off slices (planned absence)
  adherenceMin?: number; // minutes in adherence so far today (Verint adherenceSummary)
  ooaMinToday?: number;  // minutes out of adherence so far today
  /** Full-day published schedule and the actual timeline so far (Verint publishedSchedule / actualSchedule events). */
  planned?: Segment[];
  actual?: Segment[];
  capturedAt: number;
  origin: Origin;
}

export interface GttEvent {
  workdayId: string;
  employee: string;
  supervisor: string; // GTT's supervisor column = the team lead
  event: "clock_in" | "clock_out";
  at: number;
  origin?: Origin; // "live" = POST /api/gtt-events (local_api.py); fixture otherwise
}

export interface WorkdayRecord {
  workdayId: string;
  employee: string;
  supervisor: string;
  exception?: string; // approved absence today ("PTO", "Sick leave", "VTO (RTA)"...), if any
  trainee?: boolean; // training supervisory org — excluded from alerts and shrink (scorecard SOP)
}

export interface Data {
  verint: VerintAgent[];
  gtt: GttEvent[];
  workday: WorkdayRecord[];
  /** Who reports to which TL, from the last few days of GTT: today's GTT only knows agents who already clocked in. */
  directory?: Array<Pick<GttEvent, "workdayId" | "employee" | "supervisor">>;
}
