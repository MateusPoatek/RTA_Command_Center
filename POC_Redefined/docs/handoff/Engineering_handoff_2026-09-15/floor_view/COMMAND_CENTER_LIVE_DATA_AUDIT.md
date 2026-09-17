# RTA Command Center — Live-Data Audit

*Component-by-component: which surfaces can show **real** data from the Verint extension bridge today, which are one
calc away, and which need a data source the extension can't reach. This is the blueprint for what we wire to live data
— and the menu the config panel (step c) draws from. Pairs with [VERINT_EXTRACTION_CAPABILITIES.md](VERINT_EXTRACTION_CAPABILITIES.md).*

**Audited 2026-06-11** against `command-center/` (the bridge is `useExtensionBridge.ts` ← `parse.js`).

## Legend

- 🟢 **REAL-NOW** — bindable to live extension adherence/alert data today
- 🟡 **DERIVABLE** — needs a Verint-data calc layer (shift open/close, productive hours, adherence %), **no new source**
- 🔵 **NEEDS-GTT** — needs the GTT/Workday attendance source (clock-in/out); creds in progress
- 🟠 **NEEDS-OTHER** — telephony/ACD (SLA, queue, calls-holding, AHT) or ServiceNow (tickets) — **not** from the extension
- ⚪ **SCAFFOLD** — AI-narration / cosmetic; no real source intended yet

## The honest scoping truth

The extension is the **Verint adapter** — it delivers the **adherence/schedule world**: real-time OOA alerts,
adherence %, current vs scheduled activity, shift open/close, productive hours. It does **not** deliver the
**telephony world** (SLA, queue depth, calls holding, AHT) — that's Genesys/Avaya ACD — nor **ServiceNow** tickets.
A true single-pane needs those as **additional capture adapters**. So ~60% of the CC is wireable to live Verint data
now; the rest is honestly blocked on other sources (and labelled as such).

## Component map

| Surface | Tag | Notes |
|---------|-----|-------|
| **CommandBar** (RTA, shift, LOBs, AI status) | 🟢 | From profile; shift window could bind to computed open/close |
| **HealthStrip — AI Rate** | 🟢 | Local card-state math |
| **HealthStrip — Incidents** | 🟢 | Critical/escalated card count |
| **HealthStrip — Needs-you / Auto-sent** | 🟢 | Local card state |
| **HealthStrip — SLA Risk** | 🟠 | SLA % = ACD, not Verint |
| **HealthStrip — Queue Pressure** | 🟠 | calls-holding = ACD |
| **HealthStrip — Next Cycle timer** | ⚪ | Cosmetic 15-min clock |
| **OutageBanner** | ⚪ | Hardcoded string; should bind to an outage card |
| **PriorityFeed — card title/summary/agent/status** | 🟢 | Verint bridge delivers these directly |
| **PriorityFeed — agent adherence %** | 🟡 | `adherenceSummary` IS in Verint → derivable (parse.js sets 0 today) |
| **PriorityFeed — coaching/huddle/ticket counts** | 🟠 | Need coaching DB / ServiceNow |
| **PriorityFeed — rebalance / outage-playbook cards** | 🟡 | Structure complete; await real trigger |
| **ProcessView — Adherence tab** | 🟢 | Core live surface — Verint violations |
| **ProcessView — LOB Health tab** | 🟠 | Queue/SLA tiles = ACD |
| **ProcessView — Coaching tab** | 🟡/🟠 | Card shell ready; needs coaching-request source |
| **ProcessView — Reports tab (Attendance)** | 🔵 | Cadence ready; stats need GTT |
| **ProcessView — Tickets tab** | 🟠 | ServiceNow connector not wired |
| **ProcessView — Handoff tab + DispatchFeed** | 🟢 | Locally assembled dispatch log |
| **LearningStrip** | 🟢 | Local decision tracking |
| **AgentActivityTicker** | ⚪ | AI narration |
| **CopilotPanel** | 🟢 card data / ⚪ LLM | Bindings ready; LLM via FuelIX (rotate key) |
| **ShiftStartModal** (reconciliation, forecast, inbox) | ⚪ / 🔵 | Reconciliation needs GTT; rest seeded |
| **CloseShiftPanel** (readiness score, checklist) | 🟡 | Formula-based; awaits real report/handoff generators |
| **AlertDetailModal** | 🟢 | Dispatch entry local; audit trail synthetic |
| **ReportDetailModal** (attendance email + stats) | 🔵 | Structure ready; stats need GTT |
| **CaptureModal** (OCR/CV scan animation) | ⚪ | Visual simulation |
| **CaptureConfigModal** (system/method/frequency) | 🟢 Verint / 🔵 GTT / 🟠 SNOW | Honest LIVE/PLANNED labels already |

## AgentProfile — where each field comes from

Live bridge (`parse.js`) populates **identity + current/scheduled activity only**: `name`, `id`, `lob`,
`currentStatus`, `scheduledActivity`, `recommendedAction`. **Fixture-only today** (but each has a clear source):
- `adherenceInPercent` / `adherenceOutPercent` → 🟡 **derivable now** from Verint `adherenceSummary` (quick win).
- `geo` → parse.js hardcodes "Unknown" (Verint has org, not worksite geo cleanly).
- `coachingSessionsThisWeek`, `huddlesThisWeek` → 🟠 coaching source.
- `openTickets` → 🟠 ServiceNow.

## Light up first — zero new data sources

1. **Adherence cards** (PriorityFeed + Adherence tab): title/summary/agent/status/scheduled — already live. 🟢
2. **Agent adherence %** on those cards — wire `parse.js` to read `adherenceSummary` (stop hardcoding 0). 🟡 quick win.
3. **Shift Open/Close + Productive Hours** (Evelyn Brooks) — a calc over `actualSchedule.events[]`; surface on the
   agent card / a new readout. 🟡
4. **Dispatch / Learning / Shift-lifecycle / Autonomous toast** — already real (local state). 🟢

## Honestly blocked (label, don't fake)

| Surface | Needs |
|---------|-------|
| SLA %, queue depth, calls holding, AHT, LOB health tiles | Telephony/ACD adapter (Genesys/Avaya) |
| Attendance report stats, morning reconciliation | GTT/Workday (creds in progress) → then 🔵 flips to ✅ |
| Coaching/huddle counts, ticket counts/status | Coaching DB + ServiceNow |
| Copilot LLM responses | FuelIX endpoint (rotate the exposed key) |

## Feeds step (c) — the config panel

The config panel lets RTA/Scheduling pick **what to see per reporting cycle**. Its menu = the 🟢 + 🟡 rows above
(what we can actually deliver), with 🔵 items appearing as GTT lands and 🟠 items clearly marked "needs telephony/SNOW"
so we never promise data we can't source.
