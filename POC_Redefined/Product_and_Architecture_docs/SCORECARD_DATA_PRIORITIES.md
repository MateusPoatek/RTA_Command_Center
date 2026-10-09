# Scorecard Data Priorities — What GTT / Verint Can Feed, In What Order

**Audience:** engineering team, WFM product lead. **Status:** DRAFT v0.1, 2026-10-09. **Scope:** read-only analysis; no code or KPI definition changes.

---

## 1. Purpose and sources

**Question answered:** the WFM Weekly Scorecard needs ~35 metrics. Which of their raw inputs can the Command Center's GTT and Verint captures supply, which are blocked, and in what order should we extract them?

**Headline findings**

- The SOP names **no** GTT, Verint, ACD or ServiceNow source. Every scorecard input is a hand-typed Google Sheet or a Workday / planning-tool table. GTT and Verint are therefore *candidate replacements* for typed inputs, not existing lineage.
- Everything on the scorecard descends from **base scheduled minutes** (2,400 min per 40h TM per week). That is Verint's `publishedSchedule`, so it is priority 1.
- 7 of ~35 metrics are unreachable from our sources (Transactions via ACD; Required/Planned FTE via planning tools).
- Overlap with the earlier 9 COPC KPIs (`2.5 Exhibit 2 (4).xlsx`, see Capture Findings §7) is only **Utilization** and **Required FTE**; the SOP gives a formula for neither.

**Source tags used below**

| Tag | Source |
|---|---|
| SOP-UG | SOP docx, "User Guide" part (§1-§3: definitions, shrink classes, cadence) |
| SOP-CALC | SOP docx, "Calculations (WIP)" tables and "Scorecard Section" list |
| SOP-CHK | SOP docx, four checker business-rule tables |
| img28 | SOP shrink-classification flowchart |
| img10 | SOP "Scorecard Metrics Tracing as of Aug 2025" diagram (low resolution; table names read visually) |
| img17 / img21 | SOP Confidence Indicator slides (pp. 15, 16) |
| img20 | SOP "System Update Timeline (MNL time)" |
| img22 | SOP Airflow / RACI diagram |
| D03 / D05 / D06 | Debriefs 03 Scorecard Debrief, 05 Answers and Flags Register, 06 Build Spec (Phase 0-1) |
| GVC | `GTT_VERINT_CAPTURE_FINDINGS_AND_ROADMAP.md` (verified vs code 2026-09-18, GTT rows re-checked 2026-09-21) |

Scorecard facts: weekly, published EOD Wednesday [SOP-UG 1.1]; week-level view `ti-ca-ml-start.ods_dq_wfm.vw_wfm_combined_v2_Targets`, day-level `vw_wfm_combined_v3_Targets`, staffing strategy `ods_raw_ibis.vw_compilators_pivot_v2` [SOP-CALC]. Project id conflicts with an earlier note (`ti-ca-ml-dash-start`), see D05 C7/X1.

**Global Summary aggregation rules** [SOP-CALC]

| Rule | Detail |
|---|---|
| Ratio of sums | Each % is SUM(numerator) / SUM(denominator) over the filtered rows, never an average of row percentages |
| Multi-week | Head counts (Assigned TM etc.) = SUM / number of weeks selected |
| Above FA level | Enabled FTE and Production FTE use an **FTE Hours-weighted average**; FTE Hours = average contracted hours of agents per account, updated weekly; example `SUM(Production_TMs*Hrs_TM_Week)/SUM(Production_TMs)` |
| Join | Everything joins on the master list (Week, Account, Geo, Site, Master_Account) [D05 §2.3] |
| Roster | Workday snapshot taken every **Monday** [SOP-UG 1.1] |

---

## 2. Metric catalog

Formulas copied from [SOP-CALC] ("Workforce Metrics & Calculations" table) unless noted. "Per SOP" source column is the SOP's own wording.

### 2.1 Workforce metrics table

