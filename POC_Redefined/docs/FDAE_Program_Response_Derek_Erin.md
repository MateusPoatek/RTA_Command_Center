# FDAE Program — Consolidated Response
## Prepared for Derek and Erin | CIBC WFM Transformation Steerco | May 2026

> **Prepared by:** Mateus Teixeira, in coordination with Jose Portillo (async)
> **Source basis:** April 28 shadowing session, ReDY Activity-Based Design outputs, CIBC programming source workbook, OCR evidence pack, simulation results
> **Items flagged for Jose:** Proposed next accounts (Section 4b), capacity model validation (Section 4a), APAC/EMEA legal constraints (Section 4c), global coordination meetings (Section 5)

---

## 1. Specific Workflows Being Automated (Derek's ask)

### 1a. Named Workflows in Scope

Six discrete RTA operational processes were mapped using the ReDY methodology during the April 28 shadowing session at the CIBC Guatemala site. These are the full denominator — 6 of 6 RTA process areas, covering the entire 8-hour shift.

| # | Process Name | Trigger | What the Bot / Automation Does (End-to-End) | Output | Status | % of Total RTA Shift Time |
|---|---|---|---|---|---|---|
| 1 | **Shift Start & Morning Reconciliation** | Shift start time | Loads prior handoff state, surfaces unresolved cards from last shift, pre-populates LOB coverage view, flags missing attendance baseline | Shift briefing card + open card queue | Identified | 5% (~25 min) |
| 2 | **Real-Time Adherence Monitoring & Alerting** | Every 15 minutes (continuous) | Vision Agent reads Verint screen every 30 seconds; Decision Agent applies 18 alert rules; Watch Agent tracks repeat violations across cycles; alert message drafted with correct LOB channel selected; card presented for RTA review and dispatch | Work cards with severity score, drafted alert message, target channel pre-selected | **In Build** | 60% (~288 min) |
| 3 | **Coaching & Huddle Approval** | Supervisor request via Google Chat | Checks current Staffing Outlook line health (GREEN / YELLOW / RED / BLUE); applies offline approval rules; pre-drafts approval or denial with rationale; flags when coaching is running over 30-minute threshold | Coaching decision card with drafted reply | Identified | 7% (~35 min) |
| 4 | **Outage Detection & Response** | ≥ 2 tool-failure reports within 5 minutes | Cross-references adherence anomaly pattern (multiple agents same LOB simultaneously offline); confirms outage scope; opens ServiceNow ticket draft; presents step-by-step incident playbook with timed escalation steps | Outage playbook card + ServiceNow ticket draft + escalation card to OM | Identified | Included in adherence time |
| 5 | **ServiceNow Ticket Processing** | New ticket in RT queue | Reads ticket category and subtopic; routes to correct queue (RT or Scheduling); validates required fields; pre-populates resolution template; surfaces for RTA review before submit | Ticket resolution card with routing and field pre-fill | Identified | 8% (~40 min) |
| 6 | **Attendance Reporting & Shift End** | Every 3 hours (08:30 / 11:30 / 14:30 / 16:30) and shift close | Pulls attendance figures from GTT; calculates attendance percentages; pre-fills email body and subject line; compiles unresolved cards into handoff document | Attendance report card (ready-to-send email) + shift handoff document | Identified | 9% (~45 min) |

**Denominator statement:** 6 of 6 RTA process areas are mapped and modelled. This represents 100% of the CIBC RTA role scope. Of the 7 AI agents required to cover all 6 processes: 2 are fully built and running in simulation (Intelligence/Decision Agent, Watch Agent), 1 is partially built (Vision Agent — OCR baseline complete, live capture pending), and 4 are designed but not yet built (Reporting Agent, Handoff Agent, Integration Agent, RPA Engine).

---

### 1b. Reports Being Automated or Eliminated

