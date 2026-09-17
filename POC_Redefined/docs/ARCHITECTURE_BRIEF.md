# RTA Automation — Technical Architecture Brief

**Version:** 2.0  
**Date:** June 2026  
**Audience:** Infrastructure & Architecture Review Team  
**Status:** POC validated in production Verint + GTT environment

---

## 1. Problem Statement

### Operational Context

| Dimension | Detail |
|---|---|
| **Systems** | Verint WFM SaaS + GTT (workforce clock system via GCP Cloud Run) |
| **Agents monitored** | 700+ across El Salvador, Guatemala, Philippines |
| **RTA positions** | 8 simultaneous (5 Guatemala, 3 Philippines) |
| **LOBs per RTA** | 6–10 (Epic Games, CIBC, Costco, others) |
| **Citrix use** | Some RTA positions access Verint via Citrix desktop |

### The Two Problems

**Problem 1: Real-time adherence delay.**  
Verint's API has a 15–30 second lag relative to the screen. RTAs need sub-second visibility to act before escalation. A browser extension sitting between Verint and the RTA's screen closes this gap to under 1 second.

**Problem 2: Attendance reconciliation is manual.**  
GTT (clock-in/clock-out) and Verint (real-time adherence) are separate systems with no built-in link. Today, supervisors cross-reference them manually. The POC automates this join.

---

## 2. What This Solution Does NOT Use

| Technology | Used? | Explanation |
|---|---|---|
| **Playwright** | No (POC) | No automated browser navigation in the current POC. Discussed in server-side path as an option but not required — see Section 5. |
| **Netcap / packet capture** | No | No network-level interception. All data capture happens inside the browser via JavaScript prototype hooks — same origin, same session, no MitM. |
| **Screen scraping / OCR** | No | No pixel reading, no DOM traversal, no screenshot analysis. Only JSON API response bodies (already parsed by the browser) are consumed. |
| **Verint SDK or Citrix SDK** | No | No Verint-side installation, no Citrix integration. |
| **Custom Verint connector** | No | The extension observes what Verint's SPA already does. No modification to Verint configuration. |

---

## 3. How We Extract Information from Verint: Passive XHR Tap

### Core Principle

> The extension observes what Verint's own calendar app already does. It does not navigate, click, or modify anything. It reads.

When the RTA opens Verint's adherence calendar, Verint's single-page application makes authenticated POST requests to its own internal API. The extension intercepts those responses at the JavaScript layer and makes them available to the Command Center — with no delay, no modification, and no additional network calls.

### The API Being Tapped

```
POST https://*.verintcloudservices.com/api/wfm/main/v2/calendar-filter
Headers: impact360authtoken (session token), x-csrf-* (CSRF token)
Body (JSON:API format):
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
Response: resourceData[] — one entry per agent with adherence, schedule, violations
```