| Metric | Formula (verbatim) | Inputs | Source per SOP | Granularity |
|---|---|---|---|---|
| Assigned TM | `SUM(Assigned TM)`; if multiple weeks, divide by week count | Assigned_TM | Workday | Account x site x week (Mon snapshot). Includes agents + trainees, active, regardless of On Leave |
| Enabled FTE | `SUM(Enabled_TM * FTE Hours)/40`; FTE Hours-weighted avg above FA level | Enabled_TM, Hrs_TM_Week | Workday | Week. WFO + WFH TMs **not** On Leave |
| Trainee Loss % | `SUM(Trainee_TM) / SUM(Assigned_TM)` | Trainee_TM, Assigned_TM | Workday | Week. Trainees not On Leave |
| Production FTE | `(SUM(Production_TMs)*FTE Hours)/40`; weighted above FA | Prod_TM_WFO + Prod_TM_WFH, Hrs_TM_Week | Workday | Week. Agents not On Leave |
| Scheduled Loss % | `(Prod_FTE-Sched_FTE)/Assigned_FTE` | Production FTE, Sched FTE = `Base schedules/60/40`, Assigned FTE | Workday, Data Collection File | Week |
| Attended Loss % | `(Sched_FTE-Attended_FTE)/Assigned_FTE` | Attended FTE = Base Sched minus all OOO shrink, in hours / 40 | Workday, Data Collection File | Week |
| Nonbillable Loss % | `Nonbillable_FTE/Assigned_FTE` | Nonbillable FTE = nonbillable shrink in hours / 40 | Workday, Online Shrink File | Week |
| Billable Loss % | `(Attended FTE - Nonbillable FTE - Total Billable FTE)/ Assigned FTE` | Attended FTE, Nonbillable FTE, Billable FTE | Workday, Data Collection File, Online Shrink File | Week |
| Payable Enabled FTE | `SUM(All Billable Mins) /60/40` ("All" = production + classroom + nesting) | Production, Classroom, Nesting billable mins | Data Collection File | Account x day, rolled to week |
| Billable to Payable % | `Payable Enabled FTE / Enabled FTE` | as above | Workday, Data Collection File | Week |
| Billable Prod FTE | `SUM(Production Billable Mins)/60/40` | Production_Billable_Mins | Data Collection File | Week |
| Billable % of Production | `Billable Prod FTE / Production FTE` | as above | Workday, Data Collection File | Week |
| Billable Hours | `Billable Mins/60` | Billable mins | Data Collection File | Week |
| Staffing Loss % | `(Assigned_FTE -Payable Enabled FTE) / Assigned_FTE` | as above | Workday, Data Collection File | Week |
| Book to Bill | "If calculation is just in FA level, Billable FTE/Required FTE is fine"; else use the check table below | Billable FTE, Required FTE | (Required FTE: planning models, SOP-UG 1.2) | Week |

### 2.2 Book-to-Bill check table [SOP-CALC]

| Field | Formula | SOP example | Note |
|---|---|---|---|
| Billable FTE | `Billable Mins/60/40` ("Prod and Nesting Billable Mins") | 435,595 mins -> **19.86** | Arithmetic is wrong: 435,595/60/40 = 181.5 [D05 S1]. O/U 2.77 is consistent with 19.86 |
| O/U | `Billable FTE - Required` | 19.86 - 17.09 = 2.77 | |
| Opportunity/Gap | "If O/U is negative, ABS(O/U) / Required FTE" | 16.21% | Example applies it to a positive O/U [D05 S2] |
| B2B | "If O/U is negative, 1 - Opportunity/Gap. If O/U is positive, 1 + Opportunity/Gap" | 116.2% | |

Billable definition differs: Payable FTE = production + classroom + nesting; B2B check = production + nesting [D05 S3].

### 2.3 "Scorecard Section" metrics [SOP-CALC]