| Report Name | Current Owner | Frequency | Manual Time (Observed) | What the Automation Does | Status |
|---|---|---|---|---|---|
| Morning Attendance Report | RTA | Daily — 08:30 | ~10–12 min | GTT pull → attendance % calculation → email draft pre-populated | Identified (RPA + Reporting Agent) |
| Mid-Morning Attendance Update | RTA | Intraday — 11:30 | ~10 min | Same as morning; differential from prior report surfaced | Identified (RPA + Reporting Agent) |
| Afternoon Attendance Update | RTA | Intraday — 14:30 | ~10 min | Same as mid-morning | Identified (RPA + Reporting Agent) |
| Final Attendance Report | RTA | Intraday — 16:30 | ~10 min | Final numbers + end-of-day attendance summary | Identified (RPA + Reporting Agent) |
| Shift Handoff Report | RTA | Per shift (end-of-day) | ~25 min | Compiles unresolved cards, open risks, key decisions, and next-shift notes from audit trail | Identified (Handoff Agent) |
| Escalation Notification | RTA / Senior RTA | As-needed | ~5–8 min per event | Drafts escalation message to OM/supervisor; auto-routes based on severity; attaches relevant card history | Identified (Decision Agent — alert logic built) |
| AI Action Report | N/A today (new) | Per shift | Would replace ~15 min of tracking | Summarises all AI-assisted actions, overrides, and confidence changes for the shift; replaces manual tracking | Planned (Reporting Agent) |

**Combined manual hours saved (reports only, current estimate):** ~40–45 min/shift for attendance reports + ~25 min/shift for handoff = ~65–70 min/shift recoverable from reporting alone. Estimates are based on shadowing observations, not a formal time study.

---

### 1c. Specific Tasks Being Automated Within the RTA Role

The following table lists discrete automated tasks within Process 2 (Real-Time Adherence Monitoring), which is the primary automation target and the process furthest in build.

| Task | Trigger | What the Automation Does | Output | Status |
|---|---|---|---|---|
| Agent status scan | 15-min cycle mark | Vision Agent captures Verint screen every 30 seconds; extracts agent name, status code, duration, scheduled activity | Structured row data per agent | Partial (OCR baseline: status 8/8, name 6/8, duration 6/8, LOB 0/8) |
| Long-call detection (INBD > 9 min) | Duration threshold crossed | Decision Agent flags agent; assigns HIGH severity; drafts "long call" alert to LOB chat channel | Work card with drafted message | Built — running in simulation |
| After Call Work excess (ACW > 3 min) | Duration threshold crossed | Same as above — MEDIUM severity; drafts ACW alert | Work card | Built — running in simulation |
| Call on Hold excess (> 3 min) | Duration threshold crossed | MEDIUM severity alert drafted | Work card | Built — running in simulation |
| Coaching overrun (COAC > 30 min) | Duration threshold crossed | HIGH severity; drafts alert to LOB channel; checks if coaching agent count exceeds 2 for same LOB | Work card + potential coaching denial card | Built — running in simulation |
| Meeting overrun (MEET > 30 min) | Duration threshold crossed | MEDIUM severity; draft alert | Work card | Built — running in simulation |
| Login stall (Login > 0.5 min) | Duration threshold crossed | LOW severity; flags login issue | Work card | Built — running in simulation |
| TIG Offline excess (> 2 min) | Duration threshold crossed | MEDIUM severity; drafts alert | Work card | Built — running in simulation |
| Out-of-adherence detection (10 status mismatches) | Scheduled activity mismatch | Decision Agent cross-references actual vs. scheduled activity for OUTB, CallOnHold, ACW, TIG, Login, MEET, COAC, LNCH, BRKP, INBD | OOA card with mismatch detail | Built — running in simulation |
| Repeat violation escalation | Same violation in 2 consecutive 15-min cycles | Watch Agent detects persistence; escalates to supervisor-level card; drafts @supervisor message | Escalation card | Built — running in simulation |
| Duplicate suppression | Same agent + same status + same cycle | Watch Agent blocks duplicate card creation; logs suppression event in audit trail | Suppression audit entry | Built — running in simulation |
| LOB channel routing | Card creation | Decision Agent maps agent LOB → correct Google Chat channel using LOB routing table | Pre-selected channel on card | Built (channel map complete for Guatemala) |

