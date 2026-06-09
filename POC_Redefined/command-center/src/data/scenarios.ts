/**
 * scenarios.ts
 * ------------
 * Four simulation scenarios for the CIBC RTA POC demo.
 *
 * Each scenario bundles:
 *  - CommandCards (populate the kanban board)
 *  - Attendance reports (morning, intraday, final emails)
 *  - Dispatch log (which alerts went to which Google Chat channels)
 *  - Escalation report (agents who required supervisor / OM tagging)
 *  - Shrinkage summary
 *  - Staffing forecast
 *  - Shift handoff document
 *
 * Scenarios:
 *  A — Steady State   : normal shift, minor violations, clean close
 *  B — Queue Spike    : RED/BLUE line health, multiple escalations
 *  C — Attendance Crisis: high absenteeism, below-70% anomaly
 *  D — Tech Outage    : Fraud ITR system failure, SNOW ticket, SLA drop
 */

import type { Scenario } from "../domain/scenario_types";
import { scenarioEpic } from "./scenarios_epic";

// ---------------------------------------------------------------------------
// SCENARIO A — Steady State
// ---------------------------------------------------------------------------

const scenarioA: Scenario = {
  id: "A",
  label: "Steady State",
  theme: "Normal shift — minor violations, clean resolution, no escalations.",
  description:
    "A representative quiet shift. 3 alerts fire at T+0, all resolve within the next cycle. Attendance is strong. The system produces the morning email, two intraday reports, and a clean handoff automatically — freeing ~45 min of RTA time.",
  lineHealthSummary: "All LOBs GREEN — offline activities available",

  cards: [
    {
      id: "sc-a-rt-001",
      lane: "real-time-adherence",
      type: "alert",
      title: "INBD 10:30 — Clara Mendoza (TLB)",
      summary: "Clara Mendoza (TLB) in INBD - Inbound for 10:30 — exceeds 9-minute threshold.",
      owner: "shared",
      status: "needs-review",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario A · Cycle 1 · rule: time_limit_inbd_inbound", detail: "Synthetic Verint snapshot — swap adapter for live feed." },
      confidence: 0.91,
      lob: "TLB",
      geo: "Guatemala",
      agent: { name: "Clara Mendoza", id: "GT-TLB-004", lob: "TLB", geo: "Guatemala", currentStatus: "INBD - Inbound", scheduledActivity: "BLEN - Blended", adherenceInPercent: 89, adherenceOutPercent: 11, coachingSessionsThisWeek: 0, huddlesThisWeek: 1, openTickets: 0, recommendedAction: "Alert LOB channel. Monitor — may be a complex customer issue.", schedulePreview: ["Today: Blended, Break, Lunch", "Tomorrow: Blended"] },
      rule: { id: "time_limit_inbd_inbound", description: "INBD - Inbound over 9 min", threshold: "9 min" },
      recommendedAction: "Review and send alert to RTA Escalation TLB if no known exception.",
      availableActions: ["approve-send", "edit-message", "suppress", "add-to-handoff", "ask-ai-why"],
      targetChannels: ["google-chat-lob", "supervisor", "audit-only"],
      selectedChannel: "google-chat-lob",
      draftMessage: "TLB alert: Clara Mendoza — INBD - Inbound 10:30 (scheduled: BLEN - Blended). Please check.",
      auditEvents: [{ id: "sc-a-audit-001", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Rule: time_limit_inbd_inbound | Duration: 630s | Cycle 1", dataClass: "simulated" }],
    },
    {
      id: "sc-a-rt-002",
      lane: "real-time-adherence",
      type: "alert",
      title: "CallOnHold 03:15 — Hugo Ramos (Costco)",
      summary: "Hugo Ramos (Costco) has a customer on CallOnHold for 03:15 — exceeds 3-minute threshold.",
      owner: "shared",
      status: "needs-review",
      severity: "medium",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario A · Cycle 1 · rule: time_limit_callonhold", detail: "Synthetic Verint snapshot." },
      confidence: 0.91,
      lob: "Costco",
      geo: "Guatemala",
      agent: { name: "Hugo Ramos", id: "GT-COS-003", lob: "Costco", geo: "Guatemala", currentStatus: "CallOnHold", scheduledActivity: "BLEN - Blended", adherenceInPercent: 91, adherenceOutPercent: 9, coachingSessionsThisWeek: 0, huddlesThisWeek: 0, openTickets: 0, recommendedAction: "Alert LOB channel.", schedulePreview: ["Today: Blended, Break, Lunch"] },
      rule: { id: "time_limit_callonhold", description: "CallOnHold over 3 min", threshold: "3 min" },
      recommendedAction: "Review and send alert to CBC Costco TDPH WFM.",
      availableActions: ["approve-send", "edit-message", "suppress", "ask-ai-why"],
      targetChannels: ["google-chat-lob", "supervisor", "audit-only"],
      selectedChannel: "google-chat-lob",
      draftMessage: "Costco alert: Hugo Ramos — CallOnHold 03:15 (scheduled: BLEN - Blended). Please check.",
      auditEvents: [{ id: "sc-a-audit-002", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Rule: time_limit_callonhold | Duration: 195s | Cycle 1", dataClass: "simulated" }],
    },
    {
      id: "sc-a-rt-003",
      lane: "real-time-adherence",
      type: "alert",
      title: "ACW 03:30 — Nora Beltran (Cards)",
      summary: "Nora Beltran (Cards) in After Call Work for 03:30 — exceeds 3-minute threshold.",
      owner: "shared",
      status: "needs-review",
      severity: "medium",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario A · Cycle 1 · rule: time_limit_after_call_work", detail: "Synthetic Verint snapshot." },
      confidence: 0.91,
      lob: "Cards",
      geo: "Guatemala",
      agent: { name: "Nora Beltran", id: "GT-CAR-004", lob: "Cards", geo: "Guatemala", currentStatus: "After Call Work", scheduledActivity: "BLEN - Blended", adherenceInPercent: 88, adherenceOutPercent: 12, coachingSessionsThisWeek: 0, huddlesThisWeek: 0, openTickets: 0, recommendedAction: "Alert LOB channel.", schedulePreview: ["Today: Blended, Break, Lunch"] },
      rule: { id: "time_limit_after_call_work", description: "After Call Work over 3 min", threshold: "3 min" },
      recommendedAction: "Review and send alert to CBC Cards M Staff Team.",
      availableActions: ["approve-send", "edit-message", "suppress", "ask-ai-why"],
      targetChannels: ["google-chat-lob", "supervisor", "audit-only"],
      selectedChannel: "google-chat-lob",
      draftMessage: "Cards alert: Nora Beltran — After Call Work 03:30 (scheduled: BLEN - Blended). Please check.",
      auditEvents: [{ id: "sc-a-audit-003", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Rule: time_limit_after_call_work | Duration: 210s | Cycle 1", dataClass: "simulated" }],
    },
    {
      id: "sc-a-att-001",
      lane: "attendance-reporting",
      type: "report",
      title: "Morning report sent ✓",
      summary: "Attendance 94% · Absenteeism 4% · 0 anomalies. Email dispatched to operations distribution list.",
      owner: "ai",
      status: "sent",
      severity: "info",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario A · Morning cycle · GTT + Workday", detail: "Attendance data sourced from synthetic GTT export." },
      recommendedAction: "No action needed. Next report in ~3 hours.",
      availableActions: ["add-to-handoff"],
      targetChannels: ["audit-only"],
      draftMessage: "Morning attendance report sent to operations distribution list. Attendance 94%, no anomalies.",
      auditEvents: [{ id: "sc-a-audit-att-001", timestamp: "2026-04-29T09:15:00-06:00", actor: "ai", action: "Report sent", detail: "Morning attendance email dispatched.", dataClass: "simulated" }],
    },
    {
      id: "sc-a-handoff-001",
      lane: "shift-handoff",
      type: "task",
      title: "Shift handoff ready",
      summary: "All alerts resolved. 0 open tickets. EOD findings documented for senior RTA.",
      owner: "rta",
      status: "classified",
      severity: "low",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario A · Shift end", detail: "Auto-generated from resolved card state." },
      recommendedAction: "Review findings and send handoff message to incoming RTA.",
      availableActions: ["generate-report", "add-to-handoff"],
      targetChannels: ["handoff", "senior-rta"],
      draftMessage: "Clean shift. All 3 alerts resolved by cycle 2. Attendance 94%. No open tickets. Incoming RTA: no outstanding items.",
      auditEvents: [],
    },
  ],

  reports: {
    attendanceReports: [
      {
        id: "sc-a-att-morning",
        reportTime: "2026-04-29T09:15:00-06:00",
        cycleLabel: "Morning",
        attendancePct: 94,
        absenteeismPct: 4,
        latenessPct: 2,
        latenessMinutes: 8,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Attendance Report — Guatemala — 2026-04-29 09:00",
        emailBody: `Hi Operations Team,

Morning attendance summary — CIBC Guatemala (09:00 cycle):

  Attendance:       94%  (47 / 50 agents)
  Absenteeism:       4%  (2 no-shows)
  Lateness:          2%  (1 agent — 8 min late)
  Lateness Min:      8 min

Status: ✅ Normal — all numbers within expected range.
No anomalies to report. Intraday monitoring is active.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-a-att-midday",
        reportTime: "2026-04-29T12:15:00-06:00",
        cycleLabel: "Midday",
        attendancePct: 96,
        absenteeismPct: 4,
        latenessPct: 0,
        latenessMinutes: 0,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Attendance Report — Guatemala — 2026-04-29 12:00",
        emailBody: `Hi Operations Team,

Midday attendance update — CIBC Guatemala (12:00 cycle):

  Attendance:       96%  (48 / 50 agents)
  Absenteeism:       4%  (2 no-shows — unchanged from morning)
  Lateness:          0%  (no new late arrivals)
  Lateness Min:      0 min

Status: ✅ Normal — attendance stable. Monitoring active.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-a-att-final",
        reportTime: "2026-04-29T16:45:00-06:00",
        cycleLabel: "Final",
        attendancePct: 96,
        absenteeismPct: 4,
        latenessPct: 2,
        latenessMinutes: 8,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Final Attendance Report — Guatemala — 2026-04-29",
        emailBody: `Hi Operations Team,

End-of-shift attendance summary — CIBC Guatemala (Final):

  Attendance:       96%  (48 / 50 agents)
  Absenteeism:       4%  (2 no-shows — no recovery)
  Lateness:          2%  (1 agent — 8 min)
  Lateness Min:      8 min
  Shrinkage:        11%  (within target)

Status: ✅ Clean shift. No anomalies. Handoff ready.

EOD Findings (for Senior RTA):
  • 3 RT adherence alerts fired; all resolved within 1 cycle
  • No persistent violations; no escalations required
  • LOB health GREEN throughout shift

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
    ],

    dispatchLog: [
      { id: "sc-a-dl-001", timestamp: "2026-04-29T13:00:12-06:00", cycle: 1, agent: "Clara Mendoza", lob: "TLB", channel: "RTA Escalation TLB", message: "TLB alert: Clara Mendoza — INBD - Inbound 10:30 (scheduled: BLEN - Blended). Please check.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-a-dl-002", timestamp: "2026-04-29T13:00:14-06:00", cycle: 1, agent: "Hugo Ramos", lob: "Costco", channel: "CBC Costco TDPH WFM", message: "Costco alert: Hugo Ramos — CallOnHold 03:15 (scheduled: BLEN - Blended). Please check.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-a-dl-003", timestamp: "2026-04-29T13:00:16-06:00", cycle: 1, agent: "Nora Beltran", lob: "Cards", channel: "CBC Cards M Staff Team", message: "Cards alert: Nora Beltran — After Call Work 03:30 (scheduled: BLEN - Blended). Please check.", escalationLevel: "first-alert", status: "sent" },
    ],

    escalations: [],

    shrinkage: [
      { category: "Lunch", minutes: 450, pct: 5.6, icon: "🍽" },
      { category: "Break (Paid)", minutes: 300, pct: 3.8, icon: "☕" },
      { category: "Coaching", minutes: 90, pct: 1.1, icon: "🎓" },
      { category: "Meeting / Huddle", minutes: 30, pct: 0.4, icon: "📋" },
      { category: "TIG Offline", minutes: 0, pct: 0.0, icon: "💻" },
    ],

    forecast: [
      { time: "09:00", required: 45, available: 47, delta: 2, health: "GREEN" },
      { time: "10:00", required: 48, available: 48, delta: 0, health: "GREEN" },
      { time: "11:00", required: 50, available: 48, delta: -2, health: "YELLOW" },
      { time: "12:00", required: 44, available: 48, delta: 4, health: "GREEN" },
      { time: "13:00", required: 46, available: 47, delta: 1, health: "GREEN" },
      { time: "14:00", required: 47, available: 47, delta: 0, health: "GREEN" },
      { time: "15:00", required: 43, available: 45, delta: 2, health: "GREEN" },
      { time: "16:00", required: 40, available: 44, delta: 4, health: "GREEN" },
    ],

    handoff: {
      outgoingRTA: "Bruno Castillo",
      shiftDate: "2026-04-29",
      shiftHours: "09:00 – 17:00 GT",
      openAlerts: 0,
      openTickets: 0,
      eodFindings: [
        "3 RT adherence alerts fired — all resolved by next cycle, no escalations",
        "Attendance 96% — 2 no-shows, no pattern",
        "LOB health GREEN throughout the full shift",
        "No outages, no SNOW tickets, no coaching overruns",
      ],
      handoffMessage: "Clean shift. All alerts resolved. Incoming RTA: no outstanding items. Standard monitoring only.",
      incomingRTANote: "Nothing to action. Begin standard 15-min scan cycle from shift start.",
    },
  },
};

// ---------------------------------------------------------------------------
// SCENARIO B — Queue Spike
// ---------------------------------------------------------------------------

const scenarioB: Scenario = {
  id: "B",
  label: "Queue Spike",
  theme: "RED / BLUE line health, multiple escalations, coaching blocked.",
  description:
    "A high-pressure period: TLB goes RED, Fraud ITR hits BLUE. 7 alerts fire at T+0 and 3 persist to cycle 2, triggering supervisor escalations. The system auto-drafts coaching restrictions and routes escalation messages — replacing ~2 hours of reactive manual work.",
  lineHealthSummary: "TLB: RED — Fraud ITR: BLUE — Costco: YELLOW",

  cards: [
    {
      id: "sc-b-rt-001",
      lane: "real-time-adherence",
      type: "alert",
      title: "INBD 14:20 — Diego Salazar (TLB)",
      summary: "Diego Salazar (TLB) in INBD - Inbound for 14:20 — second consecutive cycle. Supervisor tag required.",
      owner: "shared",
      status: "classified",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario B · Cycle 2 · persistence", detail: "Persisted from cycle 1." },
      confidence: 0.91,
      lob: "TLB",
      geo: "Guatemala",
      agent: { name: "Diego Salazar", id: "GT-TLB-003", lob: "TLB", geo: "Guatemala", currentStatus: "INBD - Inbound", scheduledActivity: "BLEN - Blended", adherenceInPercent: 67, adherenceOutPercent: 33, coachingSessionsThisWeek: 1, huddlesThisWeek: 1, openTickets: 0, recommendedAction: "Tag supervisor — second cycle on same violation.", schedulePreview: ["Today: Blended, Break, Lunch"] },
      rule: { id: "time_limit_inbd_inbound", description: "INBD - Inbound over 9 min", threshold: "9 min" },
      recommendedAction: "Persistent violation (2nd cycle): tag supervisor in follow-up.",
      availableActions: ["approve-send", "escalate-om", "edit-message", "suppress", "add-to-handoff"],
      targetChannels: ["google-chat-lob", "supervisor", "om", "handoff"],
      selectedChannel: "google-chat-lob",
      draftMessage: "@supervisor TLB follow-up: Diego Salazar — still in INBD - Inbound 14:20. Second consecutive cycle. Intervention needed.",
      auditEvents: [
        { id: "sc-b-audit-diego-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Cycle 1 — INBD 9:45 over threshold", dataClass: "simulated" },
        { id: "sc-b-audit-diego-2", timestamp: "2026-04-29T13:15:00-06:00", actor: "system", action: "Persistence detected: cycle 2", detail: "Same violation in consecutive 15-min cycle. Escalation triggered.", dataClass: "simulated" },
      ],
    },
    {
      id: "sc-b-rt-002",
      lane: "real-time-adherence",
      type: "escalation",
      title: "COAC 47:00 — Felipe Cordero (Fraud ITR)",
      summary: "Felipe Cordero (Fraud ITR) in COAC - Coaching for 47:00 — third consecutive cycle. OM + Senior RTA required.",
      owner: "shared",
      status: "escalated",
      severity: "critical",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario B · Cycle 3 · escalation", detail: "3+ cycles same violation." },
      confidence: 0.91,
      lob: "Fraud ITR",
      geo: "Guatemala",
      agent: { name: "Felipe Cordero", id: "GT-FRD-001", lob: "Fraud ITR", geo: "Guatemala", currentStatus: "COAC - Coaching", scheduledActivity: "BLEN - Blended", adherenceInPercent: 51, adherenceOutPercent: 49, coachingSessionsThisWeek: 1, huddlesThisWeek: 0, openTickets: 1, recommendedAction: "Escalate to OM. Document in EOD findings.", schedulePreview: ["Today: Blended, Coaching, Lunch"] },
      rule: { id: "time_limit_coac_coaching", description: "COAC - Coaching over 30 min", threshold: "30 min" },
      recommendedAction: "Escalate to Operations Manager. Document in EOD findings for senior RTA review.",
      availableActions: ["escalate-om", "add-to-handoff", "mark-resolved"],
      targetChannels: ["om", "senior-rta", "handoff", "audit-only"],
      selectedChannel: "om",
      draftMessage: "@operations_manager ESCALATION Fraud ITR: Felipe Cordero — COAC - Coaching 47:00. 3 consecutive cycles. Senior RTA may need to review.",
      auditEvents: [
        { id: "sc-b-audit-felipe-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Cycle 1 — COAC 32:00 over threshold", dataClass: "simulated" },
        { id: "sc-b-audit-felipe-2", timestamp: "2026-04-29T13:15:00-06:00", actor: "system", action: "Persistence: cycle 2", detail: "@supervisor tagged", dataClass: "simulated" },
        { id: "sc-b-audit-felipe-3", timestamp: "2026-04-29T13:30:00-06:00", actor: "system", action: "Persistence: cycle 3", detail: "OM escalation triggered", dataClass: "simulated" },
      ],
    },
    {
      id: "sc-b-rt-003",
      lane: "real-time-adherence",
      type: "alert",
      title: "CallOnHold 04:55 — Gabriela Luna (TLB)",
      summary: "Gabriela Luna (TLB) on CallOnHold for 04:55 — exceeds 3-minute threshold during RED line health period.",
      owner: "shared",
      status: "needs-review",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario B · Cycle 1", detail: "Hold during RED line health amplifies SL risk." },
      confidence: 0.91,
      lob: "TLB",
      geo: "Guatemala",
      agent: { name: "Gabriela Luna", id: "GT-TLB-001", lob: "TLB", geo: "Guatemala", currentStatus: "CallOnHold", scheduledActivity: "BLEN - Blended", adherenceInPercent: 74, adherenceOutPercent: 26, coachingSessionsThisWeek: 0, huddlesThisWeek: 1, openTickets: 0, recommendedAction: "Alert LOB channel. Urgent given RED line health.", schedulePreview: ["Today: Blended, Break, Lunch"] },
      rule: { id: "time_limit_callonhold", description: "CallOnHold over 3 min", threshold: "3 min" },
      recommendedAction: "Immediate alert — TLB is in RED. Every agent off call worsens SLA.",
      availableActions: ["approve-send", "escalate-supervisor", "edit-message", "suppress"],
      targetChannels: ["google-chat-lob", "supervisor"],
      selectedChannel: "google-chat-lob",
      draftMessage: "TLB alert: Gabriela Luna — CallOnHold 04:55 (scheduled: BLEN - Blended). Please check. ⚠️ TLB is in RED line health.",
      auditEvents: [{ id: "sc-b-audit-gabriela", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Hold during RED line health.", dataClass: "simulated" }],
    },
    {
      id: "sc-b-rt-004",
      lane: "real-time-adherence",
      type: "alert",
      title: "TIG 04:30 — Renata Solis (Costco)",
      summary: "Renata Solis (Costco) in NOT READY - TIG Offline for 04:30 — second cycle.",
      owner: "shared",
      status: "classified",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario B · Cycle 2 · persistence", detail: "Second cycle." },
      confidence: 0.91,
      lob: "Costco",
      geo: "Guatemala",
      agent: { name: "Renata Solis", id: "GT-COS-004", lob: "Costco", geo: "Guatemala", currentStatus: "NOT READY - TIG Offline", scheduledActivity: "BLEN - Blended", adherenceInPercent: 61, adherenceOutPercent: 39, coachingSessionsThisWeek: 0, huddlesThisWeek: 0, openTickets: 0, recommendedAction: "Tag supervisor — second cycle.", schedulePreview: ["Today: Blended, Break, Lunch"] },
      rule: { id: "time_limit_not_ready___tig_offline", description: "TIG Offline over 2 min", threshold: "2 min" },
      recommendedAction: "Persistent TIG Offline — tag supervisor.",
      availableActions: ["approve-send", "escalate-om", "suppress", "add-to-handoff"],
      targetChannels: ["google-chat-lob", "supervisor", "om", "handoff"],
      selectedChannel: "google-chat-lob",
      draftMessage: "@supervisor Costco follow-up: Renata Solis — still in NOT READY - TIG Offline 04:30. Second consecutive cycle. Intervention needed.",
      auditEvents: [
        { id: "sc-b-audit-renata-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Card created", detail: "Cycle 1", dataClass: "simulated" },
        { id: "sc-b-audit-renata-2", timestamp: "2026-04-29T13:15:00-06:00", actor: "system", action: "Persistence: cycle 2", detail: "@supervisor tagged", dataClass: "simulated" },
      ],
    },
    {
      id: "sc-b-lob-001",
      lane: "lob-health",
      type: "alert",
      title: "TLB — RED line health",
      summary: "TLB SLA at 12%. 9 calls holding. Longest queue call: 09:42. All offline activity cancelled.",
      owner: "ai",
      status: "classified",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Scenario B · TLB line health", detail: "SLA below threshold triggers automatic offline restriction." },
      lob: "TLB",
      geo: "Guatemala",
      recommendedAction: "Cancel all offline activity. Notify TLB supervisors. All hands on deck.",
      availableActions: ["approve-send", "escalate-supervisor", "add-to-handoff"],
      targetChannels: ["google-chat-lob", "supervisor"],
      draftMessage: "TLB line health: RED — SLA 12%, 9 calls holding, longest queue 09:42. All offline cancelled. ALL HANDS ON DECK.",
      auditEvents: [],
    },
    {
      id: "sc-b-lob-002",
      lane: "lob-health",
      type: "alert",
      title: "Fraud ITR — BLUE line health",
      summary: "Fraud ITR SLA at 68%. 6 calls holding. All offline activity suspended — coaching reduced to 15 min.",
      owner: "ai",
      status: "classified",
      severity: "high",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Scenario B · Fraud ITR line health", detail: "BLUE code." },
      lob: "Fraud ITR",
      geo: "Guatemala",
      recommendedAction: "Suspend offline. Pre-planned coaching to 15 min max.",
      availableActions: ["approve-send", "escalate-supervisor"],
      targetChannels: ["google-chat-lob", "supervisor"],
      draftMessage: "Fraud ITR line health: BLUE — SLA 68%, 6 calls holding. No offline at this time. Pre-planned coachings to be reduced to 15 minutes. ALL HANDS ON DECK.",
      auditEvents: [],
    },
    {
      id: "sc-b-coaching-001",
      lane: "coaching-huddles",
      type: "coaching-decision",
      title: "Offline restriction — TLB RED",
      summary: "TLB is RED. No new coaching, training, or offline activity approved.",
      owner: "ai",
      status: "ready-to-send",
      severity: "high",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "line_health_codes.json · RED guidance", detail: "RED: all offline cancelled except pre-planned coachings and huddles." },
      lob: "TLB",
      geo: "Guatemala",
      recommendedAction: "Deny new requests. Notify supervisor to pull agents back to phones.",
      availableActions: ["approve-send", "edit-message", "suppress"],
      targetChannels: ["google-chat-lob", "supervisor"],
      draftMessage: "TLB is in RED line-health state. All offline cancelled except pre-planned coachings and huddles. Please ensure all available agents are on phones.",
      auditEvents: [],
    },
    {
      id: "sc-b-rebalance-001",
      lane: "lob-health",
      type: "rebalance",
      title: "Rebalance — move 3 agents from Costco to Cards",
      summary: "Cards is RED (12% SLA, 9 holding). Costco is YELLOW (88% SLA, 2 holding). AI suggests moving 3 agents to Cards for immediate queue relief.",
      owner: "ai",
      status: "needs-review",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "lob_routing_seed + line_health_codes.json", detail: "Cards RED with severe queue pressure; Costco has agents available. Costco ↔ Cards cross-support is approved." },
      confidence: 0.91,
      lob: "Cards",
      geo: "Guatemala",
      recommendedAction: "Approve rebalance and notify Costco TL to release 3 agents to Cards immediately.",
      availableActions: ["approve-send", "edit-message", "escalate-supervisor", "suppress"],
      targetChannels: ["google-chat-lob", "supervisor", "teams-workforce"],
      draftMessage: "Costco TL: Please move Renata Solis, Hugo Ramos, and one available Costco agent to Cards support — critical queue spike in progress. Cards SLA at 12%. Costco ↔ Cards cross-support approved.",
      rebalanceSuggestion: {
        sourceLob: "Costco",
        targetLob: "Cards",
        agentNames: ["Renata Solis", "Hugo Ramos", "Available Costco Agent"],
        reason: "Cards at 12% SLA with 9 calls holding; Costco has capacity with 2 calls holding at 88% SLA. Costco ↔ Cards cross-support is approved.",
      },
      auditEvents: [
        { id: "sc-b-audit-rebalance-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Rebalance detected", detail: "Queue delta: Cards −24 vs target; Costco +3 vs target. Costco ↔ Cards cross-support eligible.", dataClass: "seeded" },
      ],
    },
    {
      id: "sc-b-esc-001",
      lane: "escalations",
      type: "escalation",
      title: "Repeat coaching overrun — Felipe Cordero (cycle 3)",
      summary: "Felipe Cordero has been in violation for 3 consecutive 15-min cycles. OM tag fired. Senior RTA notified.",
      owner: "shared",
      status: "escalated",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Escalation logic · ABD RT Adherence Monitoring", detail: "3+ cycles same agent same violation." },
      lob: "Fraud ITR",
      geo: "Guatemala",
      recommendedAction: "Escalate to OM. Document in EOD findings for senior RTA review.",
      availableActions: ["escalate-om", "add-to-handoff"],
      targetChannels: ["om", "senior-rta", "handoff"],
      draftMessage: "@operations_manager ESCALATION Fraud ITR: Felipe Cordero — coaching violation across 3 cycles. Senior RTA review required for EOD findings.",
      auditEvents: [],
    },
    {
      id: "sc-b-att-001",
      lane: "attendance-reporting",
      type: "report",
      title: "Intraday report — attendance drop",
      summary: "Attendance dipped to 88% at midday cycle. Anomaly note included in email. Senior RTA copied.",
      owner: "ai",
      status: "sent",
      severity: "medium",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario B · 12:00 intraday cycle", detail: "Attendance below expected range." },
      recommendedAction: "Monitor next cycle. If continues to drop, flag for operations review.",
      availableActions: ["add-to-handoff"],
      targetChannels: ["audit-only"],
      draftMessage: "Midday attendance sent — 88%, 6 no-shows, anomaly note added. Senior RTA copied.",
      auditEvents: [],
    },
  ],

  reports: {
    attendanceReports: [
      {
        id: "sc-b-att-morning",
        reportTime: "2026-04-29T09:15:00-06:00",
        cycleLabel: "Morning",
        attendancePct: 92,
        absenteeismPct: 6,
        latenessPct: 4,
        latenessMinutes: 18,
        noShowCount: 3,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Attendance Report — Guatemala — 2026-04-29 09:00",
        emailBody: `Hi Operations Team,

Morning attendance summary — CIBC Guatemala (09:00 cycle):

  Attendance:       92%  (46 / 50 agents)
  Absenteeism:       6%  (3 no-shows)
  Lateness:          4%  (2 agents — 18 min combined)
  Lateness Min:     18 min

Status: ✅ Within acceptable range. Monitoring active.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-b-att-midday",
        reportTime: "2026-04-29T12:15:00-06:00",
        cycleLabel: "Midday",
        attendancePct: 88,
        absenteeismPct: 10,
        latenessPct: 4,
        latenessMinutes: 22,
        noShowCount: 5,
        totalScheduled: 50,
        anomaly: true,
        anomalyNote: "Attendance dropped from 92% to 88%. GTT data verified — confirmed. Senior RTA copied.",
        emailSubject: "⚠️ [CIBC RTA] Attendance Report — Guatemala — 2026-04-29 12:00 [ATTENTION]",
        emailBody: `Hi Operations Team,

⚠️ Attention: Attendance has declined since morning cycle.

Midday summary — CIBC Guatemala (12:00 cycle):

  Attendance:       88%  (44 / 50 agents)  ⚠️ Down from 92%
  Absenteeism:      10%  (5 no-shows — 2 new since morning)
  Lateness:          4%  (2 agents — 22 min combined)
  Lateness Min:     22 min

Note: GTT data verified — figures confirmed.
Coverage impact: TLB and Fraud ITR are feeling the pressure.
Queue health: TLB RED, Fraud ITR BLUE.

Senior RTA has been copied for awareness.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala
CC: Senior RTA`,
        status: "sent",
      },
      {
        id: "sc-b-att-final",
        reportTime: "2026-04-29T16:45:00-06:00",
        cycleLabel: "Final",
        attendancePct: 88,
        absenteeismPct: 10,
        latenessPct: 4,
        latenessMinutes: 22,
        noShowCount: 5,
        totalScheduled: 50,
        anomaly: true,
        anomalyNote: "Attendance remained at 88% — no recovery. 3 escalation events logged.",
        emailSubject: "⚠️ [CIBC RTA] Final Attendance Report — Guatemala — 2026-04-29 [ESCALATIONS]",
        emailBody: `Hi Operations Team,

End-of-shift summary — CIBC Guatemala (Final):

  Attendance:       88%  (44 / 50 agents)
  Absenteeism:      10%  (5 no-shows — no recovery)
  Lateness:          4%  (2 agents)
  Shrinkage:        14%  (above target — Fraud ITR coaching overrun)

Status: ⚠️ Active shift — 3 escalation events logged.

EOD Findings (for Senior RTA):
  • TLB hit RED line health 13:00–14:30 (recovered)
  • Fraud ITR BLUE 13:00–14:00 (recovered)
  • Felipe Cordero (Fraud ITR) coaching overrun — 3 cycles — OM notified
  • Diego Salazar (TLB) long call x2 cycles — supervisor intervened
  • Attendance 88% — 2 unplanned absences during shift hours

Open items for incoming RTA: see handoff.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
    ],

    dispatchLog: [
      { id: "sc-b-dl-001", timestamp: "2026-04-29T13:00:08-06:00", cycle: 1, agent: "Diego Salazar", lob: "TLB", channel: "RTA Escalation TLB", message: "TLB alert: Diego Salazar — INBD - Inbound 09:45. Please check.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-b-dl-002", timestamp: "2026-04-29T13:00:10-06:00", cycle: 1, agent: "Felipe Cordero", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "Fraud ITR alert: Felipe Cordero — COAC - Coaching 32:00. Please check.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-b-dl-003", timestamp: "2026-04-29T13:00:12-06:00", cycle: 1, agent: "Gabriela Luna", lob: "TLB", channel: "RTA Escalation TLB", message: "TLB alert: Gabriela Luna — CallOnHold 04:55. Please check. ⚠️ TLB is RED.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-b-dl-004", timestamp: "2026-04-29T13:00:14-06:00", cycle: 1, agent: "Renata Solis", lob: "Costco", channel: "CBC Costco TDPH WFM", message: "Costco alert: Renata Solis — NOT READY - TIG Offline 03:15. Please check.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-b-dl-005", timestamp: "2026-04-29T13:15:07-06:00", cycle: 2, agent: "Diego Salazar", lob: "TLB", channel: "RTA Escalation TLB", message: "@supervisor TLB follow-up: Diego Salazar — still in INBD - Inbound 14:20. Second consecutive cycle. Intervention needed.", escalationLevel: "supervisor", status: "sent" },
      { id: "sc-b-dl-006", timestamp: "2026-04-29T13:15:09-06:00", cycle: 2, agent: "Renata Solis", lob: "Costco", channel: "CBC Costco TDPH WFM", message: "@supervisor Costco follow-up: Renata Solis — still in TIG Offline 04:30. Second consecutive cycle. Intervention needed.", escalationLevel: "supervisor", status: "sent" },
      { id: "sc-b-dl-007", timestamp: "2026-04-29T13:15:11-06:00", cycle: 2, agent: "Felipe Cordero", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "@supervisor Fraud ITR follow-up: Felipe Cordero — still in COAC - Coaching 47:00. Second cycle.", escalationLevel: "supervisor", status: "sent" },
      { id: "sc-b-dl-008", timestamp: "2026-04-29T13:30:05-06:00", cycle: 3, agent: "Felipe Cordero", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "@operations_manager ESCALATION Fraud ITR: Felipe Cordero — COAC - Coaching 47:00. 3 consecutive cycles.", escalationLevel: "om", status: "sent" },
    ],

    escalations: [
      { agent: "Felipe Cordero", lob: "Fraud ITR", status: "COAC - Coaching", cyclesEscalated: 3, escalatedTo: "om", resolvedBy: "Operations Manager", notes: "Coaching session ran over approved 30-min window. OM intervened at cycle 3. Coaching ended." },
      { agent: "Diego Salazar", lob: "TLB", status: "INBD - Inbound", cyclesEscalated: 2, escalatedTo: "supervisor", resolvedBy: "Floor Supervisor", notes: "Complex customer call — supervisor supported. Resolved at cycle 2 end." },
      { agent: "Renata Solis", lob: "Costco", status: "NOT READY - TIG Offline", cyclesEscalated: 2, escalatedTo: "supervisor", resolvedBy: "Floor Supervisor", notes: "Agent returned to BLEN after supervisor check-in." },
    ],

    shrinkage: [
      { category: "Lunch", minutes: 450, pct: 5.6, icon: "🍽" },
      { category: "Break (Paid)", minutes: 300, pct: 3.8, icon: "☕" },
      { category: "Coaching", minutes: 235, pct: 2.9, icon: "🎓" },
      { category: "Meeting / Huddle", minutes: 30, pct: 0.4, icon: "📋" },
      { category: "TIG Offline", minutes: 75, pct: 0.9, icon: "💻" },
    ],

    forecast: [
      { time: "09:00", required: 45, available: 46, delta: 1, health: "GREEN" },
      { time: "10:00", required: 48, available: 46, delta: -2, health: "YELLOW" },
      { time: "11:00", required: 50, available: 44, delta: -6, health: "RED" },
      { time: "12:00", required: 48, available: 44, delta: -4, health: "RED" },
      { time: "13:00", required: 46, available: 44, delta: -2, health: "YELLOW" },
      { time: "14:00", required: 44, available: 45, delta: 1, health: "GREEN" },
      { time: "15:00", required: 42, available: 44, delta: 2, health: "GREEN" },
      { time: "16:00", required: 40, available: 43, delta: 3, health: "GREEN" },
    ],

    handoff: {
      outgoingRTA: "Bruno Castillo",
      shiftDate: "2026-04-29",
      shiftHours: "09:00 – 17:00 GT",
      openAlerts: 1,
      openTickets: 0,
      eodFindings: [
        "TLB hit RED line health 13:00–14:30 — recovered after queue drains",
        "Fraud ITR hit BLUE 13:00–14:00 — all offline cancelled during period",
        "Felipe Cordero (Fraud ITR) — 3-cycle coaching escalation — OM resolved",
        "Diego Salazar (TLB) — 2-cycle long call — supervisor resolved",
        "Renata Solis (Costco) — 2-cycle TIG Offline — supervisor resolved",
        "Attendance 88% — 5 no-shows — 2 were unplanned; flag to scheduling",
      ],
      handoffMessage: "Active shift. Incoming RTA: monitor TLB and Fraud ITR closely — still recovering. No open tickets. 1 unresolved alert card (review queue pressure before deciding).",
      incomingRTANote: "Prioritise TLB and Fraud ITR scans first two cycles. Attendance note filed — check Workday for any late approvals.",
    },
  },
};

// ---------------------------------------------------------------------------
// SCENARIO C — Attendance Crisis
// ---------------------------------------------------------------------------

const scenarioC: Scenario = {
  id: "C",
  label: "Attendance Crisis",
  theme: "High absenteeism morning, attendance drops below 70% anomaly threshold.",
  description:
    "A rough start: 14 agents absent or not yet logged in at shift start — attendance hits 71%, triggering the below-70% anomaly check. The system detects the threshold breach in the morning report, adds the anomaly note, and CC's the senior RTA automatically — replacing a critical manual safety net.",
  lineHealthSummary: "TLB: YELLOW — Cards: YELLOW — Others: GREEN",

  cards: [
    {
      id: "sc-c-att-001",
      lane: "attendance-reporting",
      type: "report",
      title: "⚠️ Morning report — attendance anomaly",
      summary: "Attendance 71% — near the 70% anomaly threshold. GTT data verified. Senior RTA copied on email.",
      owner: "ai",
      status: "sent",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario C · Morning cycle · attendance anomaly", detail: "Rule: attendance_pct < 75 triggers anomaly flag." },
      recommendedAction: "Senior RTA has been notified. Monitor next intraday cycle for recovery. If attendance drops below 70%, escalate to operations.",
      availableActions: ["add-to-handoff"],
      targetChannels: ["audit-only"],
      draftMessage: "Morning attendance sent — 71%, anomaly note added, senior RTA copied.",
      auditEvents: [{ id: "sc-c-audit-att-1", timestamp: "2026-04-29T09:15:00-06:00", actor: "ai", action: "Anomaly flagged", detail: "Attendance 71% — near threshold. Senior RTA copied.", dataClass: "simulated" }],
    },
    {
      id: "sc-c-att-002",
      lane: "attendance-reporting",
      type: "report",
      title: "Midday report — recovery in progress",
      summary: "Attendance recovered to 78% by midday. 4 late arrivals logged. Still monitoring.",
      owner: "ai",
      status: "sent",
      severity: "medium",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario C · 12:00 cycle", detail: "Partial recovery — late arrivals logged in." },
      recommendedAction: "Recovery trend positive. Continue monitoring. Next cycle at 15:00.",
      availableActions: ["add-to-handoff"],
      targetChannels: ["audit-only"],
      draftMessage: "Midday attendance — 78%, recovery noted. 4 late arrivals logged in since morning.",
      auditEvents: [],
    },
    {
      id: "sc-c-rt-001",
      lane: "real-time-adherence",
      type: "alert",
      title: "INBD 11:45 — Ivan Bravo (Cards)",
      summary: "Ivan Bravo (Cards) in INBD - Inbound for 11:45 — 9-min threshold exceeded.",
      owner: "shared",
      status: "needs-review",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario C · Cycle 1", detail: "Alert during understaffed shift." },
      confidence: 0.91,
      lob: "Cards",
      geo: "Guatemala",
      agent: { name: "Ivan Bravo", id: "GT-CAR-001", lob: "Cards", geo: "Guatemala", currentStatus: "INBD - Inbound", scheduledActivity: "BLEN - Blended", adherenceInPercent: 77, adherenceOutPercent: 23, coachingSessionsThisWeek: 0, huddlesThisWeek: 1, openTickets: 0, recommendedAction: "Alert LOB channel.", schedulePreview: ["Today: Blended, Break"] },
      rule: { id: "time_limit_inbd_inbound", description: "INBD over 9 min", threshold: "9 min" },
      recommendedAction: "Alert LOB channel. Note: LOB is short-staffed — complex call likely.",
      availableActions: ["approve-send", "suppress", "edit-message", "ask-ai-why"],
      targetChannels: ["google-chat-lob", "supervisor", "audit-only"],
      selectedChannel: "google-chat-lob",
      draftMessage: "Cards alert: Ivan Bravo — INBD - Inbound 11:45 (scheduled: BLEN - Blended). Please check. Note: LOB is operating below normal headcount.",
      auditEvents: [],
    },
    {
      id: "sc-c-esc-001",
      lane: "escalations",
      type: "escalation",
      title: "Senior RTA notified — attendance below threshold",
      summary: "Morning attendance at 71% triggered senior RTA notification. Coverage review in progress.",
      owner: "ai",
      status: "escalated",
      severity: "high",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario C · Attendance anomaly escalation", detail: "Automatic senior RTA copy when attendance < 75%." },
      recommendedAction: "Senior RTA is reviewing. Await guidance before requesting offline activities.",
      availableActions: ["add-to-handoff", "mark-resolved"],
      targetChannels: ["senior-rta", "handoff"],
      draftMessage: "Senior RTA notified: morning attendance 71% — near anomaly threshold. Coverage review requested.",
      auditEvents: [{ id: "sc-c-audit-esc-1", timestamp: "2026-04-29T09:16:00-06:00", actor: "ai", action: "Senior RTA notified", detail: "Attendance anomaly auto-escalation.", dataClass: "simulated" }],
    },
    {
      id: "sc-c-ticket-001",
      lane: "tickets-exceptions",
      type: "task",
      title: "Absence follow-up — 14 agents",
      summary: "14 agents not logged in at shift start. Workday verification pending for 6 of them.",
      owner: "rta",
      status: "detected",
      severity: "medium",
      dataClass: "future-integration",
      source: { dataClass: "future-integration", label: "Workday integration not yet connected", detail: "Manual Workday check required until API integration is live." },
      recommendedAction: "Verify 6 unconfirmed absences in Workday. Raise SNOW tickets where no approval exists.",
      availableActions: ["create-servicenow-follow-up", "mark-resolved", "add-to-handoff"],
      targetChannels: ["servicenow", "handoff", "audit-only"],
      draftMessage: "Absence follow-up: 14 agents absent at shift start. 6 pending Workday verification. RTA action required.",
      auditEvents: [],
    },
  ],

  reports: {
    attendanceReports: [
      {
        id: "sc-c-att-morning",
        reportTime: "2026-04-29T09:15:00-06:00",
        cycleLabel: "Morning",
        attendancePct: 71,
        absenteeismPct: 24,
        latenessPct: 8,
        latenessMinutes: 42,
        noShowCount: 12,
        totalScheduled: 50,
        anomaly: true,
        anomalyNote: "Attendance near the 70% anomaly threshold. Data verified against GTT. Senior RTA copied.",
        emailSubject: "⚠️ [CIBC RTA] Attendance Report — Guatemala — 2026-04-29 09:00 [ANOMALY RISK]",
        emailBody: `Hi Operations Team,

⚠️ Attendance is near the 70% anomaly threshold this morning.

Morning summary — CIBC Guatemala (09:00 cycle):

  Attendance:       71%  (36 / 50 agents)  ⚠️ NEAR THRESHOLD
  Absenteeism:      24%  (12 no-shows)
  Lateness:          8%  (4 agents — 42 min combined)
  Lateness Min:     42 min

Verification: GTT raw data reviewed — figures confirmed.
Note: 6 absences are pending Workday approval. If approvals land,
adjusted attendance may recover above 75%.

Senior RTA has been copied on this email.
Please review coverage and advise if offline activity should be paused.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala
CC: Senior RTA`,
        status: "sent",
      },
      {
        id: "sc-c-att-midday",
        reportTime: "2026-04-29T12:15:00-06:00",
        cycleLabel: "Midday",
        attendancePct: 78,
        absenteeismPct: 16,
        latenessPct: 8,
        latenessMinutes: 42,
        noShowCount: 8,
        totalScheduled: 50,
        anomaly: false,
        anomalyNote: "Recovered from morning — 4 late arrivals logged in since 09:00 cycle.",
        emailSubject: "[CIBC RTA] Attendance Report — Guatemala — 2026-04-29 12:00 [RECOVERING]",
        emailBody: `Hi Operations Team,

Update: Attendance has recovered since this morning's anomaly alert.

Midday summary — CIBC Guatemala (12:00 cycle):

  Attendance:       78%  (39 / 50 agents)  ↑ Recovering
  Absenteeism:      16%  (8 no-shows — 4 recovered since morning)
  Lateness:          8%  (4 late arrivals now counted — unchanged)
  Lateness Min:     42 min

Recovery note: 4 agents who were late are now logged in.
6 Workday approvals received — adjusted numbers above.
Anomaly risk has cleared. Standard monitoring resumes.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-c-att-final",
        reportTime: "2026-04-29T16:45:00-06:00",
        cycleLabel: "Final",
        attendancePct: 80,
        absenteeismPct: 14,
        latenessPct: 8,
        latenessMinutes: 42,
        noShowCount: 7,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Final Attendance Report — Guatemala — 2026-04-29",
        emailBody: `Hi Operations Team,

End-of-shift summary — CIBC Guatemala (Final):

  Attendance:       80%  (40 / 50 agents)
  Absenteeism:      14%  (7 confirmed no-shows)
  Lateness:          8%  (4 agents — 42 min combined)
  Shrinkage:        10%  (within target)

Status: ✅ Recovered. Morning anomaly did not materialise into a full crisis.

EOD Findings (for Senior RTA):
  • Morning attendance 71% — near anomaly threshold — senior RTA notified
  • 6 Workday approvals received mid-shift — adjusted counts accordingly
  • 4 late arrivals recovered by midday
  • 1 RT alert (Ivan Bravo, Cards) — resolved cycle 2
  • LOB health: TLB and Cards briefly YELLOW — returned to GREEN

Scheduling recommendation: review the 7 confirmed no-shows for pattern.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
    ],

    dispatchLog: [
      { id: "sc-c-dl-001", timestamp: "2026-04-29T09:16:00-06:00", cycle: 0, agent: "System", lob: "ALL", channel: "Senior RTA (direct)", message: "Attendance anomaly alert: morning attendance at 71%, near 70% threshold. Coverage review recommended.", escalationLevel: "senior-rta", status: "sent" },
      { id: "sc-c-dl-002", timestamp: "2026-04-29T13:00:08-06:00", cycle: 1, agent: "Ivan Bravo", lob: "Cards", channel: "CBC Cards M Staff Team", message: "Cards alert: Ivan Bravo — INBD - Inbound 11:45. Note: LOB is below normal headcount.", escalationLevel: "first-alert", status: "sent" },
    ],

    escalations: [
      { agent: "System", lob: "ALL", status: "Attendance 71%", cyclesEscalated: 1, escalatedTo: "senior-rta", resolvedBy: "Senior RTA", notes: "Auto-escalation on attendance below 75% threshold. Senior RTA advised to monitor." },
    ],

    shrinkage: [
      { category: "Lunch", minutes: 360, pct: 5.2, icon: "🍽" },
      { category: "Break (Paid)", minutes: 240, pct: 3.5, icon: "☕" },
      { category: "Coaching", minutes: 60, pct: 0.9, icon: "🎓" },
      { category: "Meeting / Huddle", minutes: 30, pct: 0.4, icon: "📋" },
      { category: "TIG Offline", minutes: 0, pct: 0.0, icon: "💻" },
    ],

    forecast: [
      { time: "09:00", required: 45, available: 36, delta: -9, health: "BLUE" },
      { time: "10:00", required: 48, available: 38, delta: -10, health: "BLUE" },
      { time: "11:00", required: 50, available: 40, delta: -10, health: "RED" },
      { time: "12:00", required: 44, available: 39, delta: -5, health: "RED" },
      { time: "13:00", required: 46, available: 40, delta: -6, health: "RED" },
      { time: "14:00", required: 44, available: 41, delta: -3, health: "YELLOW" },
      { time: "15:00", required: 42, available: 40, delta: -2, health: "YELLOW" },
      { time: "16:00", required: 40, available: 40, delta: 0, health: "GREEN" },
    ],

    handoff: {
      outgoingRTA: "Bruno Castillo",
      shiftDate: "2026-04-29",
      shiftHours: "09:00 – 17:00 GT",
      openAlerts: 0,
      openTickets: 1,
      eodFindings: [
        "Morning attendance 71% — near anomaly — senior RTA notified at 09:16",
        "6 Workday approvals received mid-shift — adjusted counts accordingly",
        "4 late arrivals recovered by midday — final attendance 80%",
        "7 confirmed no-shows — flag to scheduling for pattern review",
        "1 SNOW ticket open: absence follow-up for 1 remaining unverified absence",
        "RT adherence: 1 alert (Ivan Bravo, Cards) — resolved clean",
      ],
      handoffMessage: "Recovering shift. Incoming RTA: 1 open SNOW ticket (absence follow-up). Monitor TLB headcount at shift start — slightly under. No open alerts.",
      incomingRTANote: "Check Workday for any approvals that came in after 16:00. Verify TLB headcount before starting monitoring cycle.",
    },
  },
};

// ---------------------------------------------------------------------------
// SCENARIO D — Tech Outage
// ---------------------------------------------------------------------------

const scenarioD: Scenario = {
  id: "D",
  label: "Tech Outage",
  theme: "Fraud ITR system failure — TECH Issues, SLA drop, SNOW ticket, all offline cancelled.",
  description:
    "A Fraud ITR tech incident takes 6 agents offline during peak hours. SLA drops to 65%. The system detects the cluster of TECH Issues statuses, opens a ServiceNow ticket card, routes the outage alert to all Fraud channels, and blocks new offline activity — replacing a manually-orchestrated response that normally takes 10–15 minutes to mobilise.",
  lineHealthSummary: "Fraud ITR: BLUE — TLB: RED — Others: YELLOW",

  cards: [
    {
      id: "sc-d-playbook",
      lane: "escalations",
      type: "outage-playbook",
      title: "AI Contingency Plan — Tech Outage",
      summary: "AI has detected a tech cluster and activated the outage response protocol. Follow these steps in order.",
      owner: "ai",
      status: "classified",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Outage Detection & Response ABD", detail: "6-step outage response derived from Redy ABD and shadowing sessions." },
      recommendedAction: "Work through each step in order. Tick each step as you complete it.",
      availableActions: ["mark-resolved", "add-to-handoff"],
      targetChannels: ["audit-only", "handoff"],
      outagePlaybook: [
        { step: 1, action: "Confirm outage", detail: "Verify TECH Issues status across Fraud ITR agents in Verint. Threshold: 3+ agents in same cycle." },
        { step: 2, action: "Open ServiceNow ticket", detail: "Create SNOW ticket — category: WDE Disconnection. Assign to CIBC TECH. Note agent count and start time." },
        { step: 3, action: "Notify supervisor", detail: "Send outage alert to Real-time escalation Fraud CIBC channel via Google Chat." },
        { step: 4, action: "Notify OM + Philippines WFM", detail: "Escalate to Operations Manager and cross-notify CBC TDPH WFM for cross-geo coordination." },
        { step: 5, action: "Block all offline activity", detail: "Set Fraud ITR to ALL HANDS-ON DECK. Deny any new coaching or huddle requests until SLA recovers above 80%." },
        { step: 6, action: "Backdate agents on resolution", detail: "Once CIBC TECH resolves, backdate all affected agents to TECH Issues AUX for the outage window." },
      ],
      auditEvents: [{ id: "sc-d-audit-playbook-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Playbook activated", detail: "Tech cluster threshold met — 6 agents in TECH Issues.", dataClass: "simulated" }],
    },
    {
      id: "sc-d-rt-001",
      lane: "real-time-adherence",
      type: "exception",
      title: "Tech cluster — Fraud ITR (6 agents)",
      summary: "6 Fraud ITR agents simultaneously entered TECH Issues status. Possible system incident.",
      owner: "shared",
      status: "needs-review",
      severity: "critical",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario D · Cycle 1 · cluster detection", detail: "TECH Issues is an exception status — flag for review, not auto-alert." },
      confidence: 0.74,
      lob: "Fraud ITR",
      geo: "Guatemala",
      agent: { name: "Multiple agents", id: "GT-FRD-CLUSTER", lob: "Fraud ITR", geo: "Guatemala", currentStatus: "TECH Issues", scheduledActivity: "BLEN - Blended", adherenceInPercent: 0, adherenceOutPercent: 100, coachingSessionsThisWeek: 0, huddlesThisWeek: 0, openTickets: 6, recommendedAction: "Investigate tech issue. Open SNOW ticket. Notify supervisor.", schedulePreview: ["Today: Blended"] },
      rule: { id: "tech_cluster_detection", description: "3+ agents in TECH Issues in same LOB within one cycle", threshold: "3 agents" },
      recommendedAction: "Investigate — tech cluster detected. Open ServiceNow ticket. Notify supervisor and notify Philippines WFM.",
      availableActions: ["ask-ai-why", "create-servicenow-follow-up", "escalate-supervisor", "add-to-handoff"],
      targetChannels: ["supervisor", "servicenow", "handoff", "audit-only"],
      selectedChannel: "supervisor",
      draftMessage: `[OUTAGE ALERT — Fraud ITR]
Status: TECH Issues cluster detected
Agents affected: 6 (WDE disconnection)
Time detected: 13:00 GT
Action: Investigating — SNOW ticket in progress
SLA: 65% (critical)
Next update: 10 minutes
— AI Agent | Bruno Castillo RTA`,
      escalationRules: {
        trigger: "3+ agents TECH Issues in same LOB within 1 cycle",
        immediateActions: ["notify-supervisor", "open-snow-ticket"],
        at5min: ["notify-om", "notify-philippines-wfm"],
        at15min: ["escalate-senior-rta", "update-attendance-report"],
        onResolution: ["backdate-agents-tech-issues-aux", "close-snow-ticket", "send-all-clear"],
      },
      auditEvents: [{ id: "sc-d-audit-tech-1", timestamp: "2026-04-29T13:00:00-06:00", actor: "ai", action: "Tech cluster detected", detail: "6 agents in TECH Issues (Fraud ITR) within 1 cycle. Threshold: 3.", dataClass: "simulated" }],
    },
    {
      id: "sc-d-lob-001",
      lane: "lob-health",
      type: "alert",
      title: "Fraud ITR — BLUE (SLA 65%)",
      summary: "Fraud ITR SLA dropped to 65% due to tech incident. 8 calls holding. Longest: 11:30.",
      owner: "ai",
      status: "classified",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Scenario D · Fraud ITR line health", detail: "SLA impact from tech incident." },
      lob: "Fraud ITR",
      geo: "Guatemala",
      recommendedAction: "All hands on deck. Cancel all offline. Notify Philippines WFM. Open SNOW ticket.",
      availableActions: ["approve-send", "escalate-supervisor", "escalate-om", "add-to-handoff"],
      targetChannels: ["google-chat-lob", "supervisor", "om"],
      draftMessage: `[LINE HEALTH — Fraud ITR: BLUE]
ALL HANDS-ON DECK
No offline activity. No ADHOC coaching. No huddles.
8 calls holding. Longest: 11:30. SLA: 65%.
— RTA Command Center`,
      auditEvents: [],
    },
    {
      id: "sc-d-ticket-001",
      lane: "tickets-exceptions",
      type: "task",
      title: "ServiceNow — TKT-8823 (Tech Outage Fraud ITR)",
      summary: "SNOW ticket TKT-8823 opened for Fraud ITR tech incident. WDE disconnection affecting 6 agents.",
      owner: "rta",
      status: "in-progress",
      severity: "critical",
      dataClass: "future-integration",
      source: { dataClass: "future-integration", label: "ServiceNow not yet integrated", detail: "Ticket workflow is evidence-backed; card is a demo placeholder." },
      recommendedAction: "Confirm ticket is routed to CIBC TECH. Monitor resolution. All affected agents to be backdated to TECH Issues AUX.",
      availableActions: ["mark-resolved", "add-to-handoff", "create-servicenow-follow-up"],
      targetChannels: ["servicenow", "handoff", "audit-only"],
      draftMessage: "SNOW TKT-8823 open: Fraud ITR WDE disconnection, 6 agents affected, 13:00 GT. Awaiting CIBC TECH resolution.",
      auditEvents: [{ id: "sc-d-audit-snow-1", timestamp: "2026-04-29T13:02:00-06:00", actor: "rta", action: "ServiceNow ticket opened", detail: "TKT-8823 — Fraud ITR WDE outage.", dataClass: "future-integration" }],
    },
    {
      id: "sc-d-coaching-001",
      lane: "coaching-huddles",
      type: "coaching-decision",
      title: "All offline suspended — Fraud ITR BLUE",
      summary: "Tech incident in Fraud ITR triggered automatic offline suspension across the LOB.",
      owner: "ai",
      status: "ready-to-send",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "line_health_codes.json · BLUE guidance", detail: "BLUE: no offline at this time. ALL HANDS ON DECK." },
      lob: "Fraud ITR",
      geo: "Guatemala",
      recommendedAction: "Approve and send. Block all new offline requests for Fraud ITR until SLA recovers.",
      availableActions: ["approve-send", "edit-message", "suppress"],
      targetChannels: ["google-chat-lob", "supervisor"],
      draftMessage: "Fraud ITR: BLUE line-health — no offline at this time. ALL HANDS ON DECK. Tech incident active — all available agents to remain on phones.",
      auditEvents: [],
    },
    {
      id: "sc-d-esc-001",
      lane: "escalations",
      type: "escalation",
      title: "Outage escalation — OM + Philippines WFM notified",
      summary: "Fraud ITR tech incident escalated to Operations Manager and Philippines WFM team for cross-team coordination.",
      owner: "ai",
      status: "escalated",
      severity: "critical",
      dataClass: "seeded",
      source: { dataClass: "seeded", label: "Outage Detection & Response ABD", detail: "Cluster of TECH Issues in same LOB triggers OM + PH WFM notification." },
      recommendedAction: "Await OM acknowledgement. Keep outage log updated. Document recovery time for EOD findings.",
      availableActions: ["add-to-handoff", "mark-resolved"],
      targetChannels: ["om", "senior-rta", "handoff"],
      draftMessage: `@operations_manager [INCIDENT ESCALATION]
Fraud ITR WDE outage — 13:00 GT
Agents offline: 6 | SLA: 65% | SNOW TKT-8823 open
Philippines WFM notified.
Awaiting CIBC TECH resolution. Est. impact: 60–90 min.
— Bruno Castillo | RTA Guatemala`,
      auditEvents: [],
    },
    {
      id: "sc-d-att-001",
      lane: "attendance-reporting",
      type: "report",
      title: "Intraday report — outage impact noted",
      summary: "Intraday attendance sent. Outage impact note added. Fraud ITR shrinkage spike flagged.",
      owner: "ai",
      status: "sent",
      severity: "medium",
      dataClass: "simulated",
      source: { dataClass: "simulated", label: "Scenario D · 12:00 intraday cycle", detail: "Outage context added to email body." },
      recommendedAction: "No action on attendance itself. Outage context included for operations team.",
      availableActions: ["add-to-handoff"],
      targetChannels: ["audit-only"],
      draftMessage: "Midday attendance sent — 90%, tech outage context note added for Fraud ITR.",
      auditEvents: [],
    },
  ],

  reports: {
    attendanceReports: [
      {
        id: "sc-d-att-morning",
        reportTime: "2026-04-29T09:15:00-06:00",
        cycleLabel: "Morning",
        attendancePct: 94,
        absenteeismPct: 4,
        latenessPct: 2,
        latenessMinutes: 10,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Attendance Report — Guatemala — 2026-04-29 09:00",
        emailBody: `Hi Operations Team,

Morning attendance summary — CIBC Guatemala (09:00 cycle):

  Attendance:       94%  (47 / 50 agents)
  Absenteeism:       4%  (2 no-shows)
  Lateness:          2%  (1 agent — 10 min)
  Lateness Min:     10 min

Status: ✅ Normal. No anomalies at shift start.

Note: Tech incident reported at 13:00 affecting Fraud ITR.
See intraday report for details.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-d-att-midday",
        reportTime: "2026-04-29T12:15:00-06:00",
        cycleLabel: "Midday",
        attendancePct: 90,
        absenteeismPct: 4,
        latenessPct: 2,
        latenessMinutes: 10,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: true,
        anomalyNote: "Tech incident in Fraud ITR: 6 agents in TECH Issues since 13:00. SLA impact noted. SNOW TKT-8823 open.",
        emailSubject: "⚠️ [CIBC RTA] Attendance Report — Guatemala — 2026-04-29 12:00 [OUTAGE ACTIVE]",
        emailBody: `Hi Operations Team,

⚠️ Tech incident active — Fraud ITR affected.

Midday summary — CIBC Guatemala (12:00 cycle):

  Attendance:       90%  (45 / 50 agents)
  Absenteeism:       4%  (2 no-shows — unchanged)
  Lateness:          2%  (unchanged)
  Lateness Min:     10 min

OUTAGE NOTE:
  Fraud ITR tech incident active since 13:00 GT
  6 agents in TECH Issues (WDE disconnection)
  SNOW ticket TKT-8823 open — awaiting CIBC TECH resolution
  Affected agents will be backdated to TECH Issues AUX once resolved
  Fraud ITR SLA at 65% — Philippines WFM and OM notified

Attendance figures above exclude TECH Issues agents from productive count.

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
      {
        id: "sc-d-att-final",
        reportTime: "2026-04-29T16:45:00-06:00",
        cycleLabel: "Final",
        attendancePct: 94,
        absenteeismPct: 4,
        latenessPct: 2,
        latenessMinutes: 10,
        noShowCount: 2,
        totalScheduled: 50,
        anomaly: false,
        emailSubject: "[CIBC RTA] Final Attendance Report — Guatemala — 2026-04-29 [OUTAGE RESOLVED]",
        emailBody: `Hi Operations Team,

End-of-shift summary — CIBC Guatemala (Final):

  Attendance:       94%  (47 / 50 agents)
  Absenteeism:       4%  (2 no-shows)
  Lateness:          2%  (1 agent)
  Shrinkage:        12%  (above target — tech outage caused productivity gap)

OUTAGE DEBRIEF:
  Fraud ITR WDE disconnection resolved at 14:30 GT (1h 30m impact)
  SNOW TKT-8823 closed — CIBC TECH confirmed fix deployed
  6 agents backdated to TECH Issues AUX for 13:00–14:30 window
  Fraud ITR SLA recovered to 88% by 15:00

EOD Findings (for Senior RTA):
  • Outage: Fraud ITR WDE disconnection 13:00–14:30 — 6 agents affected
  • SLA dropped to 65% at peak — recovered to 88% post-resolution
  • SNOW TKT-8823 closed — backdating complete
  • No RT adherence violations outside of outage context
  • Attendance recovered to 94% once TECH Issues agents returned

Best,
Bruno Castillo | RTA Analyst, CIBC WFM Guatemala`,
        status: "sent",
      },
    ],

    dispatchLog: [
      { id: "sc-d-dl-001", timestamp: "2026-04-29T13:00:05-06:00", cycle: 1, agent: "Tech cluster (6 agents)", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "FRAUD ITR TECH CLUSTER: 6 agents entered TECH Issues simultaneously. Possible WDE disconnection. Investigating.", escalationLevel: "supervisor", status: "sent" },
      { id: "sc-d-dl-002", timestamp: "2026-04-29T13:00:08-06:00", cycle: 1, agent: "System", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "Fraud ITR: BLUE — SLA 65%, 8 calls holding, longest 11:30. ALL HANDS ON DECK — no offline at this time.", escalationLevel: "first-alert", status: "sent" },
      { id: "sc-d-dl-003", timestamp: "2026-04-29T13:02:00-06:00", cycle: 1, agent: "System", lob: "Fraud ITR", channel: "Operations Manager (direct)", message: "@operations_manager OUTAGE ALERT: Fraud ITR tech incident — 6 agents affected, SLA 65%. SNOW TKT-8823 open.", escalationLevel: "om", status: "sent" },
      { id: "sc-d-dl-004", timestamp: "2026-04-29T13:02:30-06:00", cycle: 1, agent: "System", lob: "ALL", channel: "CBC TDPH WFM (Philippines WFM)", message: "GT outage alert: Fraud ITR WDE disconnection active. 6 agents affected. Cross-team coordination requested.", escalationLevel: "supervisor", status: "sent" },
      { id: "sc-d-dl-005", timestamp: "2026-04-29T14:31:00-06:00", cycle: 4, agent: "System", lob: "Fraud ITR", channel: "Real-time escalation Fraud CIBC", message: "Fraud ITR tech incident RESOLVED at 14:30. TKT-8823 closed. Agents returning to BLEN. SLA recovering.", escalationLevel: "first-alert", status: "sent" },
    ],

    escalations: [
      { agent: "6 agents (Fraud ITR)", lob: "Fraud ITR", status: "TECH Issues", cyclesEscalated: 6, escalatedTo: "om", resolvedBy: "CIBC TECH (external)", notes: "WDE disconnection resolved at 14:30. SNOW TKT-8823 closed. Agents backdated to TECH Issues AUX." },
    ],

    shrinkage: [
      { category: "Lunch", minutes: 450, pct: 5.6, icon: "🍽" },
      { category: "Break (Paid)", minutes: 300, pct: 3.8, icon: "☕" },
      { category: "TECH Issues (outage)", minutes: 540, pct: 6.8, icon: "⚠️" },
      { category: "Coaching", minutes: 60, pct: 0.8, icon: "🎓" },
      { category: "Meeting / Huddle", minutes: 30, pct: 0.4, icon: "📋" },
    ],

    forecast: [
      { time: "09:00", required: 45, available: 47, delta: 2, health: "GREEN" },
      { time: "10:00", required: 48, available: 47, delta: -1, health: "GREEN" },
      { time: "11:00", required: 50, available: 47, delta: -3, health: "YELLOW" },
      { time: "12:00", required: 48, available: 47, delta: -1, health: "GREEN" },
      { time: "13:00", required: 46, available: 41, delta: -5, health: "BLUE" },
      { time: "14:00", required: 47, available: 41, delta: -6, health: "BLUE" },
      { time: "15:00", required: 44, available: 47, delta: 3, health: "GREEN" },
      { time: "16:00", required: 40, available: 47, delta: 7, health: "GREEN" },
    ],

    handoff: {
      outgoingRTA: "Bruno Castillo",
      shiftDate: "2026-04-29",
      shiftHours: "09:00 – 17:00 GT",
      openAlerts: 0,
      openTickets: 0,
      eodFindings: [
        "Fraud ITR WDE disconnection 13:00–14:30 — 6 agents affected",
        "SLA dropped to 65% at peak — recovered to 88% by 15:00",
        "SNOW TKT-8823 opened and closed — CIBC TECH confirmed fix",
        "6 agents backdated to TECH Issues AUX for 13:00–14:30 window",
        "No outstanding RT violations outside outage context",
        "Attendance 94% — outage did not cause additional absenteeism",
      ],
      handoffMessage: "Outage resolved. No open items. Incoming RTA: standard monitoring only. Verify Fraud ITR SLA holds above 80% in first cycle.",
      incomingRTANote: "Check Fraud ITR SLA on first cycle scan. If SLA drops below 80% again, re-escalate and re-open outage protocol.",
    },
  },
};

// ---------------------------------------------------------------------------
// Exported scenarios map
// ---------------------------------------------------------------------------

export const scenarios: Record<"A" | "B" | "C" | "D" | "E", Scenario> = {
  A: scenarioA,
  B: scenarioB,
  C: scenarioC,
  D: scenarioD,
  E: scenarioEpic,
};

export type ScenarioId = keyof typeof scenarios;