| Metric | Formula (verbatim) | Inputs | Source per SOP | Granularity |
|---|---|---|---|---|
| Assigned TMs | `SUM(Assigned_TM)` | Assigned_TM | Workday | Week |
| Enabled TMs | `SUM(Enabled_TM)` | Enabled_TM | Workday | Week |
| Trainees | `SUM(Trainee_TM)` | Trainee_TM | Workday | Week |
| Production TMs | `SUM(Prod_TM_WFO) + SUM(Prod_TM_WFH)` | Prod_TM_WFO/WFH | Workday | Week |
| Trainee % | `SUM(Trainee_TM)/SUM(Assigned_TM)` | | Workday | Week |
| Total Shrink | `(sum(Combined_PlannedAbs_Mins) +sum(Combined_UnplannedAbs_Mins) +sum(Combined_AdminAbs_Mins) +sum(IFNULL(wo_billable,0))+SUM(IFNULL(wfh_billable,0))+SUM(IFNULL(wo_non_billable,0))+SUM(IFNULL(wfh_non_billable,0))) / sum(Combined_BasedSched_Mins)` | OOO abs mins (3 classes) + online shrink billable/nonbillable (WO and WFH) + base sched | Data Collection + Online Shrink Files | Day (v3), rolls to week. Includes **billable** online shrink [D05 S7] |
| Absenteeism | `SUM(Combined_UnplannedAbs_Mins)/SUM(Onsite_Base_Sched_Mins, ,WFH_Base_Sched_Mins)` | Unplanned abs, onsite + WFH base sched | Data Collection File | Day; SOP syntax is malformed [D05 S9] |
| Onsite | `SUM(Onsite_UnplannedAbs_Mins)/SUM(Onsite_Base_Sched_Mins` | | Data Collection File | Day |
| Remote | `SUM(WFH_UnplannedAbs_Mins)/SUM(WFH_Base_Sched_Mins` | | Data Collection File | Day |
| Production TM % of Assigned | `SUM(Plan)/SUM(Reqd)` | Planned FTE, Required FTE | planning tools | Week. Label and formula do not match [D05 S4] |
| Billable % of Production | `SUM(Billable Prod FTE) /SUM(Production FTE)` | | Workday + DCF | Week (duplicate of 2.1) |

### 2.4 Named without any formula [SOP-CALC "Scorecard Section" list]

| Metric | Gap | Likely inputs (our inference, unconfirmed) |
|---|---|---|
| Utilization % | No formula in SOP. COPC version is `(Productive + Available) / Paid Hours Onsite` [GVC §7] | Productive and available minutes |
| Book to Bill Understaff | No formula | Book to Bill < 100% |
| Nonbillable Online Shrink | Defined in prose only [SOP-UG 1.2] | Online Shrink File nonbillable column |
| TPH (Transactions per hour) | No formula | Transactions / Billable hours |
| Requirements, Planned FTE to Required, Planned FTE, Required FTE | No formula; Required/Planned are "WFM planning and forecasting models" [SOP-UG 1.2] | Staffing strategy retrieval (Req_FTE_1_8_Weeks, Req_FTE_9_Weeks, Planned_FTE) [D05 §2.3] |
| Transactions (tile) | "Call/Contact center platform statistics" [SOP-UG] | Productivity Tracker (typed integer per channel x day) |

**Total count:** 16 (table 2.1) + 4 B2B-chain fields + 11 section metrics + ~8 named-only ≈ 35 distinct, after removing duplicates.

### 2.5 Fixed rules the formulas rely on [SOP-UG, img28]

| Rule | Value |
|---|---|
| Base schedule | Full normal week for every active TM, incl. planned absence and bank holidays; 40h TM = **2,400 min** always |
| Trainees | Excluded from base schedules, out-of-office shrink and in-office shrink (but included in Assigned TM) |
| Planned vs unplanned | Decided by whether WFM knew **at schedule lock/publish**. Exception: real-time VTO is always planned |
| Always unplanned | Callout, NCNS/AWOL, lateness, early-out (even if later excused); PTO approved after publish |
| Admin shrink | Attrition pending, parental leave starting early, new medical leave, quarantine, absconding: stays on schedule until Workday shows "on leave"; once on leave, counted as shrink but removed from base schedule and OOO shrink |
| Bank holiday | Planned, reported in base schedule **and** OOO shrink |
| In-office shrink (8) | Paid break, discretionary break, billable training, non-billable training, coaching, team meetings, activities (HR etc.), system issues. Expressed as % of base schedule |

---

## 3. Input availability

Confidence legend: **H** = field exists in verified code/doc; **M** = plausible, needs a spike; **L** = hypothesis; **X** = not obtainable from our sources.
"Verint ext" = the network-intercept extension (`calendar-filter`, `work-resources`, `activities`) [GVC §3-4]. "Cap" = captured today vs available-not-captured.