**Exception statuses (require human judgment before alerting):** BLEN, TECH Issues, ABSU, NOT READY-Training, TRGR, Vacation, LOAP, ABAS, ADEV — these 9 statuses are flagged as `consider_before_flagging` and always routed to human review, not auto-dispatched.

---

## 2. CIBC Pilot Findings (Erin's ask)

### 2a. Coverage — What We've Uncovered on CIBC

The CIBC pilot has covered **100% of RTA process areas** — all 6 processes have been mapped, documented, and modelled. Shadowing was conducted on April 28, 2026 at the CIBC Guatemala site with two RTAs and the Senior RTA.

**What was mapped:**
- 6 full operational process flows (ReDY ABD methodology), including all decision branches, tools, and handoffs
- 18 alert rule types extracted directly from CIBC's own programming source workbook (8 time-limit rules, 10 out-of-adherence rules, 9 exception statuses)
- 11 LOBs across Guatemala and Philippines (6 Guatemala, 5 Philippines) with Google Chat channel routing
- Full shift time model: 480 minutes observed, categorised across 6 task types
- 12 Verint screenshots processed through OCR baseline test (5 with ground truth, 8 labelled rows)

**The denominator in full:** The CIBC RTA role consists of 6 process areas, 7 AI agents required to automate them, and a baseline of 480 minutes of manual work per shift. We have mapped 6/6 (100%), built or partially built 3/7 agents (43%), and can account for automation potential against every minute of the shift baseline.

---

### 2b. Solutioning — What Worked, What Didn't, What Was Redesigned

**What worked:**

| Finding | Evidence |
|---|---|
| Alert rule extraction from CIBC's own sources is highly reliable | 18 rules extracted from programming workbook with exact thresholds; fully deterministic — no AI interpretation needed |
| Rules engine produces accurate, consistent alert cards | 2-cycle simulation: 15 alerts fired, 2 escalations generated, 8 clearances tracked correctly |
| OCR reads agent status and duration accurately | Status match 8/8 (100%), duration match 6/8 (75%), name match 6/8 (75%) |
| Card system + HITL model resonates with RTAs | Every AI recommendation reviewable before dispatch; RTA override generates a learning signal |
| FuelIX Copilot (AI assistant) works for message drafting | Streaming responses; explain / recommend / improve-draft flow tested end-to-end |
| Duplicate suppression logic eliminates re-alert noise | Watch Agent correctly blocked duplicate cards across the 2-cycle simulation |

**What didn't work:**

| Finding | Impact | Root Cause |
|---|---|---|
| LOB code classification via OCR: 0/8 match | Cannot route alerts to correct LOB channel without manual input | LOB context is not embedded in agent-level screenshot crops; it resides in the Verint tab/filter context, which was not captured in the short-strip screenshots used for the baseline test |
| Table reconstruction from short-strip screenshots is fragile | Row-to-agent association breaks at scale | Short crops lose column header context; full-table screenshots perform significantly better |
| BREAK status examples underperformed vs. COAC | Lower OCR confidence on BRKP status codes | Insufficient training examples in evidence pack; only 2 BREAK rows in the ground-truth set |

**What was redesigned:**

The original approach assumed a single OCR pipeline (Vision Agent reads Verint screen → classifies everything including LOB). After the LOB match failure (0/8), the architecture was redesigned into a **dual-track model**:

| Track | Approach | Status | When Used |
|---|---|---|---|
| **Track A — OCR** | Screen capture → Cloud Vision OCR → structured row extraction → rules engine | Partial (baseline complete) | Fallback when direct API is unavailable; requires LOB override from Verint tab metadata |
| **Track B — Verint REST API** | Direct read-only API call to Verint adherence endpoint → structured data → rules engine | Planned (pending API credential negotiation with CIBC IT) | Permanent production target; eliminates OCR dependency entirely |

Track B removes the LOB classification problem completely because the API returns LOB as a native field. It is also faster (no image processing latency), more accurate (no OCR error surface), and simpler to govern (no screen data handled at all).

---

