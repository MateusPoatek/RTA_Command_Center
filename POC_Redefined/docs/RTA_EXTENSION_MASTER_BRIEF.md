# RTA Extension — Master Technical Brief

**Version:** 1.0  
**Date:** June 2026  
**Audience:** Solution Architects, Engineering Leadership, Infrastructure Review  
**Status:** POC validated in production environment

---

## Table of Contents

1. [What We Built](#1-what-we-built)
2. [How It Works — Step-by-Step Network View](#2-how-it-works)
3. [How We Built It — Architecture & Design](#3-how-we-built-it)
4. [Why We Built It — Use Cases](#4-why-we-built-it)
5. [Next Steps — Server-Side Architecture](#5-next-steps)
6. [IP Fingerprinting — Environment Detection](#6-ip-fingerprinting)

---

## 1. What We Built

### The RTA Extension Ecosystem

The RTA Extension is not a monitoring tool. It is a **data integration layer** that lives inside the RTA's browser and connects systems that were never designed to speak to each other.

Today, an RTA managing a floor of 200+ agents must simultaneously watch:
- **Verint WFM** — real-time adherence, schedule, violations
- **GTT** — workforce clock-in / clock-out (attendance)
- **ServiceNow** — ticketing and escalations *(integration ready, not yet wired)*
- **Messaging channels** — Teams, Slack, WhatsApp for alert dispatch

None of these systems share a data model. None of them know the others exist. An RTA's job is to hold all of it in their head simultaneously, across 6–10 lines of business, with a reaction window of under 90 seconds per violation.

The extension makes that invisible integration visible — in a single Command Center.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     RTA COMMAND CENTER                             │
│                                                                    │
│   ┌──────────────┐  ┌───────────────┐  ┌───────────────────────┐  │
│   │ Priority Feed│  │ Reports Tab   │  │ Floor View (Phase 2)  │  │
│   │ Real-time    │  │ GTT × Verint  │  │ Spatial radar of all  │  │
│   │ OOA alerts   │  │ Attendance    │  │ agents on the floor   │  │
│   │ sorted by    │  │ Reconciliation│  │                       │  │
│   │ duration     │  │ Dashboard     │  │                       │  │
│   └──────┬───────┘  └──────┬────────┘  └───────────┬───────────┘  │
└──────────┼─────────────────┼───────────────────────┼──────────────┘
           │                 │                        │
    ┌──────▼──────┐   ┌──────▼──────┐         ┌──────▼──────┐
    │   Verint    │   │     GTT     │         │ ServiceNow  │
    │  (live)     │   │  (live)     │         │  (future)   │
    └─────────────┘   └─────────────┘         └─────────────┘
```

### Systems Connected

| System | Status | Integration Method | Data Obtained |
|---|---|---|---|
| **Verint WFM** | Live | Passive XHR tap (browser extension) | Agent roster, adherence %, schedule, violations |
| **GTT** | Live | Python → GCP Cloud Run API | Clock-in/clock-out events, daily activity log |
| **ServiceNow** | Architecture ready | REST API (future) | Ticket status, escalation queue |
| **Messaging** | Manual (current) | Alert cards → RTA dispatches | N/A |

---

## 2. How It Works

### 2.1 The Core Mechanism: Passive XHR Tap

> The extension does not navigate. It does not click. It does not scrape pixels or parse HTML.
> It reads the JSON responses that Verint's own SPA already parses — and makes them available to other systems.

When the RTA opens Verint's adherence calendar, Verint's single-page application fires authenticated API calls to its own backend. These calls carry the full agent roster — names, scheduled activities, actual activities, OOA durations, adherence percentages. The extension intercepts these responses at the JavaScript layer, transforms them, and relays them.

Nothing is modified. Nothing is blocked. The RTA's Verint session behaves exactly as it would without the extension.

---

### 2.2 Step-by-Step Network Workflow

**Swimlane Participants:**
- **RTA** — the human operator
- **Browser / Verint SPA** — Chrome/Brave tab running Verint's web application
- **inject.js** — extension script running in the page's MAIN world
- **background.js** — extension service worker (MV3)
- **Command Center** — React web app (local or hosted)
- **GTT API** — GCP Cloud Run endpoint
- **Python Pipeline** — local_api.py (POC) or hosted service (production)

```
RTA             Browser/Verint SPA       inject.js          background.js      Command Center    GTT API / Python
 │                      │                    │                    │                   │                │
 │  Opens Verint URL    │                    │                    │                   │                │
 ├─────────────────────►│                    │                    │                   │                │
 │                      │                    │                    │                   │                │
 │         [1] Extension loads at document_start                  │                   │                │
 │                      │◄───────────────────┤                    │                   │                │
 │                      │  XHR.prototype     │                    │                   │                │
 │                      │  .send hooked      │                    │                   │                │
 │                      │  (read-only)       │                    │                   │                │
 │                      │                    │                    │                   │                │
 │         [2] Microsoft Entra SSO flow      │                    │                   │                │
 │                      │ ─ ─ ─ ─ ─ ─ ─ ─ ► Microsoft Login      │                   │                │
 │                      │ ◄ ─ ─ ─ ─ ─ ─ ─ ─ SAML assertion       │                   │                │
 │                      │ impact360authtoken issued (cookie)       │                   │                │
 │                      │                    │                    │                   │                │
 │  Pages to adherence  │                    │                    │                   │                │
 ├─────────────────────►│                    │                    │                   │                │
 │                      │                    │                    │                   │                │
 │         [3] Verint SPA fires calendar-filter request           │                   │                │
 │                      ├────────────────────────────────────────────────────────────────────────────► │
 │                      │ POST /api/wfm/main/v2/calendar-filter   │                   │                │
 │                      │ Headers: impact360authtoken             │                   │                │
 │                      │          x-csrf-token                  │                   │                │
 │                      │          Cookie: session               │                   │                │
 │                      │ Body: { calendarFilterCriteria:        │                   │                │
 │                      │         { offset: 0,                   │                   │                │
 │                      │           useAllEmployees: true } }    │                   │                │
 │                      │                    │                    │                   │                │
 │         [4] Verint responds: resourceData[]                    │                   │                │
 │                      │◄───────────────────────────────────────────────────────────────────────────  │
 │                      │ 200 OK                                  │                   │                │
 │                      │ { data: { attributes: {                │                   │                │
 │                      │   resourceData: [                      │                   │                │
 │                      │     { workResource: { id, name },      │                   │                │
 │                      │       adherence: { pct, violations[] },│                   │                │
 │                      │       actualSchedule: { events[] },    │                   │                │
 │                      │       plannedSchedule: { events[] }    │                   │                │
 │                      │     }, ... ] } } }                     │                   │                │
 │                      │                    │                    │                   │                │
 │         [5] XHR hook fires — inject.js reads response         │                   │                │
 │                      │───────────────────►│                    │                   │                │
 │                      │                    │ onreadystatechange │                   │                │
 │                      │                    │ captures:          │                   │                │
 │                      │                    │  - full response   │                   │                │
 │                      │                    │  - request headers │                   │                │
 │                      │                    │  - request URL     │                   │                │
 │                      │                    │                    │                   │                │
 │         [6] inject.js relays to isolated world                 │                   │                │
 │                      │                    ├───────────────────►│                   │                │
 │                      │                    │ window.postMessage │                   │                │
 │                      │                    │ { type:            │                   │                │
 │                      │                    │  "verint-capture", │                   │                │
 │                      │                    │   calendarFilter,  │                   │                │
 │                      │                    │   workResources }  │                   │                │
 │                      │                    │                    │                   │                │
 │         [7] background.js processes captured data             │                   │                │
 │                      │                    │                    │                   │                │
 │                      │                    │  parse.js          │                   │                │
 │                      │                    │  buildCards()      │                   │                │
 │                      │                    │  ──────────────►   │                   │                │
 │                      │                    │  CommandCard[]     │                   │                │
 │                      │                    │  (OOA violations)  │                   │                │
 │                      │                    │                    │                   │                │
 │                      │                    │  extractRoster()   │                   │                │
 │                      │                    │  ──────────────►   │                   │                │
 │                      │                    │  VerintRosterRow[] │                   │                │
 │                      │                    │  (ALL agents)      │                   │                │
 │                      │                    │                    │                   │                │
 │                      │                    │  chrome.storage    │                   │                │
 │                      │                    │  .session.set()    │                   │                │
 │                      │                    │  (RAM only,        │                   │                │
 │                      │                    │   no disk write)   │                   │                │
 │                      │                    │                    │                   │                │
 │         [8] background.js pushes to Command Center tab        │                   │                │
 │                      │                    │                    ├──────────────────►│                │
 │                      │                    │                    │ chrome.tabs       │                │
 │                      │                    │                    │ .sendMessage()    │                │
 │                      │                    │                    │ { type: "cards",  │                │
 │                      │                    │                    │   cards,          │                │
 │                      │                    │                    │   roster,         │                │
 │                      │                    │                    │   syncedAt }      │                │
 │                      │                    │                    │                   │                │
 │         [9] Command Center receives and renders               │                   │                │
 │                      │                    │                    │                   │                │
 │                      │                    │                    │  useExtensionBridge hook          │
 │                      │                    │                    │  ─────────────────►               │
 │                      │                    │                    │  setCards(cards)  │               │
 │                      │                    │                    │  setVerintRoster  │               │
 │                      │                    │                    │  (roster)         │               │
 │◄──────────────────────────────────────────────────────────────────────────────────│               │
 │  Priority Feed shows │                    │                    │                   │                │
 │  OOA cards, sorted   │                    │                    │                   │                │
 │  by duration         │                    │                    │                   │                │
 │                      │                    │                    │                   │                │
 │  [10] RTA clicks "Generate Report"        │                    │                   │                │
 ├─────────────────────────────────────────────────────────────────────────────────► │                │
 │                      │                    │                    │  POST /api/generate-report        │
 │                      │                    │                    │  { date,          │                │
 │                      │                    │                    │    functional_area│                │
 │                      │                    │                    │    verint_rows }  │                │
 │                      │                    │                    │                   │                │
 │  [11] Python pipeline runs                │                    │                   │                │
 │                      │                    │                    │                   ├───────────────►│
 │                      │                    │                    │                   │ fetch_gtt()   │
 │                      │                    │                    │                   │ POST GTT API  │
 │                      │                    │                    │                   │◄──────────────┤
 │                      │                    │                    │                   │ GTTRow[]      │
 │                      │                    │                    │                   │               │
 │                      │                    │                    │                   │ reconcile()   │
 │                      │                    │                    │                   │ surname match │
 │                      │                    │                    │                   │ + fuzzy join  │
 │                      │                    │                    │                   │               │
 │                      │                    │                    │                   │ writes:       │
 │                      │                    │                    │                   │ reconciliation│
 │                      │                    │                    │                   │ _YYYY-MM-DD   │
 │                      │                    │                    │                   │ .json         │
 │                      │                    │                    │                   │               │
 │◄──────────────────────────────────────────────────────────────────────────────────│               │
 │  Reports tab renders │                    │                    │                   │                │
 │  GTT × Verint        │                    │                    │                   │                │
 │  dashboard           │                    │                    │                   │                │
```

---

### 2.3 What Happens on the Network (Per Verint Page)

Every time the RTA loads or refreshes the adherence calendar, the following occurs:

**Request captured by extension:**
```
POST https://*.verintcloudservices.com/api/wfm/main/v2/calendar-filter
Content-Type: application/json
impact360authtoken: <session token>
x-csrf-token: <CSRF token>
Cookie: <session cookies>

{
  "data": {
    "attributes": {
      "calendarFilterCriteria": {
        "offset": 0,
        "workResourceWorkspaceCriteria": {
          "useAllEmployees": true,
          "workResourceIds": []
        }
      }
    }
  }
}
```

**Response processed by extension:**
```json
{
  "data": {
    "attributes": {
      "resourceData": [
        {
          "workResource": { "id": 12345, "name": "Garcia, Maria" },
          "adherence": {
            "percentage": 72.4,
            "violations": [
              {
                "plannedActivityName": "Inbound Calls",
                "actualEventData": [{ "label": "Break" }],
                "durationInSeconds": 840
              }
            ]
          },
          "actualSchedule": { "events": [...] },
          "plannedSchedule": { "events": [...] }
        }
      ]
    }
  }
}
```

**What the extension produces from this:**
- `buildCards()` → one `CommandCard` per agent with violations, sorted by OOA duration
- `extractRoster()` → one `VerintRosterRow` per agent (in-adherence and OOA, complete roster)

---

### 2.4 What Was Proven by Gate Probes

Two gate probes were run against the live Verint production environment:

| Gate | Test | Result |
|---|---|---|
| **V2** | Send agent IDs from page 2 to a page-1 request | ✅ Verint returns cross-page data without restriction |
| **V3** | Send agent IDs from multiple LOBs in one request | ✅ Verint returns cross-LOB data without restriction |

**Implication:** The API does not enforce per-page or per-LOB isolation on `workResourceIds`. A single authenticated request can return the entire floor's agent data — across all lines of business — in one call.

---

## 3. How We Built It

### 3.1 Premises and Constraints

| Premise | Implication |
|---|---|
| RTAs already use Verint in Chrome/Brave | Extension distribution is the only deployment action required |
| Verint is SaaS (`*.verintcloudservices.com`) | No on-premise connectivity required |
| Verint auth is Microsoft Entra ID (SAML2 SSO) | No server can log in autonomously — an authenticated human session is required as the data source |
| GTT is a GCP Cloud Run endpoint with SA auth | GTT can be called from a server with no browser |
| RTAs must not change their Verint workflow | Extension is purely additive; zero behavior change for the RTA |
| Chrome MV3 limits background scripts | Service worker pattern (MV3 `background.js`); no persistent background page |

### 3.2 Libraries and Technologies

**Extension (Browser)**

| Component | Technology | Purpose |
|---|---|---|
| `manifest.json` | Chrome MV3 | Extension configuration, permissions |
| `inject.js` | Vanilla JS, MAIN world | XHR prototype hook; runs in page context |
| `content_verint.js` | Vanilla JS, ISOLATED world | Message bridge from inject.js to background |
| `background.js` | MV3 Service Worker | Data accumulation, processing, push |
| `parse.js` | Vanilla JS | `buildCards()` + `extractRoster()` logic |
| `floor_probe.js` | Vanilla JS | Gate probe tool (V2/V3 validation) |
| `content_cc.js` | Vanilla JS | Bridge to Command Center tab |
| `chrome.storage.session` | Chrome API | RAM-only state; clears on browser close |

**Command Center (Frontend)**

| Component | Technology | Purpose |
|---|---|---|
| Framework | React 18 + TypeScript | UI and state management |
| Build tool | Vite | Dev server, proxy, HMR |
| Bridge hook | `useExtensionBridge.ts` | Receives cards + roster from extension |
| Styles | Custom CSS | No UI framework dependency |
| Export | `export.ts` | XLSX + PDF generation |

**Pipeline (Python)**

| Component | Technology | Purpose |
|---|---|---|
| API server | Starlette + uvicorn | Local API proxy for report generation |
| GTT client | `google-auth` + `requests` | Identity token auth to GCP Cloud Run |
| Reconciler | `rapidfuzz` | Surname match + fuzzy fallback |
| Report writer | stdlib `json`, `csv` | Output file generation |

### 3.3 Architecture

```
┌─────────────────────────────────────────────┐
│         BROWSER LAYER (RTA machine)         │
│                                             │
│  ┌─────────────────┐    ┌────────────────┐  │
│  │   Verint Tab    │    │ Command Center │  │
│  │                 │    │     Tab        │  │
│  │  inject.js      │    │                │  │
│  │  (MAIN world)   │    │  React App     │  │
│  │  XHR hook       │    │  useExtension  │  │
│  │       │         │    │  Bridge()      │  │
│  │  content_verint │    │  content_cc.js │  │
│  │  .js            │    │       ▲        │  │
│  └────────┬────────┘    └───────┼────────┘  │
│           │                     │           │
│           ▼     ┌───────────────┘           │
│    chrome.runtime.sendMessage               │
│           │                                 │
│  ┌────────▼────────────────────────────┐    │
│  │         background.js               │    │
│  │         (MV3 Service Worker)        │    │
│  │                                     │    │
│  │  captures{}  →  parse.js            │    │
│  │                 buildCards()        │    │
│  │                 extractRoster()     │    │
│  │                                     │    │
│  │  chrome.storage.session (RAM)       │    │
│  │  chrome.tabs.sendMessage()          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                     │
                     │ (future: POST /ingest)
                     ▼
┌─────────────────────────────────────────────┐
│         PYTHON PIPELINE (local / server)    │
│                                             │
│  local_api.py  →  gtt_adapter.py           │
│                →  gtt_verint_reconciler.py  │
│                →  report_intelligence.py    │
│                →  reconciliation_DATE.json  │
└─────────────────────────────────────────────┘
                     │
                     ▼
             GTT Cloud Run API
             (GCP, SA identity token auth)
```

### 3.4 System Design Decisions

| Decision | Rationale |
|---|---|
| Passive XHR tap (not DOM scraping) | API responses are structured JSON; DOM is rendered output. API is faster, more reliable, and immune to UI redesigns. |
| MAIN world injection | XHR prototype is per-context. Must run in the page's MAIN world to hook the SPA's own XHR calls. |
| `chrome.storage.session` | RAM-only. Cleared on browser close. Prevents any PII from persisting to disk between sessions. |
| Service worker (MV3) | Chrome MV3 requirement. Extension still fully functional; background script may sleep between events. |
| Starlette over Flask | Flask was not available in the project venv. Starlette + uvicorn were present and satisfy the same use case with async support. |
| Surname-first join strategy | GTT uses "Firstname Lastname"; Verint uses "Last, First". Surname is the most stable cross-system identifier available without a shared employee ID. Fuzzy fallback (`rapidfuzz token_set_ratio ≥ 85`) handles accented characters and hyphenated names. |

### 3.5 Who It Works For

**Direct users:** Real-Time Analysts (RTAs) — the 8 human operators managing adherence across floors in Guatemala and El Salvador.

**Beneficiaries:** Operations supervisors, workforce management analysts, and any downstream system that consumes the reconciliation report.

**Requirements on the user's side:**
- Chrome or Brave browser
- Extension installed (unpacked or distributed via Chrome Enterprise)
- Verint adherence calendar open during shift
- Command Center tab open alongside Verint

No training is required for Verint usage. No change to the RTA's existing workflow.

---

## 4. Why We Built It

### 4.1 Attendance Report — GTT × Verint Reconciliation

**The problem:** Two systems track the same agents, in different ways, with no built-in connection:
- **GTT** records clock events (clock-in, clock-out, meal breaks, AUX codes) — the attendance record
- **Verint** records real-time adherence state — whether the agent is in the right activity right now

Neither system knows the other exists. Supervisors reconcile them manually — a process that takes 30–60 minutes per shift and is prone to transcription errors.

**What the extension enables:**
- Verint captures full agent roster while the RTA pages through adherence (zero extra work)
- GTT is fetched server-side for the same date and functional area
- Python joins the two datasets on agent surname + fuzzy fallback
- Output: `ReconciliationReport` with four discrepancy types

```
discrepancy_type:
  match_ok                      — agent in GTT and Verint, within tolerance
  clocked_in_not_in_adherence   — GTT has clock-in, Verint has no trace
  in_adherence_no_clock_in      — Verint shows active, GTT has no clock-in
  clocked_out_still_active      — GTT has clock-out, Verint still shows active
```

The report is generated in under 30 seconds, produces a structured JSON file, and renders immediately in the Command Center dashboard — replacing the manual 30–60 minute process.

---

### 4.2 Adherence Report — Real-Time OOA Alerts

**The problem:** Verint's default UI shows all agents. An RTA managing 200 agents across 6 LOBs cannot triage in time — the signal-to-noise ratio is too high, and the UI updates every 15–30 seconds.

**What the extension delivers:**
- Captures `adherence.violations[]` from every Verint page render
- Filters to agents actually out-of-adherence
- Sorts by violation duration descending (longest-unresolved first)
- De-duplicates: maximum 2 cards per agent (worst violations only)
- Renders in the Priority Feed with: agent name, LOB, scheduled vs. actual activity, duration

The RTA sees a ranked list of who needs attention right now, updated every time they interact with Verint — no extra clicks, no filtering.

---

### 4.3 RTA Alert System — Adherence on Messaging Channels

**Current state (POC):** CommandCards generated by the extension feed the Priority Feed in the Command Center. The RTA uses these to manually dispatch alerts via Teams/WhatsApp.

**What the architecture enables (next step):**
- The `CommandCard` schema is already structured for dispatch: agent name, LOB, violation type, duration, severity
- Adding a `dispatch` action to each card routes it to the appropriate messaging channel for that LOB
- ServiceNow integration point: high-severity OOA events can auto-open a ticket

The data model for alerting is complete. The dispatch layer is the next integration target.

---

### 4.4 Shift Open and Close — How the Command Center Gets Its Information

**Shift open:**
When the RTA opens Verint and navigates to the adherence calendar, `inject.js` fires immediately at `document_start`. Within the first page render, the extension has already captured the full agent roster for the current LOB view. The Command Center populates within seconds of the RTA starting their shift — no manual action required.

**Mid-shift updates:**
Every time the RTA pages through Verint (switches LOBs, applies filters, refreshes the view), the XHR hook captures the new response. `background.js` merges the new data with existing captures using `mergeResourceData()`. The Command Center receives a push update on each merge cycle.

**Shift close / report generation:**
The RTA's last Verint interaction produces the final roster snapshot. Clicking "Generate Report" in the Command Center sends the accumulated roster to the Python pipeline alongside the day's GTT data. The reconciliation report is produced and stored. The Command Center dashboard auto-loads it on next open.

**Command Center state persistence:**
All captured state (`latestCards`, `latestRoster`, `lastSyncedAt`) is held in `chrome.storage.session` — RAM only, scoped to the browser session. Nothing is written to disk between sessions. The bridge automatically re-establishes on Command Center tab open via the `get-cards` background message.

---

## 5. Next Steps — Server-Side Architecture

### 5.1 The SSO Constraint and What It Changes

During the POC, a critical discovery was made about Verint's authentication architecture.

Verint uses **Microsoft Entra ID SAML2 SSO** for user authentication. The login flow:

```
Browser → Verint → redirect to login.microsoftonline.com → SAML assertion → Verint issues impact360authtoken
```

This means there is no `POST /login` endpoint that Python can call with credentials. The `impact360authtoken` session token is only issued after a full SAML round-trip through Microsoft — which requires a browser and a valid human authentication event (including MFA).

**Consequence for the "server calls Verint directly" approach:** Not viable without either:
- A Verint local service account (non-federated, bypasses SSO) — requires Verint admin cooperation
- A full SAML/MFA automation flow — complex and fragile

**The realistic path:** The RTA's browser session is the authenticated source. The server is the processor. The extension relays.

### 5.2 The Extension Relay Pattern

This is the production-ready server-side architecture given the SSO constraint:

```
┌─────────────────────────────────────────────────────────────────┐
│  RTA BROWSER (authenticated Verint session)                    │
│                                                                 │
│  Extension captures roster on every Verint page render         │
│  background.js →                                               │
│    ├──► Command Center (existing — local Priority Feed)        │
│    └──► POST /ingest (NEW — server relay)                      │
│         { roster: VerintRosterRow[], syncedAt, account_id }   │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS POST (every rebuild cycle)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  RECONCILIATION SERVICE (hosted — VM / Cloud Run)              │
│                                                                 │
│  POST /ingest                                                   │
│    → store latest roster per account                           │
│    → if today's GTT data already fetched: trigger reconcile    │
│                                                                 │
│  SCHEDULER (region-aware cron)                                  │
│    → fetch_gtt(account) at shift-start, mid-shift, shift-end  │
│    → if today's Verint roster available: trigger reconcile     │
│                                                                 │
│  RECONCILER (gtt_verint_reconciler.py — unchanged)             │
│    → reconciliation_{date}_{account}.json                      │
│                                                                 │
│  API                                                            │
│    GET  /report/{account}/{date}  → ReconciliationReport JSON  │
│    GET  /stream                   → SSE push to Command Center │
│    GET  /health                   → last-run per account       │
└─────────────────────────────────────────────────────────────────┘
```

**What this requires from the extension (~10 lines of new code in background.js):**
```javascript
// In rebuild(), after building cards and roster:
const RELAY_URL = "https://your-server/ingest";  // configured per deployment
if (RELAY_URL && latestRoster.length > 0) {
  fetch(RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roster: latestRoster, syncedAt: lastSyncedAt })
  }).catch(() => {});  // fire-and-forget; never block the extension
}
```

**What falls away:**
- The Python pipeline no longer needs a Verint client
- The `--verint-fixture` CLI flag becomes obsolete
- `local_api.py` evolves into the hosted service

**What stays entirely unchanged:**
- `gtt_adapter.py` — GTT fetch is already server-side automated
- `gtt_verint_reconciler.py` — pure Python, no dependency on browser
- `report_intelligence.py` — deterministic, no LLM
- The reconciliation report schema — frozen; Command Center already renders it

### 5.3 Necessary Conditions for Production

| Condition | Status |
|---|---|
| Chrome/Brave available in the RTA's environment | ✅ Confirmed (extension is already deployed) |
| Extension can reach the relay server URL over HTTPS | Requires network egress rule — one firewall exception |
| GTT SA key available on server | ✅ Already exists (`td-sa-wfm-gtt-reports02`) |
| Server has outbound access to GTT Cloud Run | Standard GCP egress |
| At least one RTA has Verint open during the reconciliation window | ✅ Operational norm — RTAs have Verint open all shift |

### 5.4 Citrix Feasibility

The Citrix question comes down to one variable: **is Verint accessed as a browser tab inside the Citrix session, or is Verint itself a Citrix-published application?**

| Scenario | Extension works? | Relay works? | Notes |
|---|---|---|---|
| Browser (Chrome/Brave) inside Citrix session, Verint as web tab | ✅ Yes | ✅ Yes | Extension installs inside the session browser; relay POSTs to external server over HTTPS from inside the Citrix session |
| Verint accessed via Citrix-published browser (IE legacy, Edge legacy) | ❌ No | ❌ No | MV3 extension won't load in unsupported browsers |
| Verint as a Citrix-published thick-client application | ❌ No | ❌ No | No browser context to inject into |

If the Citrix environment runs a modern Chrome or Brave browser inside the session, the extension + relay pattern works identically — the physical machine location is irrelevant. The extension only needs HTTPS egress to the relay server.

---

## 6. IP Fingerprinting — Environment Detection

### 6.1 The Discovery Method

GTT login records contain a public IP field — the egress address agents used when clocking in. By counting how many distinct agents share each IP per account, it is possible to infer infrastructure topology without any client cooperation.

**The logic:**

| Pattern | Interpretation |
|---|---|
| 1 agent per IP | Standard home/office NAT — individual routing |
| Many agents, few IPs | Centralized infrastructure — Citrix, CGNAT, or VPN |
| All agents, one IP | Single centralized egress point — strong infrastructure signal |

This analysis requires no Citrix access, no client meeting, and no cooperation from any IT team. The signal is already in the GTT data.

### 6.2 What the Analysis Found

Analysis across multiple accounts in two countries produced a consistent finding: **all accounts analyzed show high IP concentration**. Multiple sub-accounts and hundreds of agents across geographically separate sites were observed exiting through a small number of shared IP addresses.

The most significant finding: **agents in two different countries share the exact same public egress IP address.**

### 6.3 What One Shared IP Across Countries Tells Us

Standard office NAT would produce different IPs per site — offices are in different buildings with different routers. A single IP shared across countries can only mean:

1. **Carrier-Grade NAT (CGNAT)** — all corporate traffic routed through a single telco-managed egress point regardless of geography
2. **Centralized Citrix farm** — all VDI sessions, regardless of country, exit through the same Citrix ADC gateway
3. **Global VPN** — all agents tunnel through one VPN gateway before hitting the internet

All three are centralized, managed infrastructure — not per-account or per-site configurations.

### 6.4 What This Changes for the Architecture

**If it is a single centralized Citrix farm:**
- One configuration negotiation covers all accounts sharing that IP
- One WEM policy, one ADC edition, one IT contact — not one per account
- The Chrome extension policy and HTTPS egress rule are deployed once to the farm
- The relay architecture is configured once and serves all accounts behind that gateway

**If it is CGNAT or a corporate VPN:**
- Agents are on standard desktops behind a managed network layer
- Citrix-specific engineering is not required
- The extension runs on local machines; the relay architecture applies as-is
- GTT connector works without modification

**Either way:**
The single shared IP is the pivot point that collapses a multi-account, multi-country discovery effort into one conversation with one IT contact. The question "is this Citrix?" becomes "what is 198.59.156.69 — Citrix ADC, CGNAT, or VPN?" — answerable in one meeting, resolving the infrastructure question for all accounts simultaneously.

### 6.5 What IP Fingerprinting Cannot Determine

IP concentration is a necessary signal, not a sufficient one. It identifies that centralized infrastructure exists; it does not identify which type. This is intentional.

The value of this method is not to replace the IT discovery meeting — it is to walk into that meeting already knowing which question to lead with, and which accounts that question covers.

---

## Appendix: File Map

```
POC_Redefined/
├── verint_extension/
│   ├── manifest.json          — MV3 extension config
│   ├── inject.js              — XHR tap (MAIN world)
│   ├── content_verint.js      — bridge: Verint tab → background
│   ├── content_cc.js          — bridge: background → Command Center
│   ├── background.js          — data accumulation + push
│   ├── parse.js               — buildCards() + extractRoster()
│   └── floor_probe.js         — V2/V3 gate probe tools
│
├── command-center/
│   └── src/
│       ├── App.tsx            — root state, report fetch, bridge wiring
│       ├── hooks/
│       │   └── useExtensionBridge.ts  — window.postMessage receiver
│       ├── components/
│       │   ├── CommandBar.tsx         — top navigation + status
│       │   ├── ProcessView.tsx        — Reports tab
│       │   ├── GttReportDashboard.tsx — reconciliation dashboard
│       │   ├── ReportConfigPanel.tsx  — report parameters
│       │   └── ReportPreview.tsx      — report detail view
│       └── utils/
│           └── export.ts              — XLSX + PDF export
│
├── gtt_adapter.py             — GTT Cloud Run fetch (SA auth)
├── gtt_verint_reconciler.py   — join logic + report schema
├── report_intelligence.py     — intelligence bullet generation
├── report_runner.py           — CLI pipeline runner
├── local_api.py               — Starlette server (POC proxy)
├── verint_client.py           — server-side Verint client skeleton
│                                (blocked by SSO — see Section 5.1)
│
├── runs/
│   └── reports/               — generated reconciliation JSON files
│
└── docs/
    ├── RTA_EXTENSION_MASTER_BRIEF.md   — this document
    ├── ARCHITECTURE_BRIEF.md           — technical deep-dive (POC)
    ├── SERVER_SIDE_ARCHITECTURE.md     — production architecture
    └── REPORT_SCHEMA.md               — reconciliation JSON schema
```

---

*This document reflects the state of the POC as of June 2026. All gate probe results, API shapes, and authentication findings were captured from a live production Verint environment.*