| Input (SOP column) | GTT | Verint ext | Workday | Other / blocked | Confidence |
|---|---|---|---|---|---|
| Onsite/WFH_Base_Sched_Mins | No | `publishedSchedule.events[]` captured; shift minutes derivable | Hrs_TM_Week (contract) for sanity | Needs 2,400-min normalization and trainee exclusion (Workday). Country schedules (e.g. 46.25h) break the fixed 40h divisor [D05 S10] | **H** capture, **M** normalization |
| Onsite/WFH_UnplannedAbs_Mins | Clock in/out + AUX events give presence | `adherence.violations[]`, `actualSchedule.events[]` captured | Leave status | Needs published-vs-actual join per day; lateness/early-out derived as partial-shift gap. Overrides (`adheranceOverrides`) not captured | **M** (GTT x Verint reconciliation already built) |
| Onsite/WFH_PlannedAbs_Mins | No | Absence activities in schedule (if tagged) | Approved-PTO dates (not in Workday roster extract) | **Schedule publish date** not captured (`draftSchedule` not read); real-time VTO tag unknown | **L** |
| Onsite/WFH_AdminAbs_Mins | Daily no-show only | Same as unplanned | **Workday on-leave status** (the only authority) | Cannot be separated from unplanned without Workday leave feed | **L** |
| Paid Break, Discretionary Break, Lunch | `event_type`: `break-1`, `break-2`, `lunch`, `personal-time-(bathroom)` observed live 2026-09-21 | Activities with `isPaid` flags | No | Mapping aux code -> SOP column is a per-account convention (not in sources) | **M** |
| Coaching/Feedback, Team Meeting | `team-meeting` observed; coaching code not seen | Scheduled activities by name | No | Same mapping gap | **M** |
| Training Billable / Non-Billable | `training-client` observed | Activity names only | No | **Billable vs non-billable needs the SOW billability map** (not in any source) [D06 §11] | **L** (split), **M** (training total) |
| Activities (HR), System Issues | Unknown aux codes; all 22 GTT columns are documented in `GTT_JSON/CR Function - GTT Post Morten Report.docx` (end time 10-11, duration 12, comment 14, UTC 17-20 not yet parsed) | Unknown | No | System issues usually a manual reason code | **L** |
| Billable / Non-Billable online shrink totals | Derived from aux sum | Derived | No | Today typed by hand next to the aux columns and checked by SHR-04 [D05 O2]; needs billability map | **L** |
| Production_Billable_Mins | `productivity`, `phone-auto-in` events (proxy) | `actualSchedule.events[]` productive minutes via `isPaid`/`isWork` (proxy) | No | "Billable" is a contract concept; 5 contract types not delivered [GVC §5]. Proxy only | **L** |
| Classroom_Billable_Mins | `training-client` | Training activities | Trainee flag (Workday training org) | Contract rule | **L** |
| Nesting_Billable_Mins | No | No | Nesting = trainee still in training sup-org | Nesting window is a Workday/ops attribute | **L** |
| Assigned/Enabled/Trainee/Prod TM, Hrs_TM_Week, WFO/WFH split | `workday_id`, `subgroup`, `site`, `cost_center`, `supervisor` per event (cross-check only) | `work-resources` org/name; `extendedWorkResourceDetails` not inspected | **System of record** (Monday snapshot) | Command Center should read Workday, not infer. `workday_id` = canonical join key [project memory], currently reconciler still joins on surname [GVC §5] | **H** as join key; **X** as source of counts |
| Site / work arrangement (onsite vs WFH) | GTT `site` code is a hint | Not exposed | WFO/WFH counts | No per-employee WFH flag known | **M** (site), **L** (employee) |
| HOOP (hours of operation) | No | Schedule open/close gives actual, not declared | No | HOOP master list sits with reporting team [D06 `ref_hoop`] | **X** |
| Transactions (Productivity Tracker) | No | No | No | ACD/telephony or case system; not reachable [GVC §7] | **X** |
| Required FTE / Planned FTE | No | Forecast module is a different Verint surface, never captured | No | Resource-planning tools | **X** |

**Capture status recap (GVC):** GTT is one REST pull per day per FA+sites with a 22-column row (only ~14 parsed); Verint is read-only interception of three endpoints. Today's join is surname-based, not `workday_id`.

---

## 4. Extraction priority ranking

Ranked by metrics unlocked, tie-broken by effort and dependency. Metric counts are approximate (our mapping from section 2; a metric may appear under more than one rank because it needs several inputs). Effort is an engineering estimate, not a commitment: S = days, M = 1-2 weeks, L = 3+ weeks or external dependency.