### 2c. Emerging Framework — Applicable Across Accounts

Three principles emerged from the CIBC pilot that define the reusable framework for other accounts:

**Principle 1 — Rules come from the client, not from the AI.**
Every alert threshold is extracted directly from the client's own programming source workbook. The AI does not infer thresholds. This makes the rule set auditable, verifiable, and immediately acceptable to compliance. Onboarding a new account requires extracting their rule workbook (typically 1–2 days with a WFM SME), not training a new model.

**Principle 2 — LOB routing uses metadata, not screen data.**
The LOB → channel routing table is a configuration file, not an OCR output. On CIBC, it was seeded from the `lob_routing_seed.json` extracted during shadowing. On any new account, the same file format is populated in one session. Once the LOB map exists, the alert routing works correctly regardless of OCR accuracy.

**Principle 3 — The codebase does not change per account; the configuration does.**
The alert engine, card lifecycle, HITL model, Copilot, and dispatch layer are account-agnostic. Adding a new account means providing: (a) their Verint rule workbook, (b) their LOB → channel map, and (c) their API credentials or Verint access method. The underlying system remains unchanged. This is the architecture that enables the "one to many" deployment model.

---

## 3. Standardisation Matrix

The matrix below maps each RTA process area against known accounts. **CIBC Guatemala** is fully populated from April 28 shadowing data. **CIBC Philippines** is partially populated — LOBs are known, but process execution detail has not been shadowed. **Future accounts** are shown as TBD columns to be populated via ReDY shadowing sessions once those accounts are onboarded.

**Cell legend:**
- **Identical** — same process, same tools, same cadence: direct config-copy candidate
- **Similar** — same process, minor tool or threshold variation: config copy + 1-2 adjustment sessions
- **Bespoke** — fundamentally different execution: requires new ReDY session + rule extraction
- **N/A** — process does not exist in this account's RTA role
- **TBD** — account not yet shadowed

| Process Area | CIBC Guatemala | CIBC Philippines | Account C (TBD) | Account D (TBD) | Account E (TBD) | Standardisation Candidate? |
|---|---|---|---|---|---|---|
| **1. Shift Start & Morning Reconciliation** | Bespoke — Verint + Workday + Google Sheets reconciliation script | TBD | TBD | TBD | TBD | Low (shift start varies heavily by client staffing tools) |
| **2. Real-Time Adherence Monitoring & Alerting** | Identical pattern — Verint WFM, 15-min cycle, Google Chat alerts, 18 rule types | Similar (same Verint, same Google Chat, likely same cadence — LOBs differ) | TBD | TBD | TBD | **HIGH — top standardisation candidate** |
| **3. Coaching & Huddle Approval** | Similar — Staffing Outlook + Google Chat; GREEN/YELLOW/RED/BLUE line health gates | TBD | TBD | TBD | TBD | Medium (line health thresholds vary by client SLA) |
| **4. Outage Detection & Response** | Bespoke — CIBC-specific escalation path (Supervisor → OM → Senior RTA); ServiceNow ticket | TBD | TBD | TBD | TBD | Low (escalation hierarchy is client-specific) |
| **5. ServiceNow Ticket Processing** | Bespoke — CIBC routing rules, help topic mapping, specific subtopic taxonomy | TBD | TBD | TBD | TBD | Low unless other accounts also use ServiceNow with same taxonomy |
| **6. Attendance Reporting & Shift End** | Similar — GTT + Google Sheets Apps Script + Gmail; 4× per shift | TBD | TBD | TBD | TBD | **HIGH — top standardisation candidate** |

**Top standardisation candidates for "one RTA to many accounts" deployment:**

**Process 2 — Real-Time Adherence Monitoring** is the strongest candidate. Every RTA operation using Verint WFM follows the same underlying pattern: scan adherence grid, identify threshold violations, send alerts to LOB channel. The only account-specific elements are the threshold values (extracted from their rule workbook) and the LOB → channel mapping. Both are configuration, not code. A single deployment of the alert engine can serve multiple accounts simultaneously, with per-account configuration files.

