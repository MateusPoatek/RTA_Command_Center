# GTT & Verint Capture — Findings, Improvements, and Roadmap

**Status:** living document, findings verified against code as of 2026-09-18.
**Sources:** `POC_Redefined/gtt_adapter.py`, `gtt_gate.py`, `verint_extension/inject.js`, `verint_extension/parse.js`, `docs/handoff/Engineering_handoff_2026-09-15/attendance_gtt/REPORT_SCHEMA.md`, `.../verint_capture/VERINT_EXTRACTION_CAPABILITIES.md`.

This document inventories what the Command Center actually captures today from GTT and Verint, what each source can additionally provide, why each gap matters, and a prioritized list of next steps to close them. It is the reference for a later cross-check against the RTA team's own KPI/formula set — that cross-check is a separate follow-up, not attempted here.

---

## 1. GTT — today

**Method:** direct REST API call, not scraping. `gtt_adapter.py` POSTs to a Cloud Run endpoint (`gttpostmortemreport-...run.app`), authenticated with a GCP service-account-minted identity token (`_mint_token`). One request pulls one day, for one `functionalArea` + `sites` combination. Response is an array-of-arrays; each row is one GTT AUX event for one employee.

| Field | Meaning |
|---|---|
| `site` | GTT site/location code the event was logged under |
| `email` | Employee's corporate email (PII) |
| `workday_id` | 8-digit Workday employee ID |
| `employee` | Full name, "Firstname Lastname" |
| `supervisor` | Employee's supervisor name |
| `cost_center` | Cost-center code |
| `subgroup` | GTT's LOB label (e.g. "CIBC", "CIBC - Costco") |
| `event_type` (aux) | Activity code for this event — not just `clock_in`/`clock_out`; a live pull (2026-09-21, `FA_CIBC`) showed `break-1`, `break-2`, `lunch`, `personal-time-(bathroom)`, `phone-auto-in`, `productivity`, `team-meeting`, `training-client` too — richer than previously documented. |
| `event_dt_eastern` / `event_dt_utc` | Event timestamp, both Eastern and UTC |

**Correction (2026-09-21):** the GTT service-account key (`ti-is-prod-eu-w1-82ce0c6f2e03.json`) had been rotated out — it now fails with a hard `invalid_grant: Invalid JWT Signature`, not the known transient ~65-70% rejection rate documented elsewhere. A new key, `GTT_JSON/td-sa-wfm-gtt-reports02_2026-08-12.json` (same service account, new key ID), was dropped into the repo and is now wired as the default in `gtt_adapter.py` and `gtt_gate.py`. Verified live: 711 rows returned for `FA_CIBC` / `GT - Guatemala - Pradera East` / 2026-06-16.

## 2. GTT — available but not captured/used today

| Gap | What it is |
|---|---|
| **Row shape is bigger than assumed** | A live pull with the new key shows **22 columns per row**, not the ~14 `gtt_adapter.py` assumes (`_parse_row` only reads up to index 13). Indices 10–11 were already flagged as unmapped; indices 14–21 are *also* unmapped and previously unknown to exist at all. Two of the unmapped columns (10, 11) have the same text length pattern (10 / 8 chars) as the known `date_et`/`time_et` pair — plausibly a third timestamp (site-local time?) — but this is a hypothesis, not confirmed; needs checking against `GTT_JSON/CR Function - GTT Post Morten Report.docx` rather than guessed from masked lengths. |
| Underused AUX event richness | `event_type` already carries breaks/productivity/communications, but today these only feed a display chart (`gtt_event_type_counts`) — they aren't used as reconciliation signal. |
| `workday_id` not the actual join key | Present on every row, but reconciliation joins on surname (exact, then fuzzy) — see §5. |
| Single-day pulls only | The API accepts arbitrary `startDate`/`endDate`; nothing stops a multi-day range, just not built. |

## 3. Verint extension — today

**Method:** network interception, not scraping or OCR. `inject.js` runs as a `world: "MAIN"` content script and monkey-patches `window.fetch` and `XMLHttpRequest` to tee Verint's own JSON responses on `*.verintcloudservices.com`, targeting `/api/wfm/main/v2/calendar-filter`, `/v1/work-resources`, `/v1/activities`. Read-only — nothing is written back to Verint.