| Rank | Extraction | Metrics unlocked | Effort | Depends on / blocker |
|---|---|---|---|---|
| 1 | **Verint base scheduled minutes** per TM per day from `publishedSchedule.events[]`, normalized to the SOP convention (2,400 min/week for a 40h TM; trainees excluded) | ~7: Scheduled Loss %, Attended Loss %, Total Shrink, Absenteeism, Onsite, Remote (all denominators), Billable Loss % (via Attended FTE) | M | Normalization rule for non-40h countries (D05 S10); Workday trainee flag. Already captured; this is parse + aggregate |
| 2 | **GTT x Verint unplanned absence** (callout/NCNS/late/early-out) minutes per day | ~7: Absenteeism, Onsite, Remote, Attended Loss %, Attended FTE, Total Shrink (unplanned term), Billable Loss % | M | Reuses the existing reconciler; add partial-shift minutes (late/early) and `adheranceOverrides` suppression; move join to `workday_id` |
| 3 | **In-office aux minutes** from GTT `event_type` plus Verint activities, mapped to the 8 SOP categories | ~7: Total Shrink (online terms), Nonbillable Loss %, Billable Loss %, Nonbillable FTE, Nonbillable Online Shrink, SHR-04-type sums, Utilization (partial) | M for totals, L for billable split | Billable/non-billable split blocked on SOW billability map (per account); coaching, HR-activity, system-issue codes unseen; GTT duration (col 12) and end time (cols 10-11) not yet parsed |
| 4 | **Productive / billable minutes** from Verint `actualSchedule` (and `byActivity` summary) | ~10: Payable Enabled FTE, Billable to Payable %, Billable Prod FTE, Billable % of Production, Billable Hours, Staffing Loss %, Billable Loss %, Book to Bill and O/U (billable side only), Opportunity/Gap, B2B | L | **Proxy only**: billable is contractual; 5 contract types outstanding [GVC §5]. Treat output as a cross-check against the typed value, not a replacement. Invoice-relevant (D05 O1), so strictest validation |
| 5 | **Planned absence + schedule publish date** (`draftSchedule`, approvals) | ~3: Total Shrink planned term, planned/unplanned split for all absence metrics, GEN-05 | L | Publish date per account/week (D06 §11); not in any captured field. Prerequisite for correct "planned vs unplanned" |
| 6 | **Onsite vs WFH attribution** | ~3: Onsite, Remote, onsite/WFH checker rules (ABS-04..07, SHR-05..08) | M | Possibly GTT `site`; otherwise Workday WFO/WFH counts. Unverified |
| 7 | **Workday fields via GTT** (`workday_id`, subgroup, cost center, supervisor) | 0 new metrics; join key + cross-check of Assigned/Enabled/Trainee counts | S | Cross-check only. Roster counts stay with Workday |
| - | Out of reach | Transactions, TPH (ACD); Required FTE, Planned FTE, Book to Bill denominator, O/U, Opportunity/Gap, B2B, Staffing Strategy section (planning tools); Utilization needs an "Available" bucket | - | See GVC §7 future to-do list |

**Reading the table**

- Ranks 1-2 give the absence family and a defensible weekly Absenteeism % with no new system. Cheapest path to something Finance-visible.
- Rank 3 is partly achievable now: totals of aux minutes are available, the billable split is not.
- Rank 4 is the largest by count but the weakest in trust; do not feed it into invoicing numbers.
- Two items from GVC §6 raise ranks 1-2: `workday_id` join (item 2 there) and overrides capture (item 3 there).

---

## 5. Implications for RTA alert rules

Alerts are live and per-employee/day; the scorecard classification is weekly and rule-based. Alert logic should emit events that classify the same way the scorecard will.

| SOP rule | Alert-rule consequence |
|---|---|
| Lateness / early-out is always unplanned, even if later excused [SOP-UG 2C, img28] | Tag the event `unplanned` at creation; a later excuse must **not** reclassify it. Excuses may suppress the alert, not the shrink minutes |
| Trainees excluded from base schedule and shrink [SOP-UG] | Filter trainees (Workday training org) out of alert targets and out of attendance counts; otherwise nesting agents inflate Absenteeism |
| Long leave not yet entered in Workday looks like a daily no-show [SOP-UG 1.x, img28] | Repeated consecutive no-shows with no call-in -> classify as **admin shrink**, not unplanned; escalate to a leave-entry task for the owner instead of re-alerting daily |
| Real-time VTO is always planned [SOP-UG 2B] | Needs a VTO tag in Verint/GTT (not known to exist). Without it, VTO looks like early-out and is overcounted as unplanned |
| PTO is planned only if approved before schedule publish [SOP-UG 2B/C] | Needs publish date per week (rank 5). Until then, PTO-after-publish cannot be distinguished; flag as `unclassified-absence` rather than guessing |
| Bank holidays planned, in base schedule and OOO shrink | Suppress alerts on account-closed days; closed-day activity is itself a checker flag (ABS-02/BIL-02/SHR-03/TRX-02) |
| Data/activity outside HOOP is a flag [SOP-CHK Purple/Orange] | Out-of-HOOP clock-ins should raise an *informational* alert; needs HOOP list (reporting team) |
| Base schedule must be a full normal week [SOP-UG] | Don't compute "attended %" off partial-week schedules; mid-week joiners/leavers need explicit handling |
| Confidence counts validated flags as passes [img21] | If alerts feed validation, a business-partner "validate with reason" path must exist (D06 §5.3); don't re-alert validated flags (D06 §4.3) |

