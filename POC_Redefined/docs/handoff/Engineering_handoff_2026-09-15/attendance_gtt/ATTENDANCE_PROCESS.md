# Attendance Process — End-to-End Reference Guide

> **Document type:** Canonical process reference — source of truth for the daily attendance reporting workflow.
> **Audience:** FDAEs, engineers building the Reporting Agent, and any stakeholder reviewing automation scope.
> **Source:** `Daily Attendance Report — Process Guide | CIBC GT & PH` (internal process document, June 2026).
>
> Read this document before touching anything related to attendance, reports, or the Reporting Agent.
> Any discrepancy between this document and other project docs should be resolved in favour of this document.

---

## Quick facts

| Attribute | Value |
|-----------|-------|
| Account | CBC (Canadian Banking Client — CIBC) |
| Execution frequency | Daily, every business day |
| Teams involved | Guatemala RT + Philippines RT (parallel) |
| Number of phases | 5 |
| Key systems | Workday, Google Sheets + Apps Script, GTT, Verint (via VDI), Data Studio / Looker, Google Chat |
| Report recipients | CBC Operations managers + Line of Business leads (Guatemala) |
| Report format | Email with 3 dashboard screenshots + dashboard URL |
| Authoritative data | Verint (previous day, processed by PH RT) |
| Intraday data | GTT (current day, processed by GT RT) |
| Report timing | Not a fixed cadence — sent each time a significant GTT data update is available |

---

## Teams and roles

| Role | Location | Primary responsibilities |
|------|----------|--------------------------|
| **Guatemala RT (Real-Time Analyst)** | Guatemala City | Workday extraction, Justifications file update via Apps Script, GTT report download, attendance script execution, Data Studio refresh, report email to CBC Operations, real-time Verint monitoring (lates, adherence alerts). |
| **Philippines RT (Real-Time Analyst)** | Philippines | Verint data extraction from client VDI, shift-time calculator updates, Verint real-time monitoring, weekend backlog reconciliation on Mondays. Notifies Guatemala RT via Google Chat when complete. |
| **CBC Operations Managers** | Canada (client) | Report recipients. Review intraday attendance snapshots. Confirm agent presence, follow up on no-shows and adherence issues. |

---

## Systems involved

| System | Type | Role |
|--------|------|------|
| **Workday** | HR platform | Source of approved vacation and suspension records for all CBC Guatemala agents. |
| **Google Sheets + Apps Script** | Processing layer | Central hub: Workday files are imported, scripts run, and data is cross-linked between the Justifications file and the Attendance file. Core infrastructure of the entire process. |
| **GTT (Genesys Telecom Tool)** | Telephony platform | Tracks real-time agent logins and call activity. Primary source for intraday attendance snapshots. Downloaded each time a report is sent. |
| **Verint** | Workforce management | Client-owned tool accessed via virtual desktop (VDI). Provides the **authoritative historical** record on agent adherence and schedule compliance. Used for previous-day reconciliation. |
| **Data Studio / Looker** | Dashboard | Visualization layer that pulls from the Attendance file. Shared with CBC Operations for live and historical reporting. Refreshed after each attendance script run. |
| **Google Chat** | Communication | Real-time coordination between Guatemala RT and Philippines RT to sync data completion status between Phase 3 and Phase 4. Also used for real-time adherence alerts to operations managers. |

> **Critical VDI constraint:** Verint is accessed through the client's Virtual Desktop Infrastructure (VDI). Data **cannot be copied or pasted** out of this environment directly. The only permitted transfer method is: export report inside VDI → send via designated TELUS email address → import from email into Google Sheets. This is a hard constraint for any automation approach that relies on Verint data (see `NEXT_STEPS.md` for Track A vs Track B implications).

---

## The five phases

```
Phase 1          Phase 2           Phase 3 (parallel)      Phase 4         Phase 5
Workday      →   Justifications  →  GT: Verint real-time →  GTT report  →  Report
extraction       file update        PH: Verint historical    generation     distribution
(GT RT)          (GT RT)            Both run simultaneously  (GT RT)        (GT RT)
```

Phases 1 and 2 run sequentially. Phase 3 runs in parallel — Guatemala RT monitors live Verint while Philippines RT processes historical data. Both must confirm completion before Phase 4 begins. Phases 4 and 5 repeat throughout the day each time a significant GTT update is available.

---

## Phase 1 — Workday Data Extraction (Guatemala RT)

**Purpose:** Download the official absence records that will override incorrect attendance statuses downstream.

| Step | Action | Detail |
|------|--------|--------|
| 1 | Open Workday | Navigate to the Workers Time Off report. |
| 2 | Apply filters | Functional Area = CC (CBC) · Location = Guatemala · Date range = full current month. Excludes Philippines agents automatically. |
| 3 | Wait for load | ~3–5 minutes. Consistent regardless of date. |
| 4 | Export — Vacations file | Excel export. Covers: PTO, maternity leave, personal days, all approved time-off categories. |
| 5 | Export — Suspensions file | Separate Excel export. Covers: medical suspensions, disciplinary suspensions, single-day conduct suspensions. Loads faster (lower volume). |

