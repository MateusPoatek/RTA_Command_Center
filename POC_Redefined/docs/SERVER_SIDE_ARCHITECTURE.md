# Server-Side Architecture — Fully Automated Reconciliation (No Browser Required)

**Version:** 2.1  
**Date:** 2026-07-07 (v2.0: June 2026)  
**Status:** Login-endpoint premise superseded — see correction below. Server-direct remains the target for **Telus-owned Verint tenants**; the extension relay is the path for client-owned/Citrix tenants.

---

> ## ⚠️ Correction (2026-07-07) — the "login endpoint" premise below is superseded
>
> This document's original premise — that the server logs into Verint directly once we "discover the login endpoint" (a "5-minute DevTools task") — **does not hold as written.** The POC subsequently established that **Verint authenticates via Microsoft Entra ID SAML2 SSO + MFA** (see `RTA_EXTENSION_MASTER_BRIEF.md` §5.1, the authoritative source). There is **no password `POST /login`** a Python client can call; the `impact360authtoken` is only issued after a full browser-based SAML round-trip.
>
> **What actually makes server-direct viable is tenant ownership, not endpoint discovery:**
>
> | Tenant | Who is the Verint admin | Server-direct viable? | Path |
> |---|---|---|---|
> | **Telus-owned tenant** (golden cluster, e.g. `wfo.a87…`) | Telus | ✅ Yes | Provision a **non-federated service account** internally (bypasses SSO). No client negotiation — these are the low-hanging fruit. |
> | **Client-owned tenant** (e.g. CIBC, via Citrix/VDI) | The client | ❌ Not without negotiation | Negotiating access into the client's infrastructure. Until then, use the **extension relay** (rides the RTA's already-authenticated browser session — see the master brief §5.2). |
>
> So the credential this doc calls a "login endpoint" is really an **admin-provisioned non-federated service-account credential**, realistic for Telus tenants and a client negotiation otherwise. The `verint_client.py` design below is still correct **once such a credential exists**; only the "sniff the login from DevTools" acquisition story is wrong.
>
> ### How the Server Side and the RTA Extension fit together
>
> They are **two capture strategies for the Verint half of the same reconciliation**, feeding one server-side core and one report schema — not competing designs:
> - **Server-direct (this doc)** — the target for Telus-owned tenants; fully automated, no human, no browser.
> - **Extension relay (`RTA_EXTENSION_MASTER_BRIEF.md`)** — the path for client-owned/Citrix tenants and the fallback everywhere; requires an RTA to have Verint open during the window (an accepted Telus automation pattern). The extension + Command Center also cover processes beyond attendance reconciliation (real-time alerts, Floor View), so it is not merely a stopgap.
> - **GTT is always server-direct** (GCP-hosted, SA token) regardless of the Verint path.
>
> These are intentionally maintained as **two viewpoints/projects** to be joined later. This doc is the server-direct viewpoint; the master brief is the extension viewpoint.

---

## The Core Insight

> Citrix is an RTA **display layer**, not a Verint data layer.
>
> Verint is SaaS on `*.verintcloudservices.com`. Whether an RTA accesses it through a Citrix
> virtual desktop or a local browser, the HTTP API endpoint is identical. A Python service
> calling the API directly bypasses Citrix entirely — Citrix is irrelevant to the data plane.

**Consequence:**

| Environment | What changes | What doesn't change |
|---|---|---|
| RTA in Citrix | Display path (VDI) | Verint API URL, request format, response format |
| RTA in local browser | Display path (native) | Verint API URL, request format, response format |
| Telus Verint tenant | Subdomain | API path, request body, response schema |
| Different LOB/account | GTT config | Everything else |

The server-side solution is **one Python codebase, different config** — with zero Playwright,
zero browser, zero Citrix dependency.

---

## What This Architecture Does NOT Need