---

## 6. Contradictions and new findings vs Debriefs 05 / 06

| # | Finding | Evidence | vs D05 / D06 | Action |
|---|---|---|---|---|
| **N1** | **Evaluation grain is explicit.** One check per calendar day per account/country for absenteeism and online shrink; one per week per account/country for billable minutes, staffing strategy and transactions. Days without operations are still evaluated (to confirm no data). Accounts that cannot provide transactions have no transaction evaluations. **Staffing strategy is a fifth checked area** | img21 | D06 §6 lists four checkers at account x LOB x site x day and checks billable per day; grain here is account/country, not LOB/site | Align rule catalogue grain and denominators before back-test; add staffing-strategy rules to P0-1 scope |
| **N2** | The SOP's 1,700 evaluations ~ 120 account/country pairs x 7 days x 2 daily checkers (1,680). Weekly checks would add ~3 per pair (~360). Suggests the example is illustrative or counts only the daily checkers | Arithmetic on img17/img21; 120 pairs is **our assumption** | Supports D05 C1 (1,700 is evaluations, not rules) but not the count | Ask reporting team for the real evaluation count per week |
| **N3** | Thresholds: validation expectation 100%, tolerance floor **85%**; assumed baseline checker pass **80%**; 97% = 1 - 0.20 x 0.15 floor. Confidence formula stated two ways, equivalent: `1 - (flags - validated)/evaluations`; checker pass rate counts validated flags **as flags** | img17, img21 | D05 uses 80/85 only as worked-example inputs; D06 §4.2/§6.1 encodes 97% but no validation-rate floor or pass-rate baseline alert. D06 acceptance of "within +/-0.5 of legacy (81.7% / 85%)" has no stated source in the SOP | Add `flag_validation_rate` (floor 85%) and `checker_pass_rate` (baseline 80%) as tracked metrics. Note img21: "Confidence does not prove accuracy" (it tests 0/non-0 and ordering, not magnitude) |
| **N4** | Airflow lane (img22) sits between the typed files and the staging views: consolidated data collection -> `ods_dq_wfm.vw_wfm_capacity`; productivity tracker -> transactions view; consolidated online shrinkage -> `vw_wfm_onsite_hours`; retrieval files -> `ods_raw_ibis.vw_compilators_pivot_v2`; capability -> `ods_raw_datanitiv.schedule_planner`; Workday TM_FTE count -> `vw_tm_fte_count`. Combined v2/v3 and `vw_datanitiv_ibis_joined` sit outside Airflow, in the Global Reporting lane | img22, img10 (table names from low-res images) | Resolves **X4** in favor of "Airflow orchestrates a Sheets->BigQuery copy" for the typed files. Does not show the Datti upload that D05 C4 reports | Confirm via DAG list (B4). Names above are read visually; verify against BigQuery |
| **N5** | Publish timing: SOP text says EOD Wednesday; timeline (Manila time) appears to show scorecard preview 8:30 PM and public 8:30 PM on Wed/Thu, data-collection final update 1:00 AM Thursday, global staffing official 7-8 PM. Manila is ~12h ahead of Eastern, so "Thursday 8:30 PM Manila" is Thursday morning Eastern | img20 vs SOP-UG 1.1; D06 §5.2 (Tuesday cut, official EOD Wed); SOP troubleshooting row: "check back later that day or on Thursday morning" | D05 Q11 treats "Wednesday" as settled; D06 hard-codes Tuesday cut / Wed official | Timezone of "EOD Wednesday" is undefined; column alignment in img20 is imprecise. Ask reporting team to confirm timestamps in one timezone |
| **N6** | Staffing strategy carries **two Required-FTE horizons**: `Req_FTE_1_8_Weeks` and `Req_FTE_9_Weeks`. SOP shows a single "Required FTE" and never says which one feeds Book to Bill / O/U | D05 §2.3 columns; SOP-CALC | Neither D05 nor D06 flags this | Ask which horizon the scorecard uses per view; matters for any recomputation |
| **N7** | RACI (img22) puts Accountable on **Global Reporting** for Absenteeism, Online Shrink, Staffing Loss, Transactions/hr and Staffing Strategy; WFM data delivery teams appear as Responsible/inputs | img22 (low-res; letters hard to read) | D06 §4.3 escalation goes submitter -> account owner (at cut) -> director (at preview). Not the RACI accountable party | Reconcile before building escalation; verify RACI reading with a higher-resolution copy |
| **N8** | **Pre-fill is narrower than D03 §6.2** ("computes scheduled, absent and productive minutes... 40-50% of accounts need no entry"). Per column: Data collection (14): base sched x2 feasible; unplanned x2 feasible; planned x2 needs publish date; admin x2 needs Workday leave; billable x3 proxy only. Shrinkage (16): aux columns plausible from GTT/Verint; Billable and Non-Billable totals blocked on billability map; Site feasible. Productivity (6): none (transactions need ACD). Staffing strategy and Workday counts are outside entry entirely | Section 3 of this doc vs D03 §6.2, D06 §11 | D03's 40-50% estimate is gated by time-clock coverage (D03) and now additionally by billability, publish date, leave status and 40h normalization | Re-baseline the Phase 2 value case on cells pre-fillable (roughly 8-10 of 36 input columns reliably) rather than accounts |

