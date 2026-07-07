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

---

# Roadmap: platform directions (2026-07-07)

> Bigger, cross-cutting directions beyond the four features above — captured from the
> 2026-07-06/07 architecture discussions. Not committed scope; sequenced roughly by dependency.
> Ties into the crawl/walk/run maturity model (`CIBC_RTA_Demo_Andrew.md`,
> `00_crawl_walk_run_maturity.mmd`).

## R1. The reconciliation portal (new product — ~next month)

- **What:** a dedicated, RBAC-based portal that serves **current, reconciled** attendance +
  adherence data — the bridge between what Telus executives/senior directors see today (GTT) and
  the real-time picture extracted from the RTA screens (Verint), surfaced "all the way up to the
  health of the account."
- **Why it's new, not the Command Center:** the Command Center is the RTA-facing operational
  surface; this portal is the **director/C-level-facing** surface with different data currency,
  hosting, and access rules. Likely a **new product**, not a Command Center screen.
- **Supersedes what exists today:** there is already a **Data Studio / Looker dashboard** shared
  with CIBC Operations, refreshed **manually** after each attendance script run (see
  `ATTENDANCE_PROCESS.md`, `NEXT_STEPS.md` "Data Studio / Looker connector"). The portal is the
  productised, always-current successor to that manual dashboard.
- **Requirements (from Mateus, 2026-07-07):**
  - a **source of current data** (not a periodically-refreshed export);
  - **integrated with the newly provisioned infrastructure** (Telus Digital GCP — see BRD AC-007);
  - **RBAC segregation** — what an RTA sees vs. what a C-level sees, especially when the C-level
    view is used **in front of the client** during account negotiation. Builds on existing BRD
    auth/RBAC requirements (BR-020, BR-021).
- **Open decision:** build net-new vs. ride the existing **Intelligent Insights** spine (which
  already does director-level drill-down reporting). Current lean: **new product** — but revisit
  after the Intelligent Insights access/FDI session (BRD AD-008). Tracked in
  [[project_existing_platform]] / [[project_capture_strategy_and_portal]].

## R2. Multi-vendor capture (Verint + NICE + AWS Connect)

- **What:** extend the adapter-blind capture core beyond Verint to the other WFM/telephony
  systems in the Telus portfolio — **NICE** and **AWS Connect** — so the portal reconciles across
  vendors, not just Verint accounts.
- **Reuse, don't rebuild:** other Telus teams have **already built capture solutions for NICE and
  AWS Connect**; we are in contact with them. The likely path is federating their feeds into our
  reconciliation core (BR-030 keeps the core adapter-blind), not building each from scratch —
  consistent with the extend-vs-build stance in the BRD (Section 2) and [[project_existing_platform]].
- **Strategic weight:** this is the addressable-market multiplier — both dominant WFM vendors
  across the portfolio (see BRD Sections 1 and 5). Expansion scope, not Phase 1.

## R3. Rollout order follows tenant ownership

- **Sequencing principle:** prioritise accounts where **Telus already owns the Verint tenant**
  (golden cluster) — server-direct capture needs only an internally-provisioned non-federated
  service account, **no client negotiation**. These are the low-hanging fruit.
- **Client-owned/Citrix accounts (e.g. CIBC)** come later or via the **extension relay**, since
  server-direct there requires negotiating access into the client's infrastructure. See the
  corrected `SERVER_SIDE_ARCHITECTURE.md` (SSO + tenant-ownership) and `RTA_EXTENSION_MASTER_BRIEF.md`
  §5 for the two capture paths.