> **Why this matters:** Unclassified vacations or suspensions appear as unexplained no-shows in the attendance system. This directly harms agent performance scores and may incorrectly reduce monthly bonuses.

---

## Phase 2 — Justifications File Update (Guatemala RT)

**Purpose:** Push the Workday absence data into the Google Sheets processing layer so the Attendance file reflects correct statuses.

| Step | Action | Detail |
|------|--------|--------|
| 1 | Open a blank Google Sheet | Import the downloaded Workday Excel file. Copy the Google Sheets file link. |
| 2 | Paste link into Justifications file | The master Justifications file has two tabs: Vacations and Suspensions. Paste the respective file links into each tab. |
| 3 | Run the Apps Script | Reads both Workday files, auto-populates the Vacations and Suspensions tabs. Linked formulas in the Attendance file pull this data automatically. |
| 4 | Verify agent statuses | Open the Attendance tab. Confirm agents on vacation or suspension show the correct status (e.g., "Vacation", "Medical Suspension") instead of "Absent" or "No Show". |
| 5 | Troubleshoot if needed | If a status did not update: delete the formula in the affected Attendance cell and re-paste it. Forces a formula recalculation. (See Known Issues.) |

> **Frequency requirement:** Must run every calendar day — including days with no apparent absences. Even one missed day creates incorrect records that propagate downstream into agent metrics and monthly bonus calculations.

---

## Phase 3 — Parallel Processing (Guatemala RT + Philippines RT simultaneously)

**Purpose:** Both regional teams process their respective Verint data streams at the same time to avoid sequential delays.

| Step | Who | Action | Detail |
|------|-----|--------|--------|
| 1 | PH RT | Access Verint via client VDI | Client-owned system — must use the client's virtual desktop. Data cannot be copied out directly. |
| 2 | PH RT | Export reports, send via email | Export Verint historical data inside VDI. Send to designated TELUS email address — the only permitted transfer method. |
| 3 | PH RT | Update Calculators | Calculators are specialized Google Sheets that trim agent activity records to their scheduled shift window — removing any login time outside assigned hours so metrics are accurate. |
| 4 | GT RT | Monitor Verint (real-time) | Guatemala RT watches the Verint calendar view to identify agents who are late, absent, or logged in but inactive. Lates are coded directly in Verint so the record is accurate. |
| 5 | Both | Sync via Google Chat | When Philippines RT finishes processing, they notify Guatemala RT via Google Chat. Both sides confirm completion before moving to Phase 4. |

> **Weekend exception:** Saturdays and Sundays — the client does not push Verint data. GTT data from Friday (or Friday–Sunday) is used as a substitute. On Mondays, the Philippines RT reconciles the weekend backlog before the first report goes out.

---

## Phase 4 — GTT Report Generation (Guatemala RT)

**Purpose:** Download today's agent login data from the telephony platform to produce the intraday attendance snapshot.

| Step | Action | Detail |
|------|--------|--------|
| 1 | Open GTT — ATOS Report | Country = Canada · Site = Pradera, Guatemala · LOBs = all CBC Guatemala lines of business. |
| 2 | Set date range | Weekdays: today only. Saturdays: Friday–Saturday. Sundays: Friday–Sunday. (Client does not update GTT on weekends.) |
| 3 | Download report folder | GTT exports a compressed (.zip) folder. Unzip and import into a blank Google Sheet. |
| 4 | Copy key columns to Attendance file | Three columns required: Agent ID (worker ID) · Login date · Login time (Eastern Time). Paste into the GTT data section of the Attendance file. |
| 5 | Run the attendance script | Apps Script processes GTT login data alongside Justifications data to produce a unified attendance view. Also pushes output to the Data Studio dashboard. |
| 6 | Refresh the dashboard | Open Data Studio (Looker) and refresh. Verify attendance rate, hours worked, and no-show counts are accurate. |

> **GTT data caveat:** GTT data is approximate. Agents may log in late or fail to log in to GTT even if physically present at their workstation. All intraday reports include a caveat noting this limitation. Verint data (processed by Philippines RT for the previous day) serves as the authoritative historical record.

---

## Phase 5 — Report Distribution (Guatemala RT)

**Purpose:** Send the attendance snapshot to CBC Operations.

| Step | Action | Detail |
|------|--------|--------|
| 1 | Compose email to CBC Operations | Recipients: CBC Operations managers and LOB leads (Guatemala). Distribution list is not always current — recipients are added individually as needed. |
| 2 | Attach dashboard screenshots | Three screenshots required: (1) Attendance rate & absenteeism · (2) Overtime (agents working beyond scheduled end time) · (3) No-shows (agents who did not connect to GTT). |
| 3 | Include data timestamp caveat | State clearly: data shown is GTT-based (intraday) and may not reflect all agents. Final reconciled figures available the following business day once Verint data is processed. |
| 4 | Include dashboard link | Provide the direct URL to the current month's Data Studio view so CBC managers can access live data independently. |
| 5 | Send and repeat | Send the report. Repeat Phases 4–5 throughout the day each time a significant GTT update is available. If a vacation approval comes in mid-day, re-run Phase 2 and update accordingly before the next send. |

