# Next Steps — From POC to Production

> This document describes the connectors, integrations, and architectural changes
> needed to take the RTA Command Center from a demo to a real operational tool.
>
> It is written for engineers and technical leads who are planning the production roadmap.

---

## Priority 1 — Data connectors (without these, nothing is real)

### Verint connector

**What it does:** Replaces the simulation engine with real-time agent status data.

**How it works:**
1. Verint exposes an adherence API (REST or WebSocket, depending on version).
2. A backend service polls or subscribes to this API every 60 seconds (or on change events).
3. The backend applies the alert rules (see `src/shared/constants.ts` for thresholds) and emits card events.
4. The frontend receives card events via WebSocket or SSE and updates the card list.

**Replaces in the codebase:**
- `src/data/fixtures.ts` — replaced by API-driven initial state.
- `src/hooks/useLiveEngine.ts` — the scan pulse and card arrival loops are replaced by the WebSocket listener.
- `src/data/scenarios.ts` — replaced by real scenario data or removed entirely.

**Key integration challenge:**
The baseline OCR test showed 0/8 LOB codes matched correctly. This means the existing OCR approach needs CIBC-specific training data before it can classify agent statuses reliably. Options:
- Use the Verint REST API directly (no OCR needed if the API is accessible).
- Train a fine-tuned classifier on CIBC Verint screenshots with labelled status codes.
- Use a rules engine with exact string matching on Verint status exports.

**Estimated effort:** 3–5 sprints (API access, data pipeline, rule engine, frontend wiring).

---

### Google Chat webhook connector

**What it does:** Sends the drafted alert message to the real LOB Google Chat space when the RTA clicks "Send alert."

**How it works:**
1. Each LOB has a Google Chat space with an Incoming Webhook URL.
2. The backend receives the dispatch request (card ID + selected channel + message).
3. It looks up the webhook URL for the selected LOB from a secure configuration store (not the frontend).
4. It posts the message to Google Chat via HTTPS.
5. The response (success/failure) is returned to the frontend to update the dispatch log.

**Why it must be backend, not frontend:**
Google Chat webhook URLs are secrets. If the frontend calls the webhook directly, the URL is visible in browser DevTools. The backend must hold the URLs and proxy the call.

**Replaces in the codebase:**
- `src/App.tsx` → `runCardAction("approve-send")` currently only updates local state.
  Add a `fetch("/api/dispatch", { method: "POST", body: ... })` call before updating state.

**LOB → webhook URL map** (to be created):
```
TLB             → https://chat.googleapis.com/v1/spaces/xxx/messages?key=...
Costco          → https://chat.googleapis.com/v1/spaces/yyy/messages?key=...
Cards           → ...
Fraud ITR       → ...
Fraud AAF       → ...
Costco Disputes → ...
```

**Estimated effort:** 1–2 sprints (backend proxy, secret management, URL map).

---

### Microsoft Teams connector

**What it does:** Sends alerts to Microsoft Teams channels (for Workforce and supervisor escalations).

**How it works:**
1. Create a Teams Bot using Azure Bot Framework or Power Automate.
2. The bot receives a message request from the backend.
3. It delivers the message to the correct Teams channel or personal chat.

**Alternative (simpler):** Use Microsoft Teams Incoming Webhooks (similar to Google Chat). Limited to channel posts, no DMs.

**Replaces in the codebase:**
- `TargetChannel["teams-workforce"]` — currently a label only.

**Estimated effort:** 1–2 sprints.

---

### ServiceNow REST API connector

**What it does:** Creates, updates, and queries ServiceNow tickets when the RTA takes ticket-related card actions.

**How it works:**
1. ServiceNow exposes a REST API (`/api/now/table/incident`).
2. The backend calls this API when the RTA clicks "Open ticket" or "Create ServiceNow follow-up."
3. The ticket number (INC-XXXXX) is returned and stored in the card's audit trail.
4. Ticket status updates from ServiceNow are polled periodically and reflected in the card status.

**Replaces in the codebase:**
- `CardAction["create-servicenow-follow-up"]` — currently updates local card status only.
- `TargetChannel["servicenow"]` — currently a label only.

**Estimated effort:** 2–3 sprints (API auth, ITIL field mapping, status sync).

---

### Workday attendance connector

**What it does:** Pulls official absence records (vacations, suspensions) to populate the Justifications file automatically, eliminating the manual Workday export step (Phase 1 of the attendance process).

**How it works:**
1. Workday provides a reporting API or scheduled report export.
2. A backend job runs each morning (before the first GTT report is available).
3. It fetches the two absence file types (vacations, suspensions) for the CBC Guatemala scope.
4. It calls the Apps Script (or a replacement service) to update the Justifications file automatically.

**Important:** Workday covers absence data only. It does not provide real-time login data.
The GTT connector (see below) is required alongside this connector to produce complete attendance reports.

**Replaces in the codebase:**
- `AttendanceReportData` in `src/domain/scenario_types.ts` — currently seeded per scenario.

**Estimated effort:** 2–3 sprints (Workday API access, scheduling, Justifications file integration).

