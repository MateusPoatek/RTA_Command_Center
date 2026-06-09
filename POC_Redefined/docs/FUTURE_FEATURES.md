# Future Features — preliminary concepts from today's learnings

> **Status: ideas / not built.** These are first-cut directions for features
> beyond real-time adherence alerting, each mapped to a **data source we already
> identified today** and the capture adapter that would feed it. They reuse the
> same swappable-adapter + rules-core model (`CAPTURE_AND_DISPATCH_ADAPTERS.md`).
> Treat as a starting point for the production-design council, not a spec.

## Context: what data we already have access to

Today's capture + the sample data folder revealed several rich sources:
- **`/api/wfm/main/v2/calendar-filter`** → per-employee `actualSchedule.events[]`
  (activity, start, end, durationMinutes; activities carry `paid`/`isWork`) and
  `adherence.violations[]` (planned vs actual + times). *(live API)*
- **`/api/wfm/main/v1/activities`** → activity catalog (names, paid flag, colors).
- **`CIBC_Sample_Attendance_Data_Verint/Cards.csv` etc.** → realized **activity
  logs** per agent (Activity_Name, Start/End, Duration, **Hire_Date**).
- **`GTT_report_*.csv`** → **clock-in/out** (Workday ID, supervisor, cost center,
  SUBGROUP=CIBC, timestamps) — physical attendance.
- **`Matrix … Activities.txt`** → planned **schedule** (shifts + events) with
  canonical CIBC statuses (BLEN/LATU/BRKP/LNCH…).

That's enough to prototype all four features below.

## 1. Adherence reporting (aggregate, not just real-time alerts)

- **What:** per-agent / per-LOB / per-shift adherence %, total OOA minutes, top
  violation types — the reporting layer above today's alert cards.
- **Data:** `calendar-filter` `adherence.violations[]` (we already parse these for
  alerts) + `Day's Adherence %` (visible in the ADHERENCE Quick View grid).
- **Approach:** aggregate the same violation stream we triage today; roll up by
  agent/LOB/interval. Reuses the existing capture + parse; adds a reporting pass.
- **Effort:** low — it's an aggregation over data we already extract.

## 2. Productive hours

- **What:** time spent in productive/billable activities vs breaks/lunch/aux per
  agent/LOB/shift; occupancy/utilization.
- **Data:** `calendar-filter` `actualSchedule.events[]` (durations) + the
  `activities` catalog's `paid`/`isWork` flags; or `Cards.csv` realized activity
  durations.
- **Approach:** classify each activity (work vs non-work via the catalog flags),
  sum durations per agent/day. The activity catalog already gives the paid/work
  classification, so no manual mapping.
- **Effort:** low–medium — needs the activity-classification join.

## 3. Attendance reporting (RTA ABD process #6)

- **What:** no-shows, late starts, early logouts, unplanned absences — the
  morning/intraday/EOD attendance reports.
- **Data:** **cross-reference** scheduled shift (`calendar-filter` actualSchedule /
  `Matrix Activities`) **against** actual clock-in/out (`GTT_report`,
  Workday-sourced). Scheduled 10:00, clocked 10:18 → late start (+18m).
- **Approach:** join on employee (Workday ID / name); compute scheduled-vs-actual
  start/end deltas; flag thresholds. This is a *second* capture source (the
  attendance/Workday system) feeding the same card/report engine — a clean
  multi-source story.
- **Effort:** medium — needs an identity join (Verint id ↔ Workday id) and a second
  capture adapter (GTT/Workday).

## 4. Attrition risk (predictive — most exploratory)

- **What:** early-warning signal for agents at risk of leaving.
- **Data (signals we can already see):** tenure (**`Hire_Date`** in Cards.csv),
  persistent adherence violations (calendar-filter, over time), attendance
  patterns (GTT late/absent frequency), coaching/huddle counts (AgentProfile
  fields already in the card model).
- **Approach:** start descriptive (a risk scorecard combining tenure + adherence
  trend + attendance trend + coaching frequency), then consider a model once
  enough history is captured. Be explicit this is **predictive/uncertain** and
  needs HR data governance.
- **Effort:** high + governance — flag for careful security/PII review.

## Cross-cutting

- **Same architecture:** each feature is a capture adapter (often a source we've
  already seen) → the rules/aggregation core → cards/reports/dispatch. No new
  plumbing model.
- **Multi-source confirmation:** attendance especially benefits from corroborating
  Verint schedule + Workday clock-ins + Verint NOTIFICATIONS — the "abundance of
  confirmations" principle.
- **Identity mapping is the shared prerequisite:** Verint `employeeId` ↔ Workday ID
  ↔ name. Worth designing once, centrally.
- **PII/governance scales with scope:** attendance and attrition touch HR data —
  must be in the council's security/compliance track.
