# Verint Extraction — Capabilities, Methods & Load Findings

*What we can read out of Verint via the extension bridge, mapped to the four values leadership asks about
(Daily Attendance · Adherence · Real-Time Alerts · Shift Open/Close), how we explored it, and what it costs Verint.
This is the evidence base that decides what the RTA Command Center can show with **real** data — written before we
build the visuals, on purpose.*

**Status:** living document. Grounded in: the live gate run 2026-06-11 ([../dry_run/results_template.md](../dry_run/results_template.md)),
the netcap captures (`runs/netcap_20260604T1610360300/`), and the existing parser/pipeline.

---

## 1. Methods — how we explore Verint (and the rules we hold)

| Method | What it is | Read/Write | Notes |
|--------|-----------|------------|-------|
| **Extension bridge (passive)** | `inject.js` tees Verint's *own* `fetch`/XHR responses as the RTA uses the calendar | **read-only** | What populates the Command Center today; zero extra load (rides the app's own calls) |
| **Gate probe (active)** | `inject.js` re-fires a body-rewritten *copy* of the captured `calendar-filter` from the RTA's authenticated context | **read-only** (GET-equivalent POST) | "active polling" — composes its own reads; flagged for governance. Used to prove the `workResourceIds` primitive. See [decisions/0005](decisions/0005-probe-via-extension-not-console.md) |
| **Netcap (offline)** | Pure-Playwright recording of responses to disk for structural analysis | read-only | Source of the field inventory below; PII stays local |

**Binding rules** (apply to every method): read-only — we never write to Verint; sequential, never parallel bursts;
abort on `5xx`; conservative cadence; PII (names) stays local/transient; low-traffic windows; coordinate with Dione.
The whole point of the architecture is that the *safe* path (targeted pulls) is also the *capable* one.

**The endpoint.** Everything below comes from **`POST /api/wfm/main/v2/calendar-filter`** (JSON:API-wrapped at
`data.attributes.calendarFilterCriteria`). Two shapes:
- **Census** (`useAllEmployees:true`, paged by `offset`) → who's on the floor, identity/LOB, summary metrics.
- **Targeted** (`useAllEmployees:false` + explicit `workResourceIds`) → detailed adherence/schedule/time-record for
  the people we name. **Proven 2026-06-11:** Verint honours self-composed ID sets exactly (V2 10/10, V3 6/6, V4 12/12).
Identity↔name join uses `/api/wfm/main/v1/work-resources`; activity names use `/api/wfm/main/v1/activities`.

---

## 2. The four value areas — what we can extract today