> **Ongoing parallel task:** Throughout the entire day, the Guatemala RT also sends real-time adherence alerts to operations managers via Google Chat — flagging calls exceeding 10 minutes, extended ACW (after-call work), and agents logged in but not taking calls.

---

## Known issues and workarounds

| Issue | Impact | Workaround |
|-------|--------|------------|
| **Attendance formula does not refresh** after script run | Agent status remains incorrect | Delete the formula cell in the Attendance tab and re-paste it to force recalculation. Intermittent Google Sheets caching issue. |
| **GTT data is approximate / incomplete** | Intraday report may show agents as absent who are physically present | Include caveat in email. Final figures confirmed next business day via Verint. |
| **Cannot copy-paste data out of Verint (client VDI)** | Manual re-entry or email export required for every transfer | Export report inside VDI, send via designated TELUS email address. |
| **Dashboard does not show last-update timestamp** | Recipients cannot confirm data freshness at a glance | Include date and time range explicitly in the email body with each send. |
| **Weekend — no Verint data from client** | No historical reconciliation Sat/Sun | Use GTT data only for weekend reports. Philippines RT reconciles Friday–Sunday on Monday morning. |
| **Operations distribution list outdated** | Some managers missed; moved agents receive irrelevant reports | Manually verify and update recipient list with each send. |

---

## Key definitions

| Term | Definition |
|------|-----------|
| **RTA / RT** | Real-Time Analyst. The team member responsible for monitoring and reporting attendance and adherence in real time. |
| **CBC** | Canadian Banking Client (CIBC). The client account this process serves. |
| **Justifications file** | The master Google Sheets file where Workday absence data is imported and linked. It feeds the Attendance file via formulas. |
| **Attendance file** | The Google Sheets file containing the consolidated attendance record for all agents. Source for the dashboard and report emails. |
| **Calculators** | Specialized Google Sheets tabs that trim agent activity data to their scheduled shift windows, removing time logged outside shift hours. |
| **GTT** | Genesys Telecom Tool. The telephony platform agents use to log in and take calls. Provides real-time login/logout data used for intraday snapshots. |
| **Verint** | Client workforce management system. Provides **authoritative** historical data on agent schedule adherence. Accessed via client VDI. |
| **VDI** | Virtual Desktop Infrastructure. The client's remote desktop environment used to access Verint. Data cannot be copied out directly. |
| **Adherence** | How closely an agent follows their assigned schedule — whether they are in the correct status at the right time. |
| **ACW** | After-Call Work. Status agents use after completing a call to wrap up notes. Extended ACW may indicate an issue requiring a manager alert. |
| **No-show** | An agent who did not connect to GTT or Verint during their scheduled shift without a prior approved absence on record. |
| **LOB** | Line of Business. A sub-group or queue within the CBC account (e.g., Fraud, Retail Banking). GTT filters are applied per LOB to extract Guatemala-specific data. |
| **Data Studio / Looker** | Google's business intelligence dashboard tool. The visualization layer shared with CBC Operations for live and historical reporting. |
| **Apps Script** | Google Workspace automation scripting environment. Used to run the Justifications file update and the attendance consolidation script. |

---

## Implications for the Reporting Agent (automation target)

The **Reporting Agent** (Planned — see `PROJECT_PLAN.md`) will automate this process. Based on this guide, it must handle:

1. **Two data sources, not one** — Workday for absences, GTT for real-time logins. Both are required; neither alone is sufficient.
2. **Variable send cadence** — The agent must trigger a send on GTT data changes, not on a fixed timer. A 3-hour clock is incorrect.
3. **Google Sheets integration** — The existing Apps Script infrastructure can either be replaced by the Reporting Agent or called programmatically. The Justifications file and Attendance file must remain the source of truth during transition.
4. **VDI constraint** — The Reporting Agent cannot pull Verint data directly unless Track B (Verint REST API) is established. Until then, the Philippines RT email export flow remains a manual handoff that the agent cannot bypass.
5. **Report content structure** — Each email must include 3 specific screenshots and a dashboard URL. The agent must generate or capture these automatically.
6. **Weekend handling** — The agent must detect the day of week, use GTT-only mode on weekends, and trigger a Monday backlog reconciliation step.
7. **Distribution list management** — The agent should maintain a verified recipient list, flagging stale entries for review rather than silently skipping managers.

---

## See also

- [PAIN_POINTS.md](./PAIN_POINTS.md) — full list of RTA operational pain points, including attendance
- [NEXT_STEPS.md](./NEXT_STEPS.md) — production connector integration plan (GTT, Workday, Verint, Data Studio)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — POC vs production comparison table
- [HARNESS_FOR_COMPUTER_USE_HOWTO.md](./HARNESS_FOR_COMPUTER_USE_HOWTO.md) — Vision Agent build guide (Track A VDI approach + Track B REST API)