Currently parsed (`parse.js`): `adherence.violations[]` (the OOA verdict), `adherenceSummary` (adherence %), `actualSchedule.events[]` (shift open/close, productive minutes), `publishedSchedule.events[]` (scheduled shift).

## 4. Verint — available but not captured/used today

| Gap | What it is |
|---|---|
| `adheranceOverrides.overrides[]` | Sanctioned/approved exceptions to a violation — not read today |
| `actualScheduleSummary.byActivity[]` | Census-level pre-aggregated time per activity — an alternate cross-check source for productive hours |
| `draftSchedule.events[]` | The unpublished draft schedule |
| `secondaryTimeRecord.timeTrackingEvents[]` | Verint's own clock events — came back empty in the test capture; unconfirmed whether genuinely unused here or permission-gated |
| `extendedWorkResourceDetails` | Requested (in the census `resourcePluginIds`) but never inspected — likely additional employee metadata |
| `organizationId` / `tenantId` | Only the org *name* is used for LOB labeling; the extension's own gate probe already proved cross-LOB/cross-org reads work on this tenant, but nothing wires the IDs into real capture |
| Activities catalog paid/work classification | Only used to resolve activity names; the catalog's own classification metadata isn't pulled — "productive" is inferred per-event from `isPaid`/`isWork` flags instead |

---

## 5. What each gap unlocks, and why it matters

| Gap closed | Capability enabled | Why it matters |
|---|---|---|
| Join on `workday_id` (once exposed on both sides via an employee master table) | Exact 1:1 employee join, no name parsing | Today's surname join can silently pick the wrong person on a collision, or miss compound-name/compound-surname employees — it corrupts the discrepancy count with no visible error, not just an edge case. |
| Capture `adheranceOverrides.overrides[]` | Auto-suppress alerts Verint itself already considers excused | Every unsuppressed sanctioned exception is a false alert an RTA has to manually dismiss — pure wasted attention, and it multiplies with every account onboarded. |
| Confirm `secondaryTimeRecord.timeTrackingEvents[]` | A second, independent attendance signal alongside GTT | Attendance currently rests entirely on GTT being right. A working second source lets discrepancies be cross-validated instead of trusted on faith. |
| Capture `organizationId`/`tenantId`, wire up cross-LOB reads | True cross-LOB, potentially cross-account floor visibility | This is the concrete technical foundation the multi-account (Golden Cluster) ambition needs — without it, "one command center, many accounts" stays a slide, not a capability. |
| Pull the activities catalog's paid/work classification | A defensible, non-hardcoded productive-hours definition | The current paid-vs-work definition is a guess pending the client's contract rules. Sourcing it from Verint's own catalog is the difference between a number leadership can trust and one that's an assumption. |
| Use full GTT AUX signal (not just clock in/out) | Cross-check GTT-reported breaks/productivity against Verint's own adherence read | Two independent views of the same break/activity window catch capture gaps neither source would reveal alone. |
| Multi-day GTT pulls | Trend data (week/month) instead of single-day snapshots | Every KPI that isn't a same-day number (weekly adherence trend, recurring lateness) is currently unbuildable without this. |
| Identify the 8 unmapped GTT columns (indices 14–21, plus 10–11) | Unknown — could be free additional signal | Cheapest item on this list; costs one document read, not an integration change. Row shape is 22 columns wide, confirmed live 2026-09-21 — bigger surface than first assumed. |

**Open dependency, not solved here:** the "paid vs. productive" definition is blocked on the client's 5 distinct contract types, owned by Evelyn Brooks' team and not yet delivered (`VERINT_EXTRACTION_CAPABILITIES.md` §4c). The activities-catalog item above is necessary but not sufficient — the contract rules still have to land.

---

## 6. Prioritized next steps

1. **Identify the 8 unmapped GTT columns** (indices 14–21, plus the earlier-flagged 10–11) — read `GTT_JSON/CR Function - GTT Post Morten Report.docx`; cheapest possible item, may unlock free signal.
2. **Switch the GTT×Verint join to `workday_id`** once an employee master table exposes it reliably on both sides — removes a whole class of silent matching bugs.
3. **Capture `adheranceOverrides.overrides[]`** — direct false-positive-alert reduction, no external dependency.
4. **Re-test `secondaryTimeRecord.timeTrackingEvents[]`** — confirm empty-vs-gated; if populated, a real second attendance signal.
5. **Capture `organizationId`/`tenantId` and wire up cross-LOB reads** — foundation for the multi-account floor-view ambition.
6. **Pull the activities catalog's paid/work classification** — pair with the contract-rules dependency once it lands.
7. **Add `draftSchedule.events[]`** — proactive shift-change visibility.
8. **Extend GTT pulls to multi-day ranges** — unlocks trend-based KPIs.