| Technology | Needed? | Explanation |
|---|---|---|
| **Playwright** | No | Python `requests.Session()` calls the Verint API directly. No browser automation needed. |
| **Chromium / headless browser** | No | The POC browser extension exists to observe what a human RTA does in their browser. The server doesn't have a human — it calls the API directly. |
| **Chrome extension on server** | No | Extension was the POC discovery mechanism. Production uses `verint_client.py` which speaks the same API natively. |
| **Citrix / ICA session** | No | Verint SaaS doesn't know or care how the caller arrives. `requests.Session()` looks identical to a browser call at the HTTP level. |
| **Screen scraping / OCR** | No | We are calling a JSON API, not reading pixels. |

---

## What the POC Has Already Proven

| Proven | How |
|---|---|
| Verint API endpoint: `POST /api/wfm/main/v2/calendar-filter` | Captured from live production session via extension |
| Full request body shape (JSON:API, `calendarFilterCriteria`) | Captured from live session |
| Full response schema (`resourceData[]` with adherence, schedule, violations) | Parsed in production |
| `workResourceIds` can span pages (V2 gate) | ✅ Validated June 2026 |
| `workResourceIds` can span LOBs (V3 gate) | ✅ Validated June 2026 |
| Auth mechanism: `impact360authtoken` header + session cookies | Observed from live session |
| GTT API: Python-callable, server-side | In production since June 2026 |
| Reconciliation join + report generation | Validated on 2,288-row dataset |

**The one unknown (SUPERSEDED — see correction at top):** originally framed as "Verint's login
endpoint URL." The POC later established this is an **SSO/SAML flow, not a callable password
login** — so the real dependency is an admin-provisioned **non-federated service-account
credential** (internal for Telus-owned tenants; a client negotiation for client-owned tenants).

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  RECONCILIATION SERVICE  (VM / Cloud Run / GCE)                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SCHEDULER (APScheduler or Cloud Scheduler)                   │  │
│  │  Per-account triggers: shift-start, mid-shift, shift-end      │  │
│  │  Configured via accounts.yaml                                 │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼───────────────────────────────────┐  │
│  │  VERINT CLIENT  verint_client.py  (the only new component)    │  │
│  │                                                               │  │
│  │  requests.Session() — no browser, no extension               │  │
│  │  1. POST /login → session cookie + impact360authtoken         │  │
│  │  2. POST /api/wfm/main/v2/calendar-filter (offset loop)       │  │
│  │     • offset=0, 50, 100, … until returnedCount < 50           │  │
│  │     • OR: V2 gate — send all known IDs in one call            │  │
│  │  → VerintRosterRow[] (all agents, all LOBs in one session)    │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼───────────────────────────────────┐  │
│  │  GTT CLIENT  gtt_adapter.py  (unchanged from POC)             │  │
│  │  fetch_gtt(functional_area, sites, date)                      │  │
│  │  → GCP Cloud Run API → GTTRow[]                               │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼───────────────────────────────────┐  │
│  │  RECONCILER  gtt_verint_reconciler.py  (unchanged from POC)   │  │
│  │  reconcile(gtt_rows, verint_rows) → ReconciliationReport      │  │
│  │  report_intelligence.generate()   → intelligence bullets      │  │
│  │  → reconciliation_{date}.json                                 │  │
│  └────────────────────────────┬───────────────────────────────────┘  │
│                               │                                       │
│  ┌────────────────────────────▼───────────────────────────────────┐  │
│  │  API + PUSH  (FastAPI / Starlette)                            │  │
│  │  GET  /report/{account}/{date}  → ReconciliationReport JSON   │  │
│  │  GET  /stream                   → SSE push to Command Center  │  │
│  │  POST /trigger                  → on-demand run               │  │
│  │  GET  /health                   → last-run status per account │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
          │                             │
          ▼                             ▼
  Command Center (React)        Supervisors / Scheduling
  Subscribes to SSE /stream     GET /report/{account}/{date}
  Dashboard auto-updates        Export XLSX / PDF