This is Verint's own internal SPA endpoint. The extension captures both the request (including auth headers) and the full response JSON.

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Verint Calendar SPA  (RTA's Chrome/Brave tab)                 │
│  XHR POST /api/wfm/main/v2/calendar-filter (authenticated)    │
└────────────────────────────┬────────────────────────────────────┘
                             │ XHR.prototype.send hook (read-only)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  inject.js — MAIN world, document_start                        │
│  Captures request headers + response body                      │
│  Builds PII-safe index: {id: Number, org: String} only        │
│  Emits to ISOLATED world via window.postMessage               │
└────────────────────────────┬────────────────────────────────────┘
                             │ chrome.runtime.sendMessage
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  background.js — MV3 Service Worker                            │
│  parse.js buildCards()    → CommandCard[] (OOA violations)    │
│  parse.js extractRoster() → all agents (for reconciliation)   │
│  Persists derived state to chrome.storage.session (RAM only)  │
└────────────────────────────┬────────────────────────────────────┘
                             │ chrome.tabs.sendMessage
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  content_cc.js → window.postMessage → React app               │
│  Command Center receives cards + roster                       │
│  Priority Feed: adherence alerts sorted by OOA duration       │
│  Reports tab: GTT × Verint reconciliation dashboard          │
└─────────────────────────────────────────────────────────────────┘
```

### Security Properties

| Property | Implementation |
|---|---|
| Read-only | Extension never modifies, blocks, or re-routes Verint traffic |
| No stored credentials | Auth rides the RTA's live session; no passwords or tokens stored persistently |
| PII handling | Employee names in RAM only during card construction; never logged or written to disk |
| No external network | Extension only communicates to `localhost:5173`; zero third-party calls |
| Session-scoped storage | `chrome.storage.session` clears on browser close |

---

## 4. How We Download Information from GTT

GTT is CIBC's workforce time-tracking system, already server-side accessible:

```
POST https://gttpostmortemreport-1040489670153.europe-west1.run.app
Auth: GCP SA identity token (google-auth IDTokenCredentials)
      SA: td-sa-wfm-gtt-reports02@ti-is-prod-eu-w1.iam.gserviceaccount.com
Body: { functionalArea, sites, startDate, endDate, timezone, timezoneLabel }
Response: array-of-arrays (22 columns, one row per clock event)
```

GTT is a daily activity log — not just clock-in/clock-out. Epic Games El Salvador returns 20 distinct event types. The SA has access to any functional area. **Zero browser requirement.**

---

## 5. How We Produce Alerts

Alerts (Priority Feed cards) are generated from the Verint `adherence.violations[]` array in the calendar-filter response:

- Each violation: agent was in a wrong activity → becomes a `CommandCard`
- Sorted by out-of-adherence duration (longest first)
- Intelligence bullets from `report_intelligence.py` — deterministic Python, no LLM

Currently generated client-side by `parse.js`. In the server-side path, the same Python logic runs on the server against the same JSON.

---

## 6. How We Reconcile GTT + Verint

Pure Python, zero browser requirement:

```
reconcile(gtt_rows, verint_rows)
  ├── Step 1: Exact surname match
  │   GTT "Firstname Lastname" last token ↔ Verint "Last, First" before comma
  ├── Step 2: rapidfuzz fuzzy fallback (token_set_ratio ≥ 85)
  │   For accented characters, hyphenated names, etc.
  └── Output: ReconciliationReport
        discrepancy_type ∈ {
          match_ok,
          clocked_in_not_in_adherence,   — in GTT, missing from Verint scan
          in_adherence_no_clock_in,       — in Verint, no GTT clock-in
          clocked_out_still_active        — GTT clock-out, Verint still active
        }
```

Produces `reconciliation_YYYY-MM-DD.json` — AI-readable schema (`REPORT_SCHEMA.md`).

---

## 7. What the POC Has Proven

| Proven Fact | Evidence |
|---|---|
| Verint's internal API endpoint and full request/response schema | Captured from live production session via extension |
| Verint accepts arbitrary `workResourceIds` across pages | Gate V2 ✅ (cross-page selection, June 2026) |
| Verint accepts arbitrary `workResourceIds` across LOBs | Gate V3 ✅ (cross-LOB selection, June 2026) |
| Full-floor census possible in one batch request (no paging needed) | V1+V2 gate combination |
| GTT API callable server-side | Working in production since June 16, 2026 |
| Reconciliation join logic produces correct output | Verified on 2,288-row Epic El Salvador dataset |
| Report schema renders in Command Center dashboard | Live as of June 19, 2026 |
| Auth: session token + cookies, not static API key | `credentials: "include"` + `impact360authtoken` (captured from live session) |

---

## 8. Current POC Deployment Constraints

| Constraint | Impact |
|---|---|
| Chrome / Brave required | MV3 extension; not Firefox/Safari |
| RTA must have Verint open | Passive capture — only captures when Verint renders a page |
| Python 3.12 + google-auth runtime | For GTT fetch and reconciliation |
| `local_api.py` must be running | For Report button to trigger live pipeline (Starlette server, port 5050) |
| Vite dev server | POC only; production needs static host |
| GTT SA key on disk | `GTT_JSON/` (gitignored); never commit |

---

*For the server-side / Citrix-compatible architecture, see `SERVER_SIDE_ARCHITECTURE.md`.*  
*For the report JSON schema, see `REPORT_SCHEMA.md`.*