---

### GTT (Genesys Telecom Tool) connector

**What it does:** Downloads the intraday agent login report from GTT and feeds it into the attendance pipeline, replacing the manual download-unzip-import cycle (Phase 4 of the attendance process).

**How it works:**
1. GTT exposes an ATOS Report that can be downloaded programmatically.
2. A backend job runs on a data-driven trigger (when GTT data is refreshed) rather than a fixed timer.
3. It downloads the report folder (`.zip`), extracts three key columns (Agent ID, Login date, Login time Eastern), and posts the data to the Attendance file (or its replacement service).
4. The attendance script runs automatically, refreshes the Data Studio dashboard, and signals the Reporting Agent to compose and send the next report.

**Why this matters:** GTT is the intraday attendance source in production — not Workday. Workday only has approved absences. GTT provides the real-time view of who is actually logged in. Both are required together.

**Key constraint:** GTT data is approximate. Agents may be physically present but not logged into GTT. The system must include the standard caveat in every report and use Verint (previous-day reconciliation by the Philippines RT) as the final authoritative record.

**Weekend handling:** The client does not update GTT on weekends. The connector must detect the day of week and set the correct date range (Friday–Saturday for Saturdays, Friday–Sunday for Sundays). A Monday reconciliation step must be triggered to process the weekend backlog.

**Replaces in the codebase:**
- Phase 4 of the manual process (manual GTT download, import, script run, dashboard refresh).
- The fixed-cadence attendance card in `src/data/scenarios.ts`.

**Estimated effort:** 2–3 sprints (GTT API access or scraping, trigger logic, weekend handling, Attendance file integration).

---

### Data Studio / Looker connector

**What it does:** Automates the dashboard refresh and screenshot capture that currently happen manually after each attendance script run (Phase 4, Step 6 and Phase 5, Step 2 of the attendance process).

**How it works:**
1. The Looker API (or Looker Studio API) can trigger a data refresh programmatically.
2. After the attendance script completes, the backend calls the API to force a dashboard refresh.
3. It then captures the three required dashboard screenshots (attendance rate, overtime, no-shows) via headless browser or the Looker screenshot API.
4. Screenshots and dashboard URL are passed directly to the Reporting Agent for email composition.

**Why it must be automated:** The current process requires the Guatemala RT to manually open the dashboard, visually verify the numbers, take three screenshots, and attach them to the email. This is a high-friction manual step that the Reporting Agent cannot skip — CBC Operations expects screenshots in every email.

**Estimated effort:** 1–2 sprints (Looker API access, screenshot capture, image validation).

---

### Google Sheets + Apps Script pipeline evolution

**What it does:** The current attendance process runs on Google Sheets (Justifications file + Attendance file) with Apps Script automation. This infrastructure should be preserved during early production and evolved or replaced in later phases.

**Short-term (Phases 1–5):**
- The GTT and Workday connectors interact with the existing Google Sheets files via the Sheets API.
- The Apps Script is called programmatically from the backend rather than triggered manually.
- No migration required — the existing files remain the processing layer.

**Long-term (Phase 10+):**
- Replace the Google Sheets pipeline with a proper backend data store (Postgres or Cosmos DB).
- The Justifications file becomes a database table. The Attendance file becomes a materialized view.
- Apps Script logic is rewritten as backend service functions.
- Data Studio connects to the new backend instead of Google Sheets.

**Key known issue:** The Google Sheets formula caching bug (a formula cell does not update after script run) is a documented operational problem. The short-term fix (delete-and-repaste) should be automated. The long-term fix is to replace the formula-based architecture entirely.

**Estimated effort:** Short-term wiring: 1 sprint. Long-term migration: 3–5 sprints.

---

## Priority 2 — AI and ML improvements

### Production LLM gateway (replace FuelIX client-side key)

The current implementation calls the FuelIX API directly from the browser with an API key in the Vite bundle. This is acceptable for a demo, but not for production.

**Option A — Backend proxy (recommended):**
```
Browser → POST /api/ai-chat { prompt: "..." }
         ← streaming SSE response { token: "..." }
Backend → POST https://api.fuelix.ai/v1/chat/completions (with secret key)
```
The browser never sees the API key. The backend validates the user's CIBC SSO session before forwarding.

**Option B — Azure OpenAI with Managed Identity:**
Use Azure Active Directory tokens instead of API keys. The browser exchanges its SSO session for a short-lived Azure AD token. The token grants access to an Azure OpenAI deployment. No shared secret needed.

**Option C — MCP gateway (future-state):**
Route all AI calls through a Model Context Protocol (MCP) server inside the CIBC network. The browser talks only to the MCP server; it never contacts an external AI provider directly.

---

### Verint OCR + classification pipeline (Track A)

If Verint API access is not available, the AI needs to read Verint screen captures. This is Track A of the Vision Agent build.

**Pipeline:**
```
Verint screenshot (via client VDI)
    ↓ OCR (Google Cloud Vision, Azure Computer Vision, or Tesseract)
    ↓ Structured text extraction
    ↓ Status code classifier (fine-tuned on CIBC Verint screenshots)
    ↓ Alert rule engine
    ↓ CommandCard events
```