```

---

## Multi-Account Configuration

All accounts share the same Python runtime. Differences live in `accounts.yaml`:

```yaml
accounts:
  - id: "cibc_gt"
    label: "CIBC Guatemala"
    verint_url: "https://wfo.a87.verintcloudservices.com"
    verint_credentials_secret: "projects/xxx/secrets/verint-cibc-gt/versions/latest"
    gtt_functional_area: "FA_CIBC"
    gtt_sites:
      - "GT - Guatemala - Pradera East"
    timezone: "America/Guatemala"
    schedule_utc: ["17:00", "21:00", "01:00"]   # 11:00, 15:00, 19:00 GT local

  - id: "epic_sv"
    label: "Epic Games El Salvador"
    verint_url: "https://wfo.a87.verintcloudservices.com"
    verint_credentials_secret: "projects/xxx/secrets/verint-epic-sv/versions/latest"
    gtt_functional_area: "FA_Epic Games"
    gtt_sites:
      - "SV - Antiguo Cuscatlan - Torre Emblema"
    timezone: "America/El_Salvador"
    schedule_utc: ["15:00", "19:00", "23:00"]

  - id: "telus_ph"
    label: "Telus Philippines"
    verint_url: "https://wfo.telus.verintcloudservices.com"   # different subdomain
    verint_credentials_secret: "projects/xxx/secrets/verint-telus-ph/versions/latest"
    gtt_functional_area: "FA_Telus"
    gtt_sites:
      - "PH - Manila - ..."
    timezone: "Asia/Manila"
    schedule_utc: ["22:00", "02:00", "06:00"]