Ranking logic: items 1–4 are cheap, code-only, and remove active correctness risk; items 5–8 are capability-building and either depend on wiring more surface area (5, 7, 8) or on an external, not-yet-delivered input (6).

---

## 7. KPI cross-check (2026-09-18) — formulas extracted, most need systems we don't have yet

**Source:** `Functional_Areas_and_WorkdayIDs/2.5 Exhibit 2 (4).xlsx` — a COPC-style KPI definition workbook (9 sheets: Speed of Answer, Abandonment Rate, Utilization, Occupancy, On Time, Backlog, Staffing Forecast Accuracy, Scheduling Volume Forecast Accuracy, Scheduling AHT Forecast Accuracy). Each sheet gives a definition, formula, and benchmark target.

**Finding:** none of these 9 KPIs are fully computable from GTT + Verint as captured today, and 7 of the 9 aren't computable from these two sources **at all**, even with every gap in §2–§4 closed. This isn't a capture-depth problem — it's a data-domain mismatch: GTT + Verint's `calendar-filter` endpoint give attendance and schedule adherence (who worked when, in/out of adherence). This KPI set is contact-center *operations*: call-queue performance, case throughput, and WFM forecast accuracy — domains our current pipeline never touches.

| KPI | Formula | Computable today? | What's actually needed |
|---|---|---|---|
| Speed of Answer | `SL = answered-before-threshold / offered`; `ASA = Σdelay / offered` | ❌ No | ACD/telephony transaction data (offered / answered / delay) |
| Abandonment Rate | `abandoned / offered` | ❌ No | Same ACD/telephony feed as above |
| Utilization | `(Productive + Available Time) / Paid Hours Onsite` | ⚠️ Partial | Have productive minutes + paid-hours-onsite; missing an explicit "Available" activity bucket — same activities-catalog classification gap as §5 |
| Occupancy | `Productive / (Productive + Available)` | ⚠️ Partial | Same missing "Available" bucket as Utilization |
| On Time | `% transactions processed within target cycle time` | ❌ No | Case/ticket management system (e.g. ServiceNow) |
| Backlog | `avg time late of unprocessed transactions` | ❌ No | Same case/ticket system as On Time |
| Staffing Forecast Accuracy | `1 - ABS(Actual - Forecast) / Forecast` (volume) | ❌ No | Verint's *forecast* module output (never captured — we only read `calendar-filter`) + actual transaction volume |
| Scheduling Volume F Acc | `% intervals within ±x% of forecast volume` | ❌ No | Same forecast-module gap |
| Scheduling AHT F Acc | `% days within ±x% of forecast AHT` | ❌ No | Actual AHT (ACD/case handle time) + forecast AHT — neither available |

**Future to-do — when the missing systems/access exist, extract per these exact formulas (don't re-derive):**
1. **ACD/telephony feed** (whichever platform serves as the call-queue system) → unlocks Speed of Answer + Abandonment Rate directly; these two formulas are trivial once offered/answered/delay/abandoned counts exist.
2. **Case/ticket management system** (ServiceNow is the one already named elsewhere in this project as a ticket-routing dependency) → unlocks On Time + Backlog.
3. **Verint forecast module access** (a different Verint surface than the `calendar-filter` endpoint this project currently reads) + actual volume/AHT from #1/#2 → unlocks all three Forecast Accuracy metrics.
4. **Activities-catalog classification** (already ranked #6 in §6's roadmap) → completes Utilization + Occupancy without needing any new system, just deeper use of what Verint already exposes.

## 8. Deferred

Nothing further deferred — the KPI cross-check requested in §7 is now complete. Any *additional* KPI/formula sets, if shared later, should get the same treatment: formula extracted verbatim, checked line-by-line against the field inventory in §1–§4, gap traced to a specific missing system rather than left generic.
