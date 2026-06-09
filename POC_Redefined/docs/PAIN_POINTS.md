# Pain Points — What Problem This Solves

> This document explains the daily challenges of a CIBC Real-Time Analyst (RTA).
> It is written in plain English so that engineers can understand the business problem
> before reading the code.
>
> Source: April 28 shadowing session + REDY Activity-Based Design (ABD) documents + Daily Attendance Report Process Guide (June 2026).
>
> See [ATTENDANCE_PROCESS.md](./ATTENDANCE_PROCESS.md) for the full end-to-end attendance process reference.

---

## Who is an RTA?

An RTA (Real-Time Analyst) is the person who keeps a contact centre running in real time.

A typical CIBC RTA:

- Monitors **200–260 agents** across Guatemala and Philippines simultaneously.
- Checks every agent's status in Verint every **15 minutes** (this is called a "cycle").
- Sends alerts to 6 different Lines of Business (LOBs) in Google Chat when something goes wrong.
- Approves or denies coaching and huddle requests based on real-time service levels.
- Coordinates a 5-phase daily attendance reporting process across two regional teams (Guatemala + Philippines) using six different systems.
- Opens ServiceNow tickets for exceptions that cannot be resolved in real time.
- Writes a shift handoff note at the end of the shift.

---

## What does an RTA do in one cycle? (The manual workflow)

This is what one 15-minute monitoring cycle looks like today, without any AI:

### Step 1: Open Verint (2–5 minutes)

The RTA opens the Verint adherence grid — a spreadsheet-like view of every agent's status.
They scroll through 200+ rows, looking for anyone out of adherence.

**Problem:** The grid shows everything, sorted alphabetically. There is no priority order. A critical alert sits in the same row as a routine status update.

### Step 2: Identify exceptions (3–5 minutes)

The RTA looks for patterns:
- Agent in COAC (coaching) for more than 30 minutes?
- Agent in INBD (inbound) but scheduled for a break?
- More than 2 agents from the same LOB on COAC at the same time?
- Call duration exceeding 10 minutes?
- Extended ACW (after-call work) — agent wrapping up too long after a call?
- Agent logged in to GTT but not taking calls?

**Problem:** There are no automatic alerts. The RTA must spot exceptions manually by reading every row. During a busy cycle, something is often missed.

### Step 3: Write alert messages (3–8 minutes)

For each exception, the RTA writes a Google Chat message to the LOB's channel.

Example of what they type:
> "Hi TLB team. Diego Salazar has been in COAC for 32 minutes (scheduled BLEN). Please check in and advise."

**Problem:** This is done entirely by hand. The RTA must:
1. Copy the agent's name from Verint.
2. Remember the rule that applies (e.g. "COAC > 30 min = alert").
3. Know which Google Chat channel to send to (each LOB has its own).
4. Type the message in professional, clear language.
5. Remember to include the scheduled vs actual activity.

If the RTA manages 6 LOBs, this means writing 6+ different messages per cycle.
Observed average: **47 minutes of manual typing per shift** (Source: value model analysis).

### Step 4: Handle coaching/huddle requests

Supervisors message the RTA asking for permission to take agents offline for coaching.
The RTA must check the current SLA for that LOB before approving.

**Problem:** The RTA must switch from Verint to the workforce tool (Teams), back to the SLA dashboard, make a mental calculation, then reply. There is no tool that combines all three data sources.

### Step 5: Run the attendance reporting cycle

Attendance reporting is a 5-phase process involving two regional teams. The Guatemala RT runs it; the Philippines RT contributes historical Verint data in parallel.

The process each cycle:
1. Download Workday absence records (vacations + suspensions) — 2 separate files.
2. Import into Google Sheets and run an Apps Script to populate the Justifications file and update the Attendance file.
3. Wait for Philippines RT to process historical Verint data via client VDI and notify via Google Chat.
4. Download today's GTT (Genesys Telecom Tool) login report, import into Attendance file, run attendance script, refresh Data Studio dashboard.
5. Compose email to CBC Operations — attach 3 dashboard screenshots (attendance rate, overtime, no-shows), include dashboard URL and data freshness caveat.

This cycle repeats throughout the day each time a significant GTT update is available — not on a fixed timer.

**Problem:** Every step in this process is manual. Six systems are involved: Workday, Google Sheets, Apps Script, GTT, Verint (via client VDI), and Data Studio. There is no single tool that orchestrates the flow. The Guatemala RT must hold the entire sequence in their head and coordinate with the Philippines RT via Google Chat for each cycle.

### Step 6: Open ServiceNow tickets

When an exception cannot be resolved by an alert (e.g. a schedule mismatch that needs updating), the RTA opens a ServiceNow ticket manually.

**Problem:** Copy-paste between Verint and ServiceNow. Fields are filled one by one. The RTA must remember what information to include and which queue to route to.

---

## The numbers

These numbers come from the April 28 shadowing session and the value model document:

| Problem | Time lost per shift | Annual impact (2 RTAs) |
|---------|-------------------|----------------------|
| Manual alert typing | ~47 min/shift | ~194 hours/year |
| Manual attendance reports | ~40 min/shift | ~165 hours/year |
| Exception review (Verint scroll) | ~30 min/shift | ~124 hours/year |
| Tool switching (Verint → Teams → SLA → back) | ~20 min/shift | ~82 hours/year |
| **Total** | **~137 min/shift** | **~565 hours/year** |