**Critical VDI constraint for Track A:** Verint is accessed via the client's Virtual Desktop Infrastructure (VDI). This has two direct implications for the OCR approach:
1. The screenshot must be captured from inside the VDI session — the agent cannot run a local screenshot tool against a Verint window on their own machine.
2. Data cannot be copied or pasted out of the VDI directly. Any pipeline that runs outside the VDI must receive screenshots via an approved transfer method (email to a TELUS address, or a VDI-compatible agent that captures and forwards screen data).

This constraint does not apply to Track B (Verint REST API), which bypasses the VDI entirely.

**Key training requirement:**
The baseline test showed 0/8 LOB code matches. The classifier must be fine-tuned on at least 200–500 labelled CIBC Verint screenshots before it is production-ready.

See `HARNESS_FOR_COMPUTER_USE.md` for the full Track A and Track B build guide.

---

### Real learning signal pipeline

Currently, learning signals adjust a local confidence counter in React state.

**Production path:**
1. Each learning signal is sent to a backend API: `POST /api/signals { cardId, decision, confidence }`.
2. Signals are stored in a database (Cosmos DB or Postgres).
3. A weekly batch job runs preference extraction or fine-tuning using the accumulated signals.
4. Updated model weights or system prompts are deployed to the AI gateway.

---

## Priority 3 — Architecture for universality and cloud agnosticism

The POC is tightly coupled to CIBC-specific data (Verint, Google Chat, LOB names).
Here is how to make the solution portable to other contact centres.

### Configuration-driven LOB map

Move the LOB → channel map out of hardcoded data and into a configuration file or database:

```json
{
  "lobs": [
    { "id": "TLB", "name": "TLB", "geo": "Guatemala", "channels": { "chat": "https://..." } },
    { "id": "Costco", "name": "Costco", "geo": "Philippines", "channels": { "chat": "https://..." } }
  ]
}
```

This makes the system configurable per customer without changing the codebase.

### Pluggable alert rule engine

Move alert thresholds from `src/shared/constants.ts` into a database table:

```sql
CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY,
  description TEXT,
  threshold_seconds INT,
  severity TEXT,
  applies_to_status TEXT
);
```

RTAs or operations managers can adjust thresholds through a settings UI, without a code deployment.

### Provider-agnostic notification layer

Introduce an abstraction layer for message delivery:

```typescript
interface NotificationProvider {
  send(channel: TargetChannel, message: string, metadata: object): Promise<void>;
}

class GoogleChatProvider implements NotificationProvider { ... }
class TeamsProvider       implements NotificationProvider { ... }
class SlackProvider       implements NotificationProvider { ... }
```

Add a new provider by implementing the interface. The rest of the system does not change.

### Supported cloud providers

The solution is designed to run on any of:
- **Microsoft Azure** — Azure App Service, Azure OpenAI, Azure Bot Framework, Cosmos DB.
- **Google Cloud** — Cloud Run, Vertex AI, Google Chat API, Cloud Firestore.
- **AWS** — ECS/Lambda, Bedrock, Amazon Connect, DynamoDB.

The only vendor-specific dependency is the AI model. If FuelIX is replaced with Azure OpenAI or another OpenAI-compatible endpoint, change only `VITE_FUELIX_BASE_URL` and `VITE_FUELIX_API_KEY`.

---

## Suggested implementation sequence

| Phase | What to deliver | Sprints |
|-------|----------------|---------|
| 1 | Backend service with Verint API polling + WebSocket push to frontend | 3–5 |
| 2 | Google Chat webhook connector (secure, backend-proxied) | 1–2 |
| 3 | ServiceNow ticket creation on card action | 2–3 |
| 4 | Workday attendance connector (absence records — vacations + suspensions) | 2–3 |
| 4b | GTT (Genesys) connector (intraday login data, trigger-based, weekend handling) | 2–3 |
| 4c | Data Studio / Looker connector (automated refresh + screenshot capture) | 1–2 |
| 4d | Google Sheets + Apps Script pipeline wiring (short-term: programmatic trigger) | 1 |
| 5 | LLM backend proxy (replace client-side FuelIX key) | 1–2 |
| 6 | OCR pipeline + CIBC-specific classifier training (Track A fallback, VDI-aware) | 3–5 |
| 7 | Real learning signal pipeline + fine-tuning loop | 3–4 |
| 8 | Teams connector + multi-channel notification layer | 1–2 |
| 9 | SSO + RBAC + immutable audit log | 2–3 |
| 10 | Configuration-driven LOB map + pluggable rule engine + Google Sheets migration | 3–5 |

---

## See also

- [ATTENDANCE_PROCESS.md](./ATTENDANCE_PROCESS.md) — canonical attendance process reference (GTT, Workday, VDI, Data Studio)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — current technical architecture
- [SCOPE.md](./SCOPE.md) — what is in/out of scope in the POC
- [SOLUTION.md](./SOLUTION.md) — what was built