**Process 6 — Attendance Reporting** is the second strongest candidate. The report structure (pull GTT, calculate %, email summary) is consistent across the CIBC footprint. The primary variation is the GTT filter configuration and email distribution list — both configuration items. The RPA/Reporting Agent can be configured per account in the same session as the LOB map setup.

**Next step for this matrix:** Propose ReDY shadowing sessions on the next 2-3 Guatemala accounts to fill in columns C, D, E. One half-day session per account yields enough data to classify all 6 rows. Jose to identify candidate accounts (see Section 4b).

---

## 4. Scalability Beyond CIBC (Erin's ask)

### 4a. Capacity With 2 Engineers — How Many Accounts in Parallel

**Current capacity model (Guatemala, 2 engineers):**

The CIBC build has two distinct workstreams: (a) infrastructure and core intelligence, and (b) account-specific configuration. Once CIBC reaches pilot stability, the infrastructure layer is complete and reusable. New accounts require only the configuration layer.

| Phase | Engineer 1 | Engineer 2 | Parallel Accounts |
|---|---|---|---|
| **Now (CIBC active build)** | CIBC core build + Vision Agent (Track A/B) | CIBC connectors (GChat, ServiceNow, GTT) | 1 (CIBC only) |
| **CIBC pilot stable (est. 2–3 months)** | CIBC maintenance + monitoring | New account onboarding (rules extraction, LOB config, channel map, testing) | 2 (CIBC + 1 new) |
| **CIBC in production** | New account A onboarding | New account B onboarding | 3 (CIBC + 2 new simultaneously) |

**Onboarding estimate per new account:** 3–5 sprints (6–10 weeks). Breakdown:
- Sprint 1–2: ReDY shadowing session + rules extraction + LOB mapping
- Sprint 2–3: Account configuration (rule workbook, LOB routing file, channel credentials)
- Sprint 3–4: Integration testing (Verint access method, Chat/Teams webhook setup)
- Sprint 4–5: Pilot run + RTA onboarding + confidence calibration

Reuse factor: ~70–80% of code and infrastructure is shared across accounts. Only the configuration layer changes.

> **Flag for Jose:** This estimate assumes the same Verint WFM stack and similar IT access patterns across accounts. If an account uses a different WFM system or has more complex Citrix restrictions, onboarding may extend to 6–8 sprints. Jose to validate based on the specific accounts proposed.

---

### 4b. Proposed Next 2–3 Accounts After CIBC

**Selection criteria** (derived from CIBC architecture and access model):

| Criterion | Rationale |
|---|---|
| Operates Verint WFM | Core alert engine runs on Verint data; non-Verint accounts require additional integration work |
| Has an active RTA function in Guatemala | Allows same-geography onboarding without APAC/EMEA legal complexity |
| Has an identifiable rule workbook or equivalent programming sources | Required for rules extraction; without it, shadowing time extends significantly |
| Uses Google Chat or Microsoft Teams for LOB alerts | Alert dispatch layer already built for both; new channels require additional development |
| Client relationship is stable (not in active contract renegotiation) | Avoids legal entanglement during pilot phase; aligns with Erin's opt-out approach |

> **Action for Jose:** Please identify 2–3 Guatemala accounts that meet these criteria. The team can begin ReDY scoping for Account B in parallel with CIBC pilot, provided the CIBC core build reaches a stable handoff state. Propose candidate accounts when you're back from travel so we can align on the sequencing before the end-of-month planning.

---

### 4c. "Earn the Right to Release" — Criteria to Open a New Geography

Erin asked for this defined, not improvised. Below are the 5 gates that must be met on a Guatemala account before expanding to a new geography (APAC, Europe).

These gates apply at the **account level**, not the geography level. A new geography opens when at least one account has passed all 5 gates and the Telus infrastructure is confirmed operable in the target region.