| Value area | Coverage | Source fields (calendar-filter) | Gap / how to close it |
|------------|----------|----------------------------------|------------------------|
| **Adherence** | ✅ **Full** | Targeted: `adherence.violations[]` (Verint's OWN out-of-adherence verdict — planned vs actual activity, start/end, duration). Census: `adherenceSummary.{percentInAdherenceByInterval, violationMinutesPerInterval, publishedMinutesPerInterval}` | None. The live pipeline already consumes this (`verint_calendar_parse.py` → `verint_triage.py`). We *triage* Verint's verdict; we don't re-detect. |
| **Real-Time Alerts** | ✅ **Full** | Derived from `adherence.violations[]` → triage → card → routed draft message | None — architecture is in place (severity by duration + escalation cycle; LOB→channel routing). This is what the Command Center already renders. |
| **Shift Open/Close** | ⚠️ **Derivable** | `actualSchedule.events[]` (per-activity blocks: activityId, startTime, endTime, durationMinutes, isPaid, isWork) + `publishedSchedule.events[]` (planned) | No explicit "shift" object. Derive: per employee-day, **shift open = min(startTime), close = max(endTime)**; planned-vs-actual start/end deltas = late-in / early-out. Worth confirming `publishedSchedule` exposes a shift-level boundary. |
| **Productive Hours** *(req: Evelyn Brooks)* | ⚠️ **Derivable** | `actualSchedule.events[]` summed where `isWork`/`isPaid` = true, cross-referenced with the activities catalog (`/api/wfm/main/v1/activities` paid/work classification) | None blocking — it's the same schedule data, just an aggregation pass (see [FUTURE_FEATURES.md](../../docs/FUTURE_FEATURES.md) §2). Define which activities count as "productive" with the team. Pairs naturally with Shift Open/Close on the same `events[]`. |
| **Daily Attendance** | ⚠️ **Partial now → ✅ when GTT lands** | `actualScheduleSummary.byActivity[]` (aggregate worked time) + the shift-open/close derivation above → no-shows, late starts, early logouts | **Clock-in/out is the gap.** `secondaryTimeRecord.timeTrackingEvents[]` was **empty** in our capture; true punch data comes from **GTT/Workday**. **GTT API credentials are being procured (Mateus, in progress)** → once granted, attendance becomes proper API access (join on employee id), not just schedule deltas. Until then: scheduled-vs-actual-schedule deltas. |

**Bottom line:** **Adherence and Real-Time Alerts are fully extractable today** (and already wired). **Shift Open/Close**
and **Productive Hours** (Evelyn Brooks' ask) are both one aggregation pass away over the same `actualSchedule.events[]`.
**Daily Attendance** is partially there from schedule data today and becomes **full API access once the GTT/Workday
credentials land** (in progress) — consistent with [FUTURE_FEATURES.md](../../docs/FUTURE_FEATURES.md) §3.

---

## 3. Field inventory (reference)

**Targeted shape** (`resourcePluginIds`: `secondaryTimeRecord, adherence, actualSchedule, adheranceOverrides`):
- `resourceData[].id` — Verint employee id (join key)
- `resourceData[].adherence.violations[]` — `{plannedActivityName, plannedActivityId, startTime, endTime, actualEventData[]{label, isNone, start, end}, isApproved, comment}` ← **the OOA verdict**
- `resourceData[].actualSchedule.events[]` — `{activityId, startTime, endTime, durationMinutes, isPaid, isWork, eventType}` ← **shift blocks**
- `resourceData[].secondaryTimeRecord.timeTrackingEvents[]` — clock/time events *(empty in our capture)*
- `resourceData[].adheranceOverrides.overrides[]` — sanctioned exceptions

**Census shape** (`resourcePluginIds`: `workResourceDetails, actualScheduleSummary, adherenceSummary, publishedSchedule, draftSchedule, secondaryTimeRecordSummary, extendedWorkResourceDetails`):
- `resourceData[].workResourceDetails` — `{id, name{first,last}, organizationName (= LOB), organizationId, tenantId}`
- `resourceData[].adherenceSummary` — interval-rollup adherence %
- `resourceData[].actualScheduleSummary.byActivity[]` — aggregate time per activity
- `resourceData[].publishedSchedule.events[]` / `draftSchedule.events[]` — planned / draft blocks

*(Parser paths: `verint_calendar_parse.py` lines ~58–135. Pipeline: triage → `card_builder` → `alert_formatter` →
LOB channel routing.)*

---

## 4. Load & crash-risk findings (preliminary — we deliberately did NOT stress-test)

We are characterising cost to **avoid** crashing Verint, not probing its breaking point. One run, conservative.

- **F1 — Census is expensive; targeted pulls are cheap.** A broad `useAllEmployees` census over the calendar's
  **multi-week** view window returned **21,501 rows in ~88 seconds** (a single request!). Every **targeted
  `workResourceIds` pull returned in ~0.6–0.7s.** → **Design rule:** the census tier must be **rare and tightly
  bounded** (a **1-day** view window, real pagination); the **targeted pull is the workhorse**. Never issue a broad
  multi-week census on a cadence.
- **F2 — No rate-limiting seen** on the targeted pulls (no `429`, no `Retry-After`); latency steady ~0.6–0.7s across
  repeats. Encouraging, **not** a licence to hammer — cadence to be set as a per-tenant budget with adaptive backoff
  ([decisions/0004](decisions/0004-per-tenant-rate-budget-and-backoff.md)) and **ratified with the Verint vendor**
  (Ruairi's intro), not assumed.
- **F3 — The ceiling is per-tenant.** `wfo.a87` serves EPIC + CIBC + others on one backend, so total req/min on the
  *tenant* (summed across accounts) is the number that matters — not per-account cadence.
- **Open / to investigate:** what exactly blows up the census (the multi-week window? `summaryIntervals`? offset
  semantics?) — pin the census to a 1-day window and re-measure. Confirm `secondaryTimeRecord` is genuinely empty vs.
  privilege-gated. Find the real shift-boundary object if one exists.

---

## 4b. Verified live in code (2026-06-11) — the 🟡 derivations actually compute

Wired into the live parser (`verint_extension/parse.js`) and confirmed against the netcap capture (`tsc` clean):
- **Adherence %** — from `adherenceSummary` (`(Σpublished − Σviolation)/Σpublished`). Real values now populate live
  cards (e.g. 28% / 39% / 42% in-adherence) instead of the old hardcoded 0. Renders in CopilotPanel + ProcessView.
- **Shift Open/Close + span** — min/max of `actualSchedule.events[]`. Real spans ~5–6h per agent.
- **Productive minutes** — computed two ways. **Empirical catch:** every EPIC `actualSchedule` event is flagged
  `isPaid:true` but **`isWork:false`**, so "productive = work" reads **0**; "productive = paid" gives meaningful
  numbers (~240–347 min). **⇒ the productive-hours *definition* must come from the activities catalog + the team**
  (paid vs work vs an explicit productive-activity list). The UI defaults to **paid** with that caveat. This is a
  step-(c) config decision, now backed by real data.

(Implementation: `parse.js` now field-merges the census + targeted response shapes per employee so adherenceSummary,
actualSchedule, and adherence.violations are all available together — previously it kept only one shape and dropped
the summary.)

## 4c. Forward constraint — "Load Contract Rules" (paid/productive is client-defined)

What counts as **paid** / **productive** is **not ours to decide** — it's defined by the **client's contract rules**,
owned by **Evelyn Brooks' team**. Known so far: there are **5 distinct contract types**, **not yet in our possession**.

Implication: the productive-hours (and attendance) computation must be driven by a per-client/per-contract
**"Load Contract Rules"** input — a classification layer mapping Verint activities + `isPaid`/`isWork` flags to that
client's paid/productive definition — rather than a hardcoded rule. This belongs in the **tenant manifest / control
plane** (config, not code). For now the UI shows raw **paid minutes** with an explicit "definition pending contract
rules" caveat; we wire the real classification when the 5 contract specs arrive. *(Captured now to avoid baking a
wrong assumption; revisit when the contracts land.)*

## 5. What this means for the next steps

1. **Command Center surfaces (next):** the panes that can show **real** data *today* are the adherence/alert surfaces
   (already wired) plus a derivable **shift open/close** read. Attendance shows scheduled-vs-actual until the
   GTT/Workday join lands. We'll audit the CC UI against this table — what to light up with live data, what to label
   "needs GTT."
2. **The config panel (later):** once we know what's extractable, the RTA/Scheduling team picks **what they want to
   see within their reporting cycles** — a checkbox-driven panel over these value areas. This doc defines the menu of
   the *possible*; the team's needs define the *default*.
3. **Production refresh:** promote the probe's body-rewrite into the real LOB-scoped scheduler — census rarely + 1-day
   bounded, targeted pulls driven by attention, per-tenant budget + backoff.