```

Same Python code, different config — handles Citrix and non-Citrix environments identically.
Credentials come from GCP Secret Manager; never stored in config files or environment variables.

---

## Code Reuse from POC

| POC module | Server-side status | Notes |
|---|---|---|
| `gtt_adapter.py` | **Unchanged** | Already server-side Python |
| `gtt_verint_reconciler.py` | **Unchanged** | Pure Python, no browser dependency |
| `report_intelligence.py` | **Unchanged** | Deterministic Python, no LLM |
| `report_runner.py` | **Minor update** | Remove `--verint-fixture` flag; call `VerintClient` instead |
| `verint_client.py` | **New** | The only new component (~80 lines) |
| Chrome extension | **Unchanged (POC only)** | Not needed on server; stays as the RTA browser tool |

---

## The Only New Component: `verint_client.py`

See `POC_Redefined/verint_client.py` for the full implementation.

Key design decisions:
- `requests.Session()` carries cookies and `impact360authtoken` header across all calls
- `fetch_roster()` pages through `offset=0, 50, 100, …` until `returnedCount < 50`
- `fetch_roster_by_ids()` uses the V2/V3 gate — fetch arbitrary ID batch in one call (proven)
- Session re-auth: call `_login()` again; the `Session` object updates its headers in-place

The **only unknown** before implementing: the Verint login endpoint URL and POST body shape.
The extension only observes already-authenticated calls; the initial login was never captured.

---

## Discovering the Login Endpoint (5 Minutes) — SUPERSEDED

> **This section is retained for history but no longer applies.** The login is a Microsoft
> Entra SAML2 SSO flow, not a sniffable `POST /login` (see the correction at the top of this
> doc and `RTA_EXTENSION_MASTER_BRIEF.md` §5.1). The DevTools steps below will show the SSO
> redirect, not a reusable credential endpoint. For Telus-owned tenants, request a non-federated
> service account from the Verint admin instead; for client-owned tenants, use the extension relay.

1. Open Chrome DevTools → **Network** tab
2. Navigate to your Verint tenant and **log in**
3. In the Network tab, filter for `login` or `auth`
4. Find the POST request to the authentication endpoint
5. Note:
   - **URL path** (e.g., `/api/wfm/main/v1/login` or `/rest/WFO_REST/API/login`)
   - **Request body** (JSON or form-encoded? fields: `username`, `password`, others?)
   - **Response headers** — look for `Set-Cookie` and `impact360authtoken`
   - **Response body** — does it contain a token object?

Once known, update `VerintClient._login()` in `verint_client.py` with the confirmed values.

---

## Deployment Options

| Option | Pros | Cons |
|---|---|---|
| **GCE VM** (e2-small) | Simple ops, persistent session state, easy local testing | Always-on cost (~$12/mo) |
| **Cloud Run (Python)** | Scales to zero, no idle cost | Cold start; session state harder (no persistent cookie store) |
| **Cloud Run Jobs + Cloud Scheduler** | Serverless, clean trigger semantics | No SSE push (polling only) |
| **Kubernetes (GKE)** | Best at scale across many accounts | Overkill for current scope |

**Recommendation:** GCE e2-small while in early production. Migrate to Cloud Run Jobs when
account count exceeds 10.

---

## Security

| Concern | Mitigation |
|---|---|
| Verint credentials | GCP Secret Manager; rotated per account; never in env vars or files |
| GTT SA key | Same Secret Manager; existing approach from POC |
| Inter-service auth | Service-to-service via GCP SA identity tokens |
| Network | Cloud Run / GCE in private VPC; API via IAP or internal LB only |
| Audit log | Cloud Logging; all reconciliation runs logged with account + timestamp |
| Session token | `impact360authtoken` held in `requests.Session` RAM only; not persisted to disk |

---

## Migration Path (POC → Production)

| Phase | Milestone | What Changes |
|---|---|---|
| **0 — Today (POC)** | Extension in RTA browser, `local_api.py` on RTA machine | Nothing |
| **1 — Login Discovered** | DevTools capture of Verint login endpoint | `verint_client.py` `_login()` confirmed |
| **2 — Client Validated** | `verint_client.py` fetches live roster from Python | No browser involved |
| **3 — Scheduler Live** | Region-aware cron; GTT + Verint fetched on schedule | Reports auto-generated without RTA |
| **4 — SSE Push** | Command Center subscribes to server SSE | Dashboard auto-updates |
| **5 — Multi-LOB/Account** | Scheduler iterates all accounts from `accounts.yaml` | Full cross-account reconciliation |
| **6 — Production** | GCS storage, Secret Manager, Cloud Monitoring | Ops-ready deployment |

Phases 2–4 can run in parallel. The schema contract (`REPORT_SCHEMA.md`) is frozen, so
the frontend team can work independently of the backend.

---

## What Needs to Be Built

| Item | Effort | Notes |
|---|---|---|
| Login endpoint discovery | 5 minutes | Chrome DevTools, one-time task |
| `verint_client.py` `_login()` confirmed | 1–2 hours | After discovery; update the skeleton |
| `report_runner.py` update (remove fixture path) | 1 hour | `VerintClient` replaces `--verint-fixture` |
| Region-aware scheduler | 1 day | APScheduler with timezone-aware cron |
| SSE push endpoint | 1 day | `starlette.responses.EventSourceResponse` |
| Report storage (GCS) | 2 days | Replace `runs/reports/` with GCS bucket |
| `accounts.yaml` + Secret Manager wiring | 1 day | Per-account config + credential fetch |
| Health check + alerting | 1 day | `/health` + Cloud Monitoring on last-run age |

**Total estimated build effort (excluding infra provisioning):** 6–8 developer-days.

---

## Output Schema (Unchanged from POC)

The server-side pipeline produces the same `ReconciliationReport` JSON already rendered by the
Command Center. No frontend changes required when switching from local to server-side delivery.
See `docs/REPORT_SCHEMA.md` for the full schema.

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Verint rate-limits the service account | Medium | Medium | 400ms gaps between offset pages; exponential backoff on 429 |
| Verint session expires mid-run | High (daily) | Low | Re-authenticate at start of each scheduled run |
| Verint API shape changes | Low | High | Extension remains in production as an alert if the API changes (it would stop producing cards) |
| GCP SA key rotation | Low | Medium | Secret Manager versioning; alert 7 days before expiry |
| Surname-only join false positives | Medium | Low | Production: join on Workday ID from GTT employee master for exact 1:1 match |

---

*For how the current POC extracts data from Verint, see `ARCHITECTURE_BRIEF.md`.*  
*For the report JSON schema, see `REPORT_SCHEMA.md`.*