| Gate | Name | Condition | How It Is Measured | Who Signs Off |
|---|---|---|---|---|
| **Gate 1** | Accuracy | Alert confidence score ≥ 85% sustained over 10 consecutive production shifts | Learning strip audit log — `confidence` field averaged over rolling 10-shift window | Engineering lead |
| **Gate 2** | Coverage | At minimum, Process 2 (RT Adherence) and Process 6 (Attendance Reporting) are live and not in fallback mode | Agent build status tracker — Vision or API track active, no manual override mode running | Engineering lead |
| **Gate 3** | Adoption | RTA override rate (cards suppressed or edited before dispatch / total cards actioned) ≤ 20% over last 5 shifts | Dispatch log ratio — `rta_edited_or_suppressed` / `total_card_actions` | Operations lead + RTA team lead |
| **Gate 4** | Stability | Zero critical incidents (P1 alert missed, wrong channel dispatch, duplicate escalation flood) in last 10 production shifts | Incident log — any P1 incident restarts the 10-shift clock | Operations lead |
| **Gate 5** | Governance | Immutable audit log is active and has been reviewed by the CIBC security contact; Track B (API) or Track A (OCR with CIBC security sign-off) confirmed operational | Written sign-off from Elizabeth Hurtado (CIBC security contact, already identified) | Telus compliance + client security |