**Service level impact:** The OCR analysis showed 0 of 8 LOB codes matched correctly in a baseline test — meaning the AI engine must be trained on CIBC-specific data before it can achieve the accuracy needed for autonomous alerting.

**Recovery opportunity:** Even at 50% automation of routine alerts, the estimated recoverable time is 280 hours/year per RTA, equivalent to 3.5 weeks of capacity returned.

---

## The system sprawl problem

An RTA currently switches between these tools in a single shift:

| Tool | Purpose | Problem |
|------|---------|---------|
| Verint | Agent adherence monitoring + historical attendance | No alert logic — manual scan only. Accessed via client VDI: data cannot be copy/pasted out. |
| Google Chat | LOB alert messages + GT/PH team sync | Must copy/paste from Verint; no templates. Also used for manual cross-team coordination. |
| Microsoft Teams | Supervisor/OM communication | Separate from Verint; no SLA context |
| Workday | Approved absence records (vacations, suspensions) | Manual export required for every reporting cycle |
| GTT (Genesys Telecom Tool) | Real-time agent login data | Manual download, unzip, and import for every intraday report |
| Google Sheets + Apps Script | Justifications file + Attendance file + attendance script | Fragile formula links; caching bugs require manual delete-and-repaste to resolve |
| Data Studio / Looker | Attendance dashboard shared with CBC Operations | Must be manually refreshed after each script run; no automated push |
| ServiceNow | Ticket creation | Copy-paste from Verint; no automation |
| Email | Attendance report distribution | Manual composition; distribution list not maintained centrally — recipients managed individually |

There is no single view that shows the RTA what to do next, in priority order,
with the message already drafted and ready to send.

---

## The two-team coordination overhead

The attendance reporting process is not a single-person workflow. It requires two regional teams to work in parallel and synchronise before each report can go out.

**Guatemala RT** owns:
- Workday extraction (Phase 1)
- Justifications file and Apps Script (Phase 2)
- Real-time Verint monitoring (Phase 3, parallel)
- GTT report download and attendance script (Phase 4)
- Report email composition and send (Phase 5)

**Philippines RT** owns:
- Verint historical data extraction via client VDI (Phase 3, parallel)
- Shift-time calculator updates
- Weekend backlog reconciliation every Monday

**The synchronisation point:** Between Phase 3 and Phase 4, the Guatemala RT must wait for the Philippines RT to finish Verint processing and send a Google Chat confirmation. If the Philippines RT is delayed, the entire reporting cycle is held up.

**Problem:** This coordination happens entirely via informal Google Chat messages. There is no status dashboard, no SLA, and no automated handoff signal. Each cycle depends on both RTAs being available and responsive across time zones simultaneously.

---

## The VDI wall

Verint is a client-owned system. TELUS RTAs access it through the client's Virtual Desktop Infrastructure (VDI) — a remote desktop environment inside the client's network.

**This means:**
- Data inside Verint **cannot be copied or pasted** out of the VDI environment.
- Every piece of data the Philippines RT needs to transfer goes through a single permitted path: export the report file inside the VDI, email it to a designated TELUS email address, then import from email into Google Sheets.
- This applies to every single reporting cycle, every day.

**Problem:** Any automation approach that needs Verint data must work around this wall. The two options are:
1. **Track A** — Screenshot the Verint window via VDI and extract data using OCR (slow, error-prone, requires model training).
2. **Track B** — Negotiate direct API access to Verint with CIBC IT (faster, more reliable, but requires IT provisioning).

Neither option is available today without action. See `NEXT_STEPS.md` for the full analysis.

---

## Known operational bugs

These are documented issues that occur regularly and require manual intervention:

| Bug | Frequency | Manual workaround |
|-----|-----------|-------------------|
| **Google Sheets formula caching** — attendance status does not update after Apps Script run | Intermittent | Delete the formula cell in the Attendance tab and re-paste it to force recalculation |
| **GTT data lag** — agents physically present but not logged into GTT | Every cycle | Include data freshness caveat in every email; do not remove agents from "no-show" until next-day Verint confirmation |
| **Outdated distribution list** — report emails miss some managers or reach departed staff | Ongoing | Manually verify and update recipients before each send |
| **Dashboard timestamp absent** — CBC Operations cannot confirm data freshness from the dashboard alone | Every send | Include explicit date and time range in every email body |

---

## The core problem in one sentence

> The RTA spends most of their shift doing work that a computer could do (reading data, writing messages, calculating percentages) instead of doing work that only a human can do (making judgement calls, escalating wisely, coaching effectively).

---

## What the RTA actually wants to do

When we talked to RTAs, they said they want to spend their time on:

1. **Escalations** — situations that need human judgement (an agent going through a personal crisis, a customer complaint pattern, a supervisor conflict).
2. **Coaching** — helping agents improve by making thoughtful decisions about who needs coaching and when.
3. **Pattern recognition** — spotting LOB trends that no rule can catch.
4. **Handoff quality** — giving the incoming RTA a clear, complete picture of the shift.

None of these require typing the same alert message 15 times a day.

---

## See also

- [ATTENDANCE_PROCESS.md](./ATTENDANCE_PROCESS.md) — canonical end-to-end attendance process reference (source of truth)
- [SOLUTION.md](./SOLUTION.md) — what was built to address these pain points
- [SCOPE.md](./SCOPE.md) — what is in scope and what is not
- [NEXT_STEPS.md](./NEXT_STEPS.md) — how to connect real data sources
