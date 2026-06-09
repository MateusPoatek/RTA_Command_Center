/**
 * shiftBriefing.ts
 * ----------------
 * Simulated previous-shift summary, current priorities, day forecast,
 * and message inbox shown in the ShiftStartModal.
 *
 * In production this would be assembled from:
 *  - Audit log of the prior shift
 *  - WFM forecast export
 *  - Google Chat / Teams webhook history
 *  - AI-generated shift summary
 */

export interface PrevShiftSummary {
  rta: string;
  date: string;
  alertsSent: number;
  escalations: number;
  aiHandledPct: number;
  openItems: string[];
  aiLearnedCount: number;
}

export interface CurrentPriority {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
}

export interface ForecastItem {
  time: string;
  event: string;
  type: "peak" | "report" | "coaching" | "info";
}

export interface InboxMessage {
  id: string;
  from: string;
  channel: "teams" | "gchat";
  time: string;
  text: string;
}

export interface ShiftReconciliation {
  scheduledAgents: number;
  presentAgents: number;
  absentAgents: string[];
  lobCoverageAdjusted: string[];
  aiAction: string;
}

export interface ShiftBriefing {
  prevShift: PrevShiftSummary;
  reconciliation: ShiftReconciliation;
  currentPriorities: CurrentPriority[];
  forecast: ForecastItem[];
  inbox: InboxMessage[];
}

export const shiftBriefing: ShiftBriefing = {
  prevShift: {
    rta: "Hector Solano",
    date: "Yesterday, 17:00–01:00",
    alertsSent: 18,
    escalations: 2,
    aiHandledPct: 71,
    openItems: [
      "Billing attendance report left in 'blocked' state — follow up with team lead",
      "Clara Mendoza exception form not yet submitted in ServiceNow",
    ],
    aiLearnedCount: 3,
  },
  reconciliation: {
    scheduledAgents: 34,
    presentAgents: 31,
    absentAgents: [
      "Clara Mendoza (late 15 min)",
      "Jose Martinez (absent unpaid)",
      "Nora Beltran (no-show)",
    ],
    lobCoverageAdjusted: ["TLB: −1 agent vs plan"],
    aiAction: "AI adjusted expected headcount and pre-flagged TLB coverage risk.",
  },
  currentPriorities: [
    {
      id: "cp-1",
      severity: "critical",
      title: "TLB SLA at 4% — line health RED",
      detail: "7 calls holding, longest 08:42. Restrict offline activity immediately.",
    },
    {
      id: "cp-2",
      severity: "high",
      title: "Diego Salazar — coaching overrun",
      detail: "Coaching for 32 min against 30 min threshold. Alert ready to send.",
    },
    {
      id: "cp-3",
      severity: "medium",
      title: "Attendance report due in 42 min",
      detail: "AI has the draft ready. Review and send before 10:30.",
    },
  ],
  forecast: [
    { time: "Now",   event: "TLB line health RED — restrict offline activity",              type: "peak" },
    { time: "10:00", event: "Peak volume expected — Monday morning pattern",                type: "peak" },
    { time: "10:30", event: "Attendance report due",                                        type: "report" },
    { time: "10:30", event: "Hugo Ramos coaching session",                               type: "coaching" },
    { time: "12:00", event: "Intraday attendance report",                                   type: "report" },
    { time: "14:00", event: "Volume expected to ease — offline activity window opens",      type: "info" },
  ],
  inbox: [
    {
      id: "msg-1",
      from: "Hector (Team Lead)",
      channel: "teams",
      time: "08:47",
      text: "Billing team heads up: planned system maintenance at 10:15. May impact queue briefly.",
    },
    {
      id: "msg-2",
      from: "Lorena (RTA Lead)",
      channel: "gchat",
      time: "08:52",
      text: "Ana is running 15 minutes late. Can you hold her exception until she logs in?",
    },
    {
      id: "msg-3",
      from: "RTA Escalation TLB",
      channel: "gchat",
      time: "08:55",
      text: "Previous alert received. We are managing. Please keep monitoring.",
    },
  ],
};