**What happens after all 5 gates pass:**
1. Engineering runs a parallel dry-run on the new geography account for 2 shifts (read-only mode, no live dispatch).
2. Operations lead and RTA team lead in the new region review the dry-run output.
3. Commercial team confirms opt-in/opt-out status with the client (Erin's team leads this).
4. Live dispatch is enabled with a 5-shift supervised window before unattended operation begins.

**What does not gate a new geography:**
- CIBC being in full production on all 6 processes (Process 2 + 6 live is sufficient)
- All 7 agents being built (Reporting + Handoff agents are additive, not blocking)
- Zero RTA overrides (20% override rate is healthy — it means the RTA is engaged and teaching the system)

---

## 5. Global Coordination (Ligo's ask)

Ligo flagged that Jose needs to be connected with Aida (EMEA) and Satya (APACA) to enable regional support. Evelyn has confirmed she will add Jose to her weekly with Satya and Aida.

**Engineering position:** No action required from the engineering team until Jose is connected. Once regional contacts are established, the architecture documentation (configuration-driven LOB map, cloud-agnostic deployment model) is ready to be shared with regional teams as a technical briefing. The framework is designed to operate on Azure (preferred for EMEA given Microsoft footprint in Europe) or GCP/AWS — no regional re-architecture is needed.

**Action for Jose:** Prioritise joining Evelyn's weekly once dates are confirmed. This unblocks Sections 3 and 4 of this document for APAC and EMEA geographies specifically.

---

## 6. Legal & Compliance (For Reference — Not Blocking)

**Erin's direction:** Continue building. Do not let current contracts slow solutioning. Opt-out approach to be managed centrally by Erin and the commercial team.

**Engineering compliance posture (already in effect):**

| Principle | How It Is Implemented |
|---|---|
| No raw screenshots stored or dispatched | Verint screen frames are treated as transient OCR inputs. Text is extracted, the frame is discarded immediately. No screenshot ever enters Google Chat, Teams, or email |
| Structured text only | All alert messages are constructed from extracted text fields (agent name, status code, duration, scheduled activity). No image attachment at any point in the dispatch chain |
| Immutable audit trail | Every signal observed, card created, RTA decision, and action taken is timestamped and appended to the audit log. The log is append-only — no record can be deleted or modified |
| Data stays within Telus boundary | The Intelligence layer runs on Telus-managed cloud infrastructure (GCP or Azure). CIBC data never leaves the Telus endpoint except as structured alert messages sent to CIBC-owned Google Chat/Teams channels |

**Pending item (not blocking current build):** Formal security review with Elizabeth Hurtado (CIBC information security contact, already identified in the CIBC intake plan). This review is required before Track A (OCR-based, transient screen data) goes to production. Track B (Verint REST API, no screen data) removes this requirement entirely.

**Erin's opt-out model:** The commercial team will lead standardised client communication. Engineering is building the technical capability that the opt-out model will govern. No engineering change is required to implement the opt-out framework — it is a commercial and contractual mechanism, not a technical one.

---

## Appendix A — Agent Build Status Summary

| Agent | Primary Function | Inputs | Outputs | Build Status |
|---|---|---|---|---|
| **Intelligence Service** (Decision Agent) | Alert detection, severity scoring, duplicate suppression | OCR rows or Verint API events | Work cards, draft messages, audit events | Built — running in simulation |
| **Watch Agent** | Threshold monitoring, repeat-violation tracking | Card events, cycle comparisons | Escalation triggers, watch-rule firings | Built — within Intelligence Service |
| **Vision Agent** | Real-time screen capture every 30 seconds | Citrix pixel stream (Verint window) | Structured OCR rows with bounding boxes | Partial — OCR baseline complete; live capture pending |
| **Reporting Agent** | Attendance report, AI action report, escalation report | Card audit trail, shift state | Report cards, pre-filled email drafts | Planned |
| **Handoff Agent** | Shift close, next-shift memory compilation | Unresolved cards, RTA decisions | Handoff report, shift summary | Planned |
| **Integration Agent** | ServiceNow, GTT, Staffing Outlook connectors | APIs, file queues, webhook events | Normalised events for the event bus | Planned |
| **RPA Engine** | GTT data pull, report export, ServiceNow updates | Orchestrator commands | Confirmed execution results | Planned |

---

## Appendix B — Alert Rule Inventory (CIBC CIBC Programming Sources)

Source: CIBC RTA Programming Source Workbook — "Mapping for Alerts CIBC pri" sheet, extracted April 28 2026.

### Time-Limited Statuses (flag when duration exceeds threshold)

| Verint Status | Alert Threshold | Notes |
|---|---|---|
| INBD — Inbound | > 9 min | Long call threshold |
| After Call Work | > 3 min | — |
| CallOnHold | > 3 min | — |
| Not Ready Outbound | > 3 min | — |
| NOT READY — TIG Offline | > 2 min | — |
| Login | > 30 sec | Login stall indicator |
| MEET — Meeting | > 30 min | — |
| COAC — Coaching | > 30 min | — |

### Out-of-Adherence Statuses (flag when actual status does not match scheduled activity)

OUTB, CallOnHold, After Call Work, NOT READY-TIG Offline, Login, MEET, COAC, LNCH (Lunch unpaid), BRKP (Break Paid), INBD (when scheduled for different activity).

### Exception Statuses (require human judgment — do not auto-alert)

BLEN (Blended schedule), TECH Issues, ABSU (Absence Unpaid), NOT READY-Training by phone, TRGR (Training Regular), Vacation, LOAP (Paid leave/Mentor), ABAS (New Hire Support), ADEV (ABAY Development).

---

## Appendix C — Shift Time Model Baseline

Source: April 28 shadowing session. Planning assumptions — to be replaced with formal time-study data post-pilot.

| Task Category | Minutes / Shift | % of Shift | Automation Potential |
|---|---|---|---|
| Real-time adherence monitoring and alerts | 288 | 60% | High — Process 2 is the primary automation target |
| Context switching and administrative tracking | 47 | 10% | Medium — eliminated by single-surface Command Center |
| Attendance, GTT, and reporting cycle | 45 | 9% | High — RPA + Reporting Agent |
| ServiceNow and daily exceptions | 40 | 8% | Medium — Integration Agent + RPA |
| Coaching, huddles, and offline decisions | 35 | 7% | Medium — rules-based approval; judgment cases remain human |
| Shift handoff and end-of-day wrap-up | 25 | 5% | High — Handoff Agent |
| **Total** | **480** | **100%** | — |

**Recoverable time estimate (1 RTA, 21 shifts/month):**
- Conservative: 80–115 min/shift → 28–40 hours/month
- Expected: 150–210 min/shift → 53–74 hours/month
- Aggressive: 230–300 min/shift → 81–105 hours/month

---

*Document prepared by the CIBC RTA Automation team — May 2026.*
*For questions: Mateus Teixeira (engineering lead), Jose Portillo (program lead, async).*
*Source files: POC/ and POC_Redefined/ project directories.*