---

## 7. Open questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| Q-A | Does the scorecard really use `Base schedules/60/40` with 40h for every country, or per-account contracted hours (FTE Hours)? Conflicting formulas (Enabled FTE weights by FTE Hours; Sched FTE does not) | Reporting team | Rank 1 normalization |
| Q-B | Where does the "billable" definition come from per account (SOW/contract)? Is there a machine-readable billability map of aux code -> billable? | Account owners / Finance | Ranks 3, 4 |
| Q-C | Which GTT `event_type` values exist per account, and which map to coaching, HR activity and system issues? What are GTT columns idx 10-11 and 14-21? (Check `POC_Redefined/GTT_JSON/CR Function - GTT Post Morten Report.docx`; not verified here.) | Engineering | Rank 3 |
| Q-D | Is a schedule publication timestamp exposed by Verint (`publishedSchedule`, `draftSchedule`)? | Engineering spike | Rank 5, GEN-05 |
| Q-E | Is `secondaryTimeRecord.timeTrackingEvents[]` empty or permission-gated? | Engineering spike | Cross-validation of GTT |
| Q-F | Can Workday leave status be read (on-leave flag, dates) alongside the Monday roster? | WFM product lead | Admin shrink, rank 5 |
| Q-G | Is real-time VTO taggable in Verint/GTT? | WFM ops | Planned/unplanned |
| Q-H | Which Required FTE horizon feeds the published Book to Bill? (N6) | Reporting team | Out-of-reach metrics |
| Q-I | Real evaluation count per week and number of account/country pairs (N2) | Reporting team | Confidence parity |
| Q-J | Timezone of "EOD Wednesday" and exact preview/public times (N5) | Reporting team | Week-lifecycle design |
| Q-K | Do Verint tenants for scorecard accounts allow server-direct capture, or only extension relay (Citrix/client-owned)? | Architecture | Coverage of ranks 1-4 per account |
| Q-L | Confirm table names read from low-res diagrams (img10, img22) and project id (`ti-ca-ml-start` vs `ti-ca-ml-dash-start`) [D05 C7/X1] | Data engineering | Any BigQuery work |
| Q-M | SOP defects S1-S13 [D05 §3.2] that change recomputed metrics (S3 two billable totals, S5 undefined Assigned_FTE, S6 trainee mixing) should be resolved before we reproduce any KPI | Definitions track | Any recompute |

**Not verified in this pass:** GTT 22-column schema document was not opened; images img10/img20/img22 are low resolution (table names, timeline alignment and RACI letters read visually); effort sizes and per-rank metric counts are our estimates; the SOP is marked WIP and dated Aug 2025 in places.
