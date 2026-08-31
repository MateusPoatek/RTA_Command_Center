# Business Requirements Document
## RTA Command Center — Phase 1

| | |
|---|---|
| **Document version** | 1.7 |
| **Date** | 2026-08-03 |
| **Author** | Mateus Teixeira — Engineering Architecture Lead |
| **Reviewers** | Andrew Deatherage (Executive Sponsor), Ruairi Adam (WFM Delivery Director / Project Owner) |
| **Intended audience** | Mike Nearing (Engineering Scoping), Engineering Lead (TBD), Program Manager (TBD) |
| **Classification** | Internal — Confidential |
| **Status** | Draft — Pending review |

### Version History

| Version | Date | Summary |
|---|---|---|
| **1.7** | 2026-08-03 | Tightened executive language across Sections 1-6 (de-duplicated restated Golden Cluster figures, removed IP-fingerprinting-test phrasing from BR-025 and the Section 5 scale-argument footnote); no requirement IDs, figures, or client/account names changed. |
| 1.6 | 2026-07-08 | Folded the Gold/Silver/Bronze account-tiering framework into Section 5 (renamed "Tier 2" → **Silver Cluster**, corrected its count to 85 accounts / 12,258 HC, added a new **Bronze Cluster** subsection). Reconciled the document's three inconsistent "total reachable accounts" figures (104/106/107) to a single correct **105** (Gold + Silver); left the separate, unrelated "107-account shared-Verint-tenant" technical finding (BR-025, NFR-SCALE-002) untouched. De-duplicated content restated 3-4 times across sections, standardized tier-name capitalization, and tightened verbose passages for an executive/engineering-scoping read. New: BR-031, R-13, AD-010. |
| 1.5 | 2026-07-08 | Reversed the v1.2 Americas+APAC-only scoping — region became a clustering dimension (Americas/Europe/APAC); Project Chameleon and Sky re-qualified. Golden cluster: 18→20 accounts, 4,275→6,768 HC, 43→68 RTAs. Replaced the flat $15/hr rate with real HC-weighted per-geo rates (source: `RTA _ Schedulers Salary Rates.xlsx`) — corrected combined estimate ($242,644–$659,720) is *lower* than the pre-correction figure ($298,145–$810,620) despite the larger scope. New reference doc: `ACCOUNT_SELECTION_METHODOLOGY.md`. |
| 1.4 | 2026-07-07 | Corrected R-09: the sister "Attendance Report as a Service" initiative's footprint is ~219 accounts, not 4 — but the risk is scoped to the attendance-reconciliation slice only. |
| 1.3 | 2026-07-07 | Documented the existing Telus WFM automation platform (Automation Anywhere + GCP + PostgreSQL + Intelligent Insights, SOC 2 Type II) and a build-vs-extend recommendation. Added NICE as a dual-vendor strategic pillar, the Telus Digital GCP hosting decision (AC-007), BO-07, BR-029/030, AD-008/009, R-10/11/12. |
| 1.2 | 2026-07-03 | Golden cluster narrowed 29→18 accounts (Google, FitBit, Meta-CO removed; Americas+APAC-only scoping applied). `Accounts in GTT and Verint.xlsx` confirmed as sole authoritative headcount source. |
| 1.1 | 2026-07-02 | Section 5 replaced with the audited "golden cluster" analysis (29 accounts) — supersedes the earlier 35-account Tier-1 figure. New risk R-09. |
| 1.0 | 2026-06-23 | Initial BRD. |

*Full rationale, source-by-source methodology, and every investigated-and-rejected account for the tiering framework: `Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md` — the durable ground-truth reference. The workbook's Decision Log (`Golden_Cluster_Impact_Model.xlsx`) carries the full derivation history behind each version above.*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context](#2-business-context)
3. [Stakeholders & RACI](#3-stakeholders--raci)
4. [Business Objectives](#4-business-objectives)
5. [Account Prioritisation](#5-account-prioritisation)
6. [Scope](#6-scope)
7. [Business Requirements](#7-business-requirements)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Architecture Constraints](#10-architecture-constraints)
11. [Data Requirements](#11-data-requirements)
12. [Integration Catalogue](#12-integration-catalogue)
13. [Security & Compliance](#13-security--compliance)
14. [Assumptions & Dependencies](#14-assumptions--dependencies)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Success Criteria](#16-success-criteria)
17. [Glossary](#17-glossary)

---

## 1. Executive Summary

### The Problem

Real-Time Adherence (RTA) analysts at Telus International spend approximately **4 hours per day** on tasks that can be automated today. The two most impactful manual processes are:

1. **Adherence monitoring:** An RTA watches a Verint dashboard, identifies agents who are out of schedule, manually composes a notification message, and sends it to the team lead via Google Chat or Teams. This cycle repeats every 15 minutes across multiple Lines of Business simultaneously. When an RTA manages 289 agents across 3 LOBs, the cognitive load and response latency are unacceptable.

2. **Attendance reconciliation:** Three times per shift, an RTA logs in to the GTT reporting portal, downloads a CSV of clock-in records, cross-references it against the Verint adherence schedule, and writes a report. For CIBC Guatemala alone, this process takes **49 minutes per cycle** — 2.5 hours per day, per client.

### The Solution

The **RTA Command Center** is a human-in-the-loop automation platform that:

- Captures Verint adherence data in real time (via browser extension or server-side REST API)
- Applies deterministic rules to classify exceptions and draft notification messages
- Presents alerts to the RTA analyst for review and one-click approval
- Generates GTT × Verint attendance reconciliation reports automatically on a configurable schedule
- Logs every action to an immutable audit trail
- **Never writes to any external system without explicit human approval** — the AI is advisory only

### What the POC Proved

This is not a concept — the core system is proven:

| Capability | Status | Evidence |
|---|---|---|
| Real-time Verint capture (extension) | ✅ Proven live | 12 EPIC cards on screen, 2026-06-05 |
| Rules core (normalize → triage → cards) | ✅ Proven, 44 tests | Unit tests pass; adapter-blind |
| Command Center UI | ✅ Functional | 6 RTA workflows, 4 demo scenarios |
| Floor View (per-LOB alert radar) | ✅ Shipped | Gate passed 2026-06-11 |
| GTT API integration | ✅ Proven live | 339 agents, FA_Epic Games, 2026-06-23 |
| Reconciliation report | ✅ Proven live | 340-row report generated 2026-06-23 |
| Copilot (AI advisory) | ✅ Proven | FuelIX streaming, 2026-06-05 |

### The Market Opportunity

A systematic analysis of **415 active Telus International accounts** (WFM AppSheet, 2026-03-23) confirms this platform is not a bespoke CIBC tool — it is an enterprise platform with a confirmed, addressable base inside Telus's existing portfolio.

The addressable base is organized into three tiers by how accessible each account is — **Gold** (Telus-hosted, ready today), **Silver** (a different system mix, but reachable), and **Bronze** (Citrix/VDI-locked, PCI-restricted, and/or a genuinely different stack — access-gated). Full criteria and rationale for all three: `Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md`; full account-by-account detail and live formulas: `Golden_Cluster_Calculations/Golden_Cluster_Impact_Model.xlsx`. See Section 5 for the complete breakdown.

| Tier | Stack | Accounts | Recorded HC | Action required |
|---|---|---|---|---|
| **Gold** | Verint + GTT + Workday ID, all Telus-hosted, 3 regions | **20** | 6,768 | **None — ready today** |
| **Silver** | ≥2 of {Verint, GTT, Workday}, not Citrix/VDI, not PCI-flagged | **85** | 12,258 | One time-capture adapter |
| **Bronze** | Different stack and/or Citrix/VDI and/or PCI — *not fully sized* | 7+ confirmed | 1,478 known (partial) | Access negotiation required |
| **Gold + Silver total** | | **105** | **19,026** | Phase 1 + adapter sprint |

Gold's largest accounts: **Tiktok (3,653 HC), Zillow (558 HC), Epic Games (785 HC), Riot Games (538 HC), Mercury Technologies (296 HC)**, and 15 others — many sharing the same Verint tenant infrastructure already proven in the POC. 5 Gold accounts qualify on tech stack but have no recorded headcount yet — see Section 5.

**The addressable base is bigger than Verint alone.** Telus's existing WFM automation platform (Section 2) already reads adherence from **NICE IEX**, the other dominant WFM vendor in the same portfolio. Because the capture core is adapter-blind by construction (BR-030), reaching NICE-based accounts is a capture-adapter addition, not a rebuild — the true addressable market is both WFM vendors across the portfolio. NICE capture is expansion scope, not Phase 1 build; see Section 5 (Scale Argument).

### Business Case

| Metric | Current state | With RTA Command Center |
|---|---|---|
| Attendance report time | Real per-account data: 1-7×/day, 5-45 min/report (varies by account) | < 5 min automated |
| Adherence exception response | ~15 min (manual cycle) | < 60 seconds |
| RTA manual monitoring hours | ~4h/day per analyst | < 30 min/day supervision |
| Audit trail | None | Immutable, every action logged |
| Scale | 1 client per RTA | 107+ accounts, one service |

**Golden Cluster impact estimate:** Expected case **$461,532/year** recoverable, ranging $242,644–$659,720 across conservative-to-aggressive scenarios, from real HC-weighted regional hourly rates applied to the cluster's 68 implied RTAs. This is the primary, full-shift estimate across all 6 automated processes except ServiceNow ticket routing (see R-09). Full derivation, scenario table, and per-region breakdown: Section 5.

At **$6.6M/yr in RTA labour for 369 analysts globally** (Telus WFM cost model) — *note: this figure and the ~700-analyst headcount cited elsewhere in this document (Section 3, NFR-SCALE-001) have not been reconciled; they may describe different populations (cost-model-covered accounts vs. total global RTA headcount) and should be verified before being used together in a single comparison* — the Golden Cluster Expected-case estimate (~$462K/yr) represents roughly 7.0% of total global RTA labor cost recoverable from a 20-account subset of the 415-account portfolio, before Silver/Bronze expansion.

**Incumbent run-cost baseline (for ROI grounding):** existing Automation Anywhere bots run at roughly **$12,000–$13,000/bot/year** (Intelligent Insights, in production since 2022); the shared-services model prices at **~$3 CAD/VM-hour** plus **~$15,000–$16,000/year/bot** for L1–L3 support. See Section 2 (Build vs Extend) for why extending the existing platform avoids duplicating this cost. Exact per-deployment economics are pending the FDI/config session (AD-008).

---

## 2. Business Context

### Current State

RTA analysts today perform the following workflows manually:

**Adherence monitoring (continuous, ~15-min cycle):**
- Open Verint dashboard → scan agent grid for out-of-adherence (OOA) indicators
- Identify exception type (missed break, late lunch, unscheduled activity)
- Compose message in Teams/Chat (agent name, LOB, exception, recommended action)
- Send to team lead; track response; update notes
- Repeat across all monitored LOBs simultaneously

**Attendance reporting (3× per shift):**
- Log in to GTT portal → select functional area → set date range → export CSV
- Open Verint schedule → cross-reference against GTT clock-ins
- Identify discrepancies (agents present in one system but not the other)
- Write narrative report → send via email to supervisors and operations managers
- Archive report for compliance

**Outage detection:**
- Observe sudden cluster of OOA exceptions across many agents in one LOB
- Determine if this is a tech outage or a coordination issue
- Manually escalate to the right contact; coordinate response across teams

### Why This Approach

The POC established three critical architectural facts:

1. **Verint exposes a stable REST API.** The `calendar-filter` endpoint (`POST /api/wfm/main/v2/calendar-filter`) returns per-agent adherence state including schedule, violations, and actual activity — in real time. This is the same data an RTA reads manually from the screen. A server-side service can call this API on a polling interval without any human interaction.

2. **GTT exposes a GCP-hosted reporting endpoint.** The GTT ATOS Report API is callable server-side with a GCP Service Account identity token. It returns 22 columns of intraday attendance events (clock-in, clock-out, break, productivity) per agent per day. No manual download required.

3. **The hard engineering work is done.** The rules core, the card schema, the reconciliation engine, and the Command Center UI are all proven. What Phase 1 must build is the production infrastructure: backend service, persistent store, auth, and dispatch connectors.

### Why Not Verint Native

Verint has publicly stated interest in agentic WFM features. Their offering does not address this use case because:

- Verint's agentic capability is pre-production and has undergone documented rollbacks
- Verint does not bridge GTT, Workday, Google Chat, Teams, or ServiceNow for attendance reconciliation — it operates within its own data boundary
- Verint handles 1,000+ different client usage patterns; a feature that works for all of them cannot be optimised for Telus's specific 4–5 patterns
- Verint cannot provide a HITL (human-in-the-loop) audit trail that proves no AI wrote to any system without human approval — a governance requirement Andrew Deatherage has confirmed
- Every requirement in Section 7 of this document that references POC evidence is a proof point Verint cannot match with a switch flip

### The Existing Telus WFM Automation Platform

Telus already operates a **production, SOC 2 Type II-compliant WFM automation platform** (reviewed with its owner, Anshul Gaddoo, on 2026-07-06). Understanding it is essential to this BRD because a meaningful portion of what the RTA Command Center delivers already exists inside Telus and should be reused, not rebuilt.

What it is today:
- **Adherence automation bot** that checks agents against per-agent-type thresholds across many LOBs/management units, and escalates in **two tiers** (team lead → supervisor) over **Google Chat + email**, using existing webhooks. Onboarding a new LOB or threshold is a **config-file change**, not new code.
- Reads adherence from **NICE IEX** — the same class of WFM/adherence system as Verint (this is the basis for the Verint + NICE dual-vendor reach in Sections 1 and 5).
- **"Intelligent Insights"** — a centralised observability/governance spine: normalises bot logs (transactions, business/system exceptions, straight-through-processing rate) into a common schema, with **drill-down by business area → VP → director → bot**, plus ad hoc data dumps and scheduled **EOD/weekly/monthly reports** (it already produces weekly + monthly reports for CIBC).
- Runs on **~18 VMs on Telus Digital GCP**, built on **Automation Anywhere** (the AA **Control Room is the orchestrator**), backed by **PostgreSQL**. ~125 bots run on the RPA-as-a-Service model. The transactional store holds **no PII**; every bot passes a data-privacy assessment.

What it does **not** have: real-time capture from Verint, and any RTA-facing UI — it is unattended, headless, and reporting-only.

### Build vs Extend (recommendation)

**Recommendation: extend the existing platform's spine and build only the Command Center's differentiator.** The Command Center is not a duplicate of the existing platform; the two are complementary.

| Capability | Already exists (reuse) | Command Center builds (net-new) |
|---|---|---|
| Orchestration | ✅ AA Control Room | — |
| Observability + audit spine | ✅ Intelligent Insights (drill-down, exception tagging, scheduled reports) | — |
| Dispatch | ✅ Google Chat / Sheets webhooks, email | — |
| GCP hosting + shared-services ops | ✅ Telus Digital GCP, RPAaaS support model | — |
| Reporting cadence (EOD/weekly/monthly) | ✅ Intelligent Insights | — |
| **Real-time Verint capture** | — | ✅ extension / relay (POC-proven) |
| **RTA-facing Floor View + one-click HITL surface** | — | ✅ Command Center UI (POC-proven) |
| **GTT × Verint cross-system reconciliation** | — | ✅ reconciliation engine (POC-proven) |

This directly satisfies two of Andrew Deatherage's non-negotiables — **an orchestrator** and an **observability/audit trail** — with *named, already-in-production components* rather than net-new build. It also caps run-cost duplication (Section 1, cost baseline). The dependency and risk of committing to this path are tracked as AD-008 (Intelligent Insights access + FDI/config session to confirm cost/licensing) and R-10 (duplication risk if the decision is not ratified).

### Strategic Framing

This platform **repositions RTA analysts as WFM experts** — not replaces them. The RTA review gate is a deliberate business requirement, not a technical limitation. Every alert that goes out has a human name attached to it. The AI drafts; the analyst approves. This is the model that makes the platform both safe and auditable.

---

## 3. Stakeholders & RACI

| Role | Name | R / A / C / I | Responsibility |
|---|---|---|---|
| Executive Sponsor | Andrew Deatherage | **A** | Final decision authority; budget; escalation to board |
| Product Owner / Delivery Lead | Ruairi Adam (WFM Delivery Director) | **R** | Sprint backlog, delivery cadence, stakeholder comms |
| Engineering Architecture Lead | Mateus Teixeira | **R** | Architecture decisions, technical direction, POC knowledge transfer |
| Engineering Scoping Lead | Mike Nearing | **C** | Team sizing, pricing, platform technology alignment |
| Engineering Lead (TBD) | TBD | **R** | Day-to-day technical execution, code quality |
| Program Manager | Dione Pineda | **R** | Timeline, dependencies, risk tracking; WFM applications/accounts inventory |
| Existing WFM Automation Platform Owner | Anshul Gaddoo | **C** | Owner of the existing AA platform / RPAaaS / Intelligent Insights; extend-path enabler (access, PDD, cost/licensing) |
| Telus Digital GCP Infrastructure | Marcelo Save | **C** | New GCP project provisioning, GCP migration, WFM-network connectivity (also embedded on Anshul's team — key bridge) |
| WFM Global Director | Oana Ababei | **I** | WFM leadership alignment; business-case audience |
| CIBC IT / Verint Admin | TBD | **C** | Read-only Verint REST credential (blocking dependency) |
| Telus GCP / Security | Maximiliano et al. | **C** | GTT SA permissions, GCP governance |
| Telus WFM / VV Team | VV (TBD) | **C** | Kraken employee master access (Workday ID join key) |
| End Users — RTA Analysts | ~700 globally | **I** | Primary users of the Command Center |
| End Users — Supervisors / OMs | TBD count | **I** | Floor View, report recipients, threshold configuration |

---

## 4. Business Objectives

| ID | Objective | Measure of Success |
|---|---|---|
| **BO-01** | Eliminate manual attendance report generation | Report generated automatically ≤5 min after trigger, 3× per shift, with no human action |
| **BO-02** | Reduce adherence exception response latency | Alert delivered to RTA UI within 60 seconds of exception detected in Verint |
| **BO-03** | Provide a tamper-evident audit trail for every action | Every alert, every RTA decision, every dispatch logged; audit query for `actor=AI` writes returns zero rows |
| **BO-04** | Serve 20+ accounts across 3 regions (Golden Cluster) from a single deployment, expanding to 105+ via Silver Cluster, with Bronze Cluster as a longer-term access-negotiation track | No per-account code changes; tenant manifest drives all client customisation |
| **BO-05** | Enable supervisors to self-serve configuration changes | Threshold and report config changes completed in ≤10 min by a non-technical user |
| **BO-06** | Eliminate manual GTT download step | Zero CSV downloads required for any reconciliation report |
| **BO-07** | Extend the existing Telus WFM automation platform rather than duplicate it | Observability, orchestration, hosting, and dispatch reuse the existing spine (Intelligent Insights, AA Control Room, Telus Digital GCP, Chat/Sheets webhooks); net-new build limited to Verint capture + RTA Floor View + reconciliation. No already-productionised capability re-implemented without a documented reason |

---

## 5. Account Prioritisation

*Source: WFM AppSheet | Project Detox.xlsx (Sheet1, snapshot 2026-03-23) cross-referenced against Accounts in GTT and Verint .xlsx and AppSheet.ViewData.2026-03-23 for headcount. Full audit trail, live formulas, and every exclusion/assumption: `Golden_Cluster_Calculations/Golden_Cluster_Impact_Model.xlsx`.*

This section establishes that the RTA Command Center is a **platform serving a confirmed, quantified base of accounts** inside Telus's existing portfolio — not a bespoke solution for one client.

### The Golden Cluster — Immediate production target

**Criteria** (an account qualifies if it meets all of the following, per-geo where relevant):
- Active status
- Scheduling / Adherence / Time-Capture Tool = **Verint**
- Time-Capture / Adherence Tool = **GTT** — TELUS's internal Global Time Tracker (*not* Genesys, a mislabel present in several older repo docs)
- Payroll Tool = **Workday**, with Workday ID as the canonical cross-system join key
- Technology Owner = **TI** (not client-owned/custom-configured — see the Bronze Cluster subsection for the CIBC example)
- Not Google / FitBit / Meta - CO (disconnected/out of scope, 2026-07-03)
- Region (Americas / Europe / APAC) is a **clustering dimension, not a filter** — see the callout below for why this changed 2026-07-08

Full rationale and everything investigated-and-rejected: `Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md`.

**Result: 20 accounts across 3 regions.** No new integrations required beyond what the POC has already proven — all three enabling systems (Verint, GTT, Workday ID) are internally hosted for every account in this list, which is what makes it the fastest, lowest-friction rollout target. Headcount sourced solely from `Accounts in GTT and Verint.xlsx` — confirmed by Evelyn Brooks (Director of these accounts) as the authoritative record.

| Account | Recorded HC (all regions) | Region(s) | Notes |
|---|---:|---|---|
| **Tiktok** | **3,653** | Americas + Europe + APAC | Sums all BPO org-level rows; largest recorded HC in the cluster |
| **Zillow** | **558** | Americas + APAC | Confirmed present on live Verint tenant (netcap 2026-06-04) |
| **Epic Games** | **785** | Americas + Europe + APAC | POC proven live (EPIC_TISV, El Salvador, 2026-06-05) |
| **Riot Games** | **538** | Americas + Europe + APAC | |
| **Mercury Technologies** | **296** | Americas + Europe | |
| **Project Chameleon** | **270** | Europe | Re-qualified 2026-07-08; 3 Active Bulgaria sub-programs (Trust & Safety, Ad Review, Content Review), one HC pool |
| **iRobot** | **185** | Americas + Europe | |
| First American — Database Solutions & Mortgage Solutions | 135 | Americas | |
| Get Flex | 99 | Americas | |
| Myheritage Customer Contact | 96 | Americas + Europe | |
| Detego | 72 | Americas | |
| Omio | 50 | Americas | |
| Sky | 21 | Europe | Re-qualified 2026-07-08; **only** the Turkiye row — Germany/Poland rows use different tools and don't qualify |
| Mixtiles | 10 | Americas | |
| Tiktok — Content Moderation | shared with Tiktok | Americas | Same underlying headcount pool as Tiktok |
| First American — Home Warranty, MasterCard, Quince, Reddit, WestJet — Airlines | — | Americas (nominal) | **No recorded HC in the authoritative source** |

**Total recorded HC: 6,768** across 15 of 20 line items (14 unique underlying headcount pools — Tiktok/Tiktok-Content-Moderation share one pool, counted once). **5 accounts have zero recorded headcount** despite qualifying on tech stack — needs escalation to close (no quick BQ/WFM-ops source confirmed as of this writing). Implied RTA staffing from known headcount: **68 RTAs** (6,768 ÷ 100 agents/RTA staffing ratio) — 20 Americas + 25 Europe + 23 APAC.

**Impact estimate:** applying real, HC-weighted regional hourly rates to this staffing figure (replacing an earlier flat $15/hr placeholder) yields:

| Scenario | Recoverable hours/year | Recoverable $/year (combined, 3 regions) |
|---|---:|---:|
| Conservative | 30,494 | $242,644 |
| Expected | 58,003 | $461,532 |
| Aggressive | 82,910 | $659,720 |

**Per-region breakdown** (hours apportioned by headcount share; dollars use each region's own real rate):

| Region | Known HC | Implied RTAs | Real rate | Conservative $ | Expected $ | Aggressive $ |
|---|---:|---:|---:|---:|---:|---:|
| Americas | 1,984 | 20 | $10.93/hr | $97,732 | $185,896 | $265,722 |
| Europe | 2,493 | 25 | $10.67/hr | $119,806 | $227,884 | $325,740 |
| APAC | 2,291 | 23 | $2.43/hr | $25,105 | $47,752 | $68,258 |

This is a floor, not a ceiling — 5 of 20 Gold accounts contribute $0 today for lack of headcount data. The estimate is *lower* than an earlier pre-correction figure despite covering more accounts and an added region, because that earlier estimate used a flat $15/hr rate that overstated true cost; see `ACCOUNT_SELECTION_METHODOLOGY.md` for the full derivation. Full methodology and formulas: `Golden_Cluster_Impact_Model.xlsx`; 3-page leadership summary: `Golden_Cluster_Executive_Brief.docx`.

> **Note:** Many Golden Cluster accounts share the same Verint tenant infrastructure (`wfo.a87.verintcloudservices.com`) confirmed during the POC. This means a single server-side service can serve multiple accounts simultaneously via different organisational filter parameters — no additional infrastructure per account.

> **Re-qualified 2026-07-08 (reversing the 2026-07-03 exclusion):** Project Chameleon and Sky (Turkiye segment) were dropped in v1.2 because their recorded headcount was 100% outside the then-current Americas+APAC scope — not because they failed the tech-stack criteria. Both pass the exact same Verint+GTT+Workday+TI-owned test as the other 18 golden accounts. Region is now a clustering dimension, so they're back in as the anchor of the Europe cluster.

> **Resolved open item:** the AppSheet.ViewData "Total" column previously disagreed with figures used here (e.g. Tiktok: 968 there vs. figures used in this model). This is now resolved — `Accounts in GTT and Verint.xlsx` is the confirmed sole authoritative headcount source, superseding AppSheet for this purpose entirely.

### Silver Cluster — Near-term expansion (formerly "Tier 2")

**Criteria:** Active status + **at least 2 of** {Verint (Scheduling/Adherence), GTT (Time-Capture), Workday (Payroll)} present + not confirmed Citrix/VDI-locked + not flagged for PCI scope. Ownership (TI vs. Client) is **not** a Silver disqualifier the way it is for Golden — Silver's differentiator from Bronze is *access method*, not license ownership.

**Result: 85 accounts, 12,258 recorded HC** — corrected 2026-07-08. The original figure (86 accounts, 13,097 HC) included **CIBC**, which is now confirmed **Bronze** (client-owned, Citrix-based); see the Bronze Cluster subsection below. Requires one additional time-capture adapter per tool variant (Verint MyTime, Five9, RingCentral, etc.). The reconciliation core does not change. *Not yet individually re-verified per account against the Silver criteria's Citrix/PCI test — this is the prior "Tier 2" population minus CIBC. FedEx and TransUnion - Interactive carry an ambiguous "Virtual Desktop" access-method signal and remain counted here, flagged not excluded, pending confirmation (see Bronze Cluster).*

Key accounts:

| Account | Recorded HC | Time Capture | Notes |
|---|---|---|---|
| **FedEx** | **2,236 × 4 LOBs** | Five9 | Highest HC block in entire portfolio; needs Five9 adapter |
| **Epic Games** (alt LOBs) | **352 + 295** | Verint MyTime | Same account as Golden; different LOBs use different time tools |
| **TikTok — GEN AI** | **345** | Verint MyTime | |
| **TikTok — Content Moderation** | **347** | Verint MyTime | |
| **TikTok — Eco** | **132** | Verint MyTime | |
| **Hertz** | **309 + 98** | RingCentral | |
| **Shared Team** | **196** | Verint MyTime | |
| **TransUnion — Interactive** | **167** | AWS | Ambiguous access-method signal ("Virtual Desktop/Windows 365") — not yet confirmed as Bronze |
| Dave | 125 × 2 | Verint MyTime | |
| Via | 118 + 106 | Verint MyTime | |
| + 74 more | — | Various | |

**Total recorded HC: 12,258 (floor figure).** Implied RTA staffing: **123 RTAs**. Dollar figures for this tier use the Golden Cluster's blended real hourly rate as an explicit placeholder (AD-010) — Silver has not had its own per-geo rate workup yet.

### Bronze Cluster — Access-gated

**Criteria:** Active status + (fewer than 2 of {Verint, GTT, Workday} present — a genuinely different stack such as NICE, Five9, Genesys, IEX, Amazon Connect) and/or confirmed Citrix/VDI-locked and/or confirmed PCI-restricted. Any **one** condition alone is sufficient.

**Result: 7 confirmed account families (10 segments) — not fully sized.** This is a confirmed seed list, not an exhaustive Bronze count; access must be negotiated or confirmed before these can be sized the same way as Golden/Silver.

| Account | Known HC | Basis |
|---|---:|---|
| **CIBC** | **839** | Client-owned Verint/Workday, Citrix-based — confirmed via direct account knowledge |
| Bank of Montreal - BMO Cards | Unknown | Access-method signal: "VPN Citrix" |
| Bank of Montreal - Everyday Banking | Unknown | Access-method signal: "VPN Citrix" |
| MasterCard (+ MPMS, Phoenix segments) | Unknown | Access-method signal: "Via Citrix" |
| MoneyGram | Unknown | Access-method signal: "Within Citrix" |
| CoreLogic | 252 | Access-method signal: "Cisco Finesse via VDI" |
| T-Mobile | 387 | Access-method signal: "M365 (Citrix Client)" |
| United Healthcare | Unknown | Access-method signal: "Citrix" |

**Total known HC: 1,478** (partial — not an exhaustive Bronze count). **Savings: not modeled.** Bronze accounts need negotiated access (client-owned/Citrix) or a different capture strategy (different-stack accounts) before the Full-Shift methodology can apply.

**PCI status is unconfirmed for every account above.** No PCI-DSS flag, cardholder-data indicator, or compliance-scope column exists in any of the four authoritative source files checked (confirmed via full-text search, 2026-07-08) — PCI status is *unknown*, not "not applicable," and should not be inferred from account name or industry. See R-13.

**Strategic note on CIBC:** CIBC uses Verint as both its adherence tool and its time-capture tool (Verint MyTime) — client-owned, not TI-managed. The attendance reconciliation for CIBC is an intra-Verint join once a read-only Verint REST service account credential is obtained; the cross-system GTT bridge is not required. That single credential unlocks both adherence monitoring and attendance reconciliation for CIBC — but the underlying access is a Bronze-tier negotiation, not a Silver/Golden-tier integration.

### The Scale Argument

```
Phase 1 delivery (Golden Cluster):     20 accounts, 3 regions, proven stack, no new integrations
+ Silver Cluster (adapter sprints):     adds 85 accounts (Verint MyTime, Five9, RingCentral, etc.)
──────────────────────────────────────────────────────────────────────────────────
Golden + Silver reachable:              105 accounts, 19,026+ HC
+ Bronze Cluster (access negotiation):  7+ confirmed accounts, access-gated — not yet sized
+ NICE IEX capture adapter:             opens the NICE-based account tranche already
                                        served by Telus's existing platform (Section 2)
════════════════════════════════════════════════════════════════════════════════
Full reach: BOTH dominant WFM vendors (Verint + NICE), across all 3 tiers
```

*The 105 figure above is a business-scoping total (Golden + Silver), distinct from the 107-account shared-Verint-tenant finding cited in BR-025/NFR-SCALE-002 — that's a separate technical finding (accounts confirmed sharing one Verint tenant), not the same concept as this count. They aren't expected to match.*

**The second WFM vendor is the real scale unlock.** Telus's existing WFM automation platform (Section 2) already reads adherence from **NICE IEX** — the other dominant WFM vendor in the same portfolio. Because the capture core is adapter-blind (BR-030), a NICE capture adapter extends reach without touching the rules or reconciliation engine — the decisive argument that this is a platform, not a Verint point-tool. NICE capture is expansion scope, not Phase 1 build (Phase 1 ships Verint-only; see Section 6).

This is the answer to "why build this instead of buying it from Verint": **no vendor product covers this cross-system reconciliation, across both WFM vendors, at this scale** — and Verint cannot reconcile against its own competitor.

---

## 6. Scope

### Phase 1 — In Scope

- **Real-time adherence monitoring:** Verint capture (extension or server-side REST) → alert classification → CommandCard → RTA review → one-click dispatch
- **GTT × Verint attendance reconciliation report:** automated multi-source join, configurable schedule (shift-start / midday / shift-end minimum), delivered to Command Center Reports tab
- **Human-in-the-loop (HITL) gate:** every external dispatch requires explicit RTA approval — no AI writes to any system without a human action
- **Google Chat webhook dispatch:** first live dispatch channel; per-LOB routing
- **Persistent operational store:** card state, dispatch log, report history
- **Immutable audit trail:** append-only WORM log, every RTA action recorded
- **User authentication:** Azure AD / SSO; session management
- **Role-based access control:** RTA analyst, RTA supervisor, Operations Manager
- **Observability:** extension liveness heartbeat, bridge health, Verint API health, GTT API health, per-job report status
- **Configuration-driven LOB map and alert thresholds:** no code change or redeployment required to onboard a new LOB or adjust a threshold
- **Single-tenant deployment:** one isolated instance per client; no data commingling between accounts

### Phase 1 — Out of Scope

The following are explicitly excluded from Phase 1 with rationale, to prevent scope creep:

| Item | Rationale | Target |
|---|---|---|
| AI model training / fine-tuning | Learning loop requires operational data volume not yet available | Phase 2 |
| ServiceNow ticket creation | API path designed; ITIL field mapping requires client-side discovery | Phase 3 |
| Microsoft Teams dispatch | Webhook path designed; Phase 1 proves the dispatch pattern with Chat first | Phase 3 |
| Verint OCR / Vision capture | Classifier training required (200–500 CIBC screenshots); REST credential is the better path | Parallel track |
| Multi-RTA coordination (GT + PH simultaneous) | Single-RTA session sufficient for Phase 1 proof; multi-RTA is a coordination problem, not a capture problem | Phase 3 |
| Cross-client benchmarking / k-anonymised analytics | Legal gate required; data governance framework not yet established | Post Phase 3 |
| WCAG 2.1 AA accessibility | Not a launch blocker; remediation sprint after core functionality stable | Phase 2 |
| Workday direct integration | VV team manages Workday credentials; Kraken employee master is the pragmatic path for Workday ID lookups | Phase 1 via Kraken |

### Phase 2 — Preview (for planning context; not scoped here)

- **AI feedback loop:** every RTA decision (approve / edit / suppress / escalate) generates a labelled training signal → backend API → weekly fine-tuning batch job
- **Copilot confidence thresholds:** system flags high-confidence alerts for potential auto-dispatch (with supervisor override); remains human-gated
- **Cross-client performance benchmarking:** opt-in, legal-gated, k-anonymised — no raw cross-client data

---

## 7. Business Requirements

Business requirements state **what the system must do** from the perspective of the business. They do not prescribe implementation.

**Conventions:**
- `[MUST]` — mandatory; system is not production-ready without this
- `[SHOULD]` — high value; include unless blocked by cost or dependency
- `[COULD]` — desirable; include if time allows
- `[WON'T]` — explicitly excluded from this phase

---

### 7.1 Verint Adherence Capture

**BR-001** `[MUST]`
The system shall capture agent adherence state from Verint without requiring any manual export, screen interaction, or human trigger.
*Evidence: Chrome extension proven end-to-end on live Verint EPIC_TISV, 12 cards, 2026-06-05.*

**BR-002** `[MUST]`
The system shall refresh adherence data on a configurable polling interval of no less than every 60 seconds during active monitoring hours.

**BR-003** `[MUST]`
The system shall continue operating in a degraded mode (displaying last-known state with a staleness indicator) if the Verint connection is temporarily unavailable, without crashing or losing prior alert data.

---

### 7.2 Alert Classification & Presentation

**BR-004** `[MUST]`
The system shall classify each Verint adherence exception and present it to the RTA analyst as a structured alert card containing: agent name, Line of Business, exception type, duration out of adherence, severity classification, AI-drafted notification message, and the evidence (scheduled activity vs actual activity) that triggered the alert.
*Evidence: CommandCard schema proven in POC; 48 violations parsed from live EPIC data.*

**BR-005** `[MUST]`
The system shall prioritise and surface the most critical alerts first, using a severity model that accounts for exception duration, exception type, and LOB SLA thresholds.
*Evidence: HIGH / MEDIUM / LOW severity tiers proven in rules core; 44 unit tests pass.*

**BR-006** `[SHOULD]`
The system shall display a real-time floor view that shows per-LOB alert density, allowing an RTA supervisor to identify operational hotspots at a glance without reading individual cards.
*Evidence: FloorView component shipped and gate-passed 2026-06-11.*

**BR-007** `[COULD]`
The system shall provide an AI advisory panel (Copilot) where an RTA can request an explanation of why an alert was raised, a recommended action, or an improved draft message — with responses grounded in the alert's evidence and delivered via streaming text.
*Evidence: FuelIX copilot proven in POC via streaming SSE.*

---

### 7.3 Human-in-the-Loop Dispatch

**BR-008** `[MUST]`
The system shall require explicit RTA analyst approval before delivering any notification to any external system (Google Chat, Microsoft Teams, ServiceNow, or any other channel).
*Governance invariant: the AI holds no write credentials. Every external write is human-initiated.*

**BR-009** `[MUST]`
The system shall allow the RTA analyst to approve, edit, suppress, or escalate each alert before dispatch. The analyst's choice and any edits made to the draft message shall be logged.

**BR-010** `[MUST]`
The system shall route approved alerts to the correct dispatch channel (Google Chat webhook, Teams, ServiceNow) based on the alert type and the LOB configuration — without the analyst needing to know the routing rules.

---

### 7.4 Attendance Reconciliation Report

**BR-011** `[MUST]`
The system shall automatically generate a GTT × Verint attendance reconciliation report on a configurable schedule, with a minimum of three trigger points per shift: shift start, midday, and shift end.

**BR-012** `[MUST]`
The system shall generate the reconciliation report without requiring any analyst to log in to GTT, download any file, run any script, or perform any manual data preparation.
*Evidence: GTT API proven server-side; 339-row dataset pulled on 2026-06-23 without human action.*

**BR-013** `[MUST]`
The reconciliation report shall identify and classify at minimum three discrepancy types:
- `clocked_in_not_in_adherence` — agent clocked in via GTT but absent from Verint adherence scan
- `in_adherence_no_clock_in` — agent present in Verint but has no GTT clock-in for the day
- `clocked_out_still_active` — agent clocked out via GTT but Verint still shows the agent as working
*Evidence: All three types implemented and schema-verified; 340-row report generated 2026-06-23.*

**BR-014** `[MUST]`
The reconciliation report shall include an intelligence summary: a set of 3–6 plain-language bullets that describe the most significant patterns in the discrepancy data (e.g., cluster of mismatches in one subgroup, high ghost-session rate, unusually high mismatch percentage).
*Evidence: report_intelligence.py generates this deterministically; no LLM required.*

**BR-015** `[SHOULD]`
The system shall allow an authorised user to configure the reconciliation report's functional area, sites, recipient list, schedule, and delivery format — without a code change or redeployment.

**BR-016** `[SHOULD]`
The system shall export the reconciliation report in at minimum two formats: JSON (machine-readable, AI-consumable) and CSV/XLSX (human-readable, audit-ready).
*Evidence: exportReportXlsx() with SheetJS proven in POC.*

---

### 7.5 Audit Trail & Governance

**BR-017** `[MUST]`
The system shall maintain an append-only, immutable audit log that records every alert generated, every RTA decision (with timestamp, actor identity, and action taken), and every dispatch outcome (channel, delivery status, message content).

**BR-018** `[MUST]`
The audit log shall be structured such that the query "retrieve all records where the actor is an AI system and the action is a write to an external system" returns zero rows — for any time window.
*This is the structural proof of the no-AI-write governance invariant.*

**BR-019** `[MUST]`
The system shall retain reconciliation report outputs for a minimum of 90 days. Raw agent capture data (pre-processing) shall not be retained after the processing job completes.

---

### 7.6 Authentication & Access Control

**BR-020** `[MUST]`
The system shall require authenticated access for all users. Authentication shall integrate with Azure Active Directory via OIDC (or the client's equivalent SSO provider for non-Azure deployments).

**BR-021** `[MUST]`
The system shall enforce role-based access control with at minimum three roles:
- **RTA Analyst** — view alerts, approve/edit/suppress/escalate dispatches, view reports
- **RTA Supervisor** — all analyst permissions + configure thresholds, view floor view, manage report schedules
- **Operations Manager** — all supervisor permissions + view cross-LOB audit log, manage users

---

### 7.7 Observability & Reliability

**BR-022** `[MUST]`
The system shall expose a health status indicator for each integration point (Verint capture source, GTT API, dispatch channel) that is visible to the RTA supervisor in the Command Center UI.

**BR-023** `[MUST]`
The system shall emit an alert (to the supervisor's channel) if the Verint capture source has been silent for longer than a configurable threshold (default: 10 minutes) during active monitoring hours.

**BR-024** `[MUST]`
The system shall display the time elapsed since the last successful Verint data sync, updated in real time, in the Command Center UI.
*Evidence: "last synced HH:MM:SS" banner proven in POC (useExtensionBridge.ts + liveBridgeActive state).*

**BR-029** `[SHOULD]`
The system shall emit its logs, metrics, and exception records through — or in a schema interoperable with — the existing "Intelligent Insights" observability spine (uniform business/system exception tagging, straight-through-processing metrics, and the business-area → VP → director → bot drill-down hierarchy), rather than standing up a parallel observability stack.
*Rationale: reuse the existing SOC 2 Type II observability/audit spine (Section 2, Build vs Extend); satisfies Andrew's observability + audit non-negotiable via an already-productionised component.*

---

### 7.8 Platform & Scalability

**BR-025** `[COULD]`
The system shall support concurrent monitoring of ≥20 accounts (Golden Cluster full stack, 3 regions) on the same Verint tenant via server-side polling, without requiring a separate browser session or manual action per account.
*Evidence: confirmed shared Verint tenant across 107 accounts; architecture supports server-side polling with org-filter parameterisation.*

**BR-026** `[COULD]`
The system shall support a pluggable time-capture adapter interface, so that accounts using Verint MyTime, Five9, RingCentral, or other time-capture tools (Silver Cluster, 85 accounts, 12,258 HC) can be onboarded into the reconciliation pipeline without modifying the reconciliation core.
*Evidence: Adapter-blind reconciler pattern designed in POC; GTTRow and AgentRow are the interface contract.*

**BR-027** `[SHOULD]`
A new client LOB configuration (thresholds, routing rules, report parameters) shall be deployable via the tenant manifest without a code change or service redeployment.

**BR-030** `[MUST]`
The capture core shall remain adapter-blind at the *WFM-source* level (not only the time-capture level of BR-026), so that an additional adherence source — specifically **NICE IEX**, the second dominant WFM vendor already served by Telus's existing platform — can be onboarded as a new capture adapter without modifying the normalisation, triage, or reconciliation core.
*Evidence: adapter-blind rules core proven in POC (AgentRow is the interface contract; AC-002). This is a Phase-1 design constraint that keeps the NICE expansion (Sections 1 and 5) a capture-adapter addition, not a rebuild — it does not put NICE capture in Phase 1 build scope.*

**BR-031** `[SHOULD]`
The tenant manifest and rollout tooling shall support staged deployment by account tier (Golden → Silver → Bronze), consistent with the existing manifest-driven, adapter-blind design (AC-002, BR-026, BR-027) — no per-tier code fork.
*Rationale: the Gold/Silver/Bronze tiering (Section 5) drives rollout sequencing; making that sequencing an explicit, manifest-driven capability (rather than an implicit assumption) is what Engineering Scoping needs to size the phased delivery plan.*

---

### 7.9 Phase 2 (explicitly excluded from Phase 1 scope)

**BR-028** `[WON'T — Phase 2]`
The system shall record every RTA decision as a labelled training signal and feed it to a model fine-tuning pipeline that improves alert classification and draft message quality over time.

---

## 8. Functional Requirements

Functional requirements describe **how the system shall behave** in specific operational contexts. Each is traceable to one or more business requirements.

---

### FR-ALERT — Alert Pipeline

**FR-ALERT-001** *(satisfies BR-001, BR-002)*
The capture service shall poll the Verint `calendar-filter` API (`POST /api/wfm/main/v2/calendar-filter`) on the configured interval. Each poll shall retrieve the full agent roster for the configured organisational scope, paginating until all agents are covered.

**FR-ALERT-002** *(satisfies BR-001)*
When the browser extension is the capture adapter, it shall intercept the Verint session's own `calendar-filter` network requests using a MAIN-world injected script, requiring no polling and no separate authentication.

**FR-ALERT-003** *(satisfies BR-004, BR-005)*
The normalisation pipeline shall convert raw Verint response data into `AgentRow[]` objects (agent_id, name, LOB, geo, status_code, duration_seconds, ooa_verdict) and apply the triage ruleset to produce `ScoredAlert[]` objects with severity (HIGH / MEDIUM / LOW), confidence (0.0–1.0), rule ID, and evidence fields.

**FR-ALERT-004** *(satisfies BR-004)*
The card builder shall assemble each `ScoredAlert` into a `CommandCard` object containing: card_id, agent_name, lob, exception_type, duration_formatted, severity, confidence, scheduled_activity, actual_activity, draft_message, evidence_provenance, capture_source, and captured_at timestamp.

**FR-ALERT-005** *(satisfies BR-003)*
The Command Center UI shall display a "Bridge Status" banner indicating: LIVE (capture active, last synced < threshold), STALE (last synced > threshold, degraded mode), or OFFLINE (capture source unreachable). The banner shall update in real time without page refresh.

---

### FR-REPORT — Attendance Reconciliation

**FR-REPORT-001** *(satisfies BR-011, BR-012)*
The report scheduler shall trigger the reconciliation job at configurable times. The default schedule shall be: 08:00, 12:00, and 16:30 in the client's configured timezone. The schedule shall be overridable per tenant via the configuration panel without a code change.

**FR-REPORT-002** *(satisfies BR-012)*
The GTT adapter shall call the GTT ATOS Report API using GCP Service Account identity token authentication. It shall accept `functional_area`, `sites`, `date`, and `timezone` as parameters and return a typed `GTTRow[]` list.

**FR-REPORT-003** *(satisfies BR-013)*
The reconciliation engine shall join GTT clock-in records to Verint adherence records using Workday ID as the primary join key (production). Surname fuzzy match (rapidfuzz `token_set_ratio ≥ 85`) shall be used as a fallback only, and all fuzzy-matched records shall be flagged with `join_method = "fuzzy"` in the report output.

**FR-REPORT-004** *(satisfies BR-014)*
The intelligence generator shall produce 3–6 plain-language bullet points from the reconciliation output, covering: overall mismatch rate, subgroup clustering, ghost-session detection, and OOA summary. This shall be deterministic (no LLM required for standard reports).

**FR-REPORT-005** *(satisfies BR-016)*
The export function shall produce a JSON file (`reconciliation_YYYY-MM-DD.json`) and a two-sheet XLSX file (`reconciliation_YYYY-MM-DD.xlsx`): Sheet 1 — discrepancy rows; Sheet 2 — intelligence summary.

**FR-REPORT-006** *(satisfies BR-013)*
The report output shall include a `_meta` block containing: `generated_at`, `functional_area`, `date`, `gtt_total`, `verint_total`, `matched`, `discrepancy_count`, `join_strategy`, and `data_freshness_seconds`.

---

### FR-DISPATCH — Dispatch & HITL Gate

**FR-DISPATCH-001** *(satisfies BR-008, BR-009)*
Every `CommandCard` shall remain in `pending_review` state until the RTA analyst takes one of four actions: `approve-send`, `edit-then-send`, `suppress`, or `escalate`. No external system call shall occur until one of these actions is taken.

**FR-DISPATCH-002** *(satisfies BR-010)*
The dispatch router shall read the LOB-to-channel map from the tenant manifest and route approved cards to the configured channel. The LOB-to-channel map shall be editable without a code change.

**FR-DISPATCH-003** *(satisfies BR-010)*
The Google Chat webhook dispatcher shall POST the approved message to the configured webhook URL. It shall include: a retry policy (3 attempts, exponential back-off), idempotency key (card_id + approval_timestamp), and delivery receipt logging.

**FR-DISPATCH-004** *(satisfies BR-017)*
Every dispatch attempt (success or failure) shall be written to the audit log with fields: `timestamp`, `card_id`, `actor_id`, `action`, `channel`, `delivery_status`, `message_hash`.

---

### FR-OBS — Observability

**FR-OBS-001** *(satisfies BR-022, BR-023)*
Each service component shall emit a structured heartbeat log entry every 60 seconds containing: `component`, `tenant_id`, `status` (healthy / degraded / offline), `last_successful_operation`, and `error_count_last_5m`.

**FR-OBS-002** *(satisfies BR-023)*
The capture monitor shall fire a supervisor alert if no successful Verint data sync has occurred within the configured silence threshold (default: 10 minutes). The alert shall include the last known sync time and the estimated staleness.

**FR-OBS-003** *(satisfies BR-022)*
The Command Center UI shall display a health strip showing per-integration status (Verint Bridge, GTT API, Dispatch Channel) with last-checked timestamp. Status values: HEALTHY (green), DEGRADED (yellow), OFFLINE (red).

**FR-OBS-004** *(satisfies BR-024)*
The UI heartbeat counter shall update every second, displaying elapsed time since last sync in `HH:MM:SS` format. It shall turn amber at >5 minutes and red at >10 minutes.

---

### FR-CONFIG — Tenant Configuration

**FR-CONFIG-001** *(satisfies BR-027)*
The tenant manifest shall be a JSON document that binds a deployment to: capture adapter type and credentials reference, dispatch channel routing table, LOB map, alert thresholds per LOB, reconciliation report schedule and recipients, cloud provider bindings (vault, store, LLM endpoint), and deployment tier (bank/permissive).

**FR-CONFIG-002** *(satisfies BR-015, BR-027)*
The configuration panel in the Command Center UI shall allow an authorised supervisor to modify: alert thresholds per LOB, reconciliation schedule, report recipient list, and functional area — and apply changes without a service restart or code deployment.

---

### FR-AUTH — Authentication & RBAC

**FR-AUTH-001** *(satisfies BR-020)*
All API endpoints and UI routes shall require a valid OIDC bearer token. Unauthenticated requests shall receive HTTP 401. Tokens shall be validated against the configured identity provider (Azure AD by default).

**FR-AUTH-002** *(satisfies BR-021)*
RBAC shall be enforced at the API layer, not the UI layer. Role claims shall be read from the OIDC token. An analyst attempting a supervisor-scoped action shall receive HTTP 403.

**FR-AUTH-003** *(satisfies BR-017)*
MFA shall be required for high-risk actions: bulk-suppress alerts, modify alert thresholds, change report recipient list, export raw audit log.

---

### FR-AUDIT — Audit Trail

**FR-AUDIT-001** *(satisfies BR-017, BR-018)*
The audit store shall be append-only. No record shall be modifiable or deletable after creation. The store shall implement hash-chaining: each record shall include the SHA-256 hash of the previous record, enabling tamper detection.

**FR-AUDIT-002** *(satisfies BR-018)*
The audit store schema shall include an `actor_type` field with values `human` or `system`. All records with `actor_type = system` and `action_type = write` shall be provably zero — this constraint shall be enforced at the application layer (the LLM subsystem holds no write credentials) and verifiable via audit query.

**FR-AUDIT-003** *(satisfies BR-019)*
Reconciliation report files shall be retained in the operational store for ≥90 days. Raw Verint capture payloads (pre-normalisation) shall be discarded immediately after normalisation completes and shall never be written to persistent storage.

---

## 9. Non-Functional Requirements

### Performance

| ID | Requirement |
|---|---|
| NFR-PERF-001 | Alert latency ≤60 seconds end-to-end: from Verint state change to card visible in RTA UI |
| NFR-PERF-002 | Reconciliation report generation ≤5 minutes for a dataset of up to 500 agents |
| NFR-PERF-003 | UI must remain responsive (Time-to-Interactive < 3s) when displaying up to 300 active alert cards |
| NFR-PERF-004 | GTT API response time ≤30 seconds for a full-day dataset of 500 agents; job must retry on timeout |

### Scalability

| ID | Requirement |
|---|---|
| NFR-SCALE-001 | Support ≥700 concurrent authenticated RTA sessions without service degradation |
| NFR-SCALE-002 | Support ≥107 Verint tenant accounts under a single server-side service deployment via parameterised polling |
| NFR-SCALE-003 | The reconciliation engine shall process a 500-agent GTT dataset and a 500-agent Verint dataset without O(n²) join behaviour — surname index + fuzzy fallback must complete in ≤30 seconds |

### Availability

| ID | Requirement |
|---|---|
| NFR-AVAIL-001 | 99.5% uptime SLA during business hours (06:00–22:00 client's primary timezone) |
| NFR-AVAIL-002 | Planned maintenance windows shall not occur during shift-start or shift-end reconciliation trigger windows |
| NFR-AVAIL-003 | A single component failure (e.g., GTT API unavailable) shall not bring down the adherence monitoring path — components are independently degradable |

### Security

| ID | Requirement |
|---|---|
| NFR-SEC-001 | All credentials (Verint session token, GTT SA key, webhook URLs, LLM API key) shall be stored in a managed secret vault — no hardcoded secrets in code or container images |
| NFR-SEC-002 | All data in transit shall be encrypted with TLS 1.2 or higher |
| NFR-SEC-003 | All data at rest shall be encrypted (AES-256 or cloud-provider equivalent) |
| NFR-SEC-004 | Agent names and employee identifiers shall not appear in plain text in LLM prompts — tokenise before any AI call, detokenise in the response handler |

### Observability

| ID | Requirement |
|---|---|
| NFR-OBS-001 | All services shall emit structured JSON logs. Every log entry shall include: `timestamp`, `tenant_id`, `trace_id`, `component`, `level`, `message` |
| NFR-OBS-002 | All services shall expose liveness (`/health/live`) and readiness (`/health/ready`) endpoints returning HTTP 200 / 503 |
| NFR-OBS-003 | The engineering team shall be able to trace a single alert from Verint capture to RTA dispatch using `trace_id` across all service logs |

### Maintainability

| ID | Requirement |
|---|---|
| NFR-MAINT-001 | A new client LOB configuration shall be deployable via tenant manifest update without a code change or service restart |
| NFR-MAINT-002 | The capture adapter shall be swappable (browser extension ↔ REST API ↔ OCR relay) via a manifest configuration field — no code change required |
| NFR-MAINT-003 | The codebase shall achieve ≥80% unit test coverage on the normalisation, triage, and reconciliation modules before production deployment |

---

## 10. Architecture Constraints

These constraints are non-negotiable. They encode governance decisions made during the POC and ratified by executive stakeholders. They shall not be overridden without Andrew Deatherage's explicit approval.

**AC-001 — No AI write path**
The LLM subsystem shall hold no write credentials for any external system. It shall not be capable of calling Google Chat, Teams, ServiceNow, Workday, or any other external channel directly. All write paths are either human-initiated (analyst clicks Approve) or deterministic non-AI code. Proof: an audit query for `actor_type=system AND action_type=write_external` returns zero rows.

**AC-002 — Adapter-blind rules core**
The normalise → triage → card_builder pipeline shall process `AgentRow[]` objects regardless of how they were captured. Per-client customisation (thresholds, LOB map, message templates) lives in the tenant manifest — not in the pipeline code. The pipeline is client-agnostic by construction.

**AC-003 — One OCI image, per-client tenant manifest**
A single container image shall be deployed per client. The tenant manifest (JSON config) binds the image to the client's cloud credentials, capture adapter, dispatch channels, LOB map, and alert thresholds. No client-specific code forks. Moving a client between clouds is a manifest change, not a code change.

**AC-004 — Cloud-neutral seams**
Five integration points shall be behind swappable interfaces, not hard-wired to any specific cloud provider:
1. **Secrets vault** (Azure Key Vault / GCP Secret Manager / AWS Secrets Manager)
2. **Operational + audit store** (Cosmos DB / Firestore / DynamoDB / Postgres)
3. **Intelligence store** (per-tenant analytics warehouse — BigQuery / Synapse / Redshift)
4. **LLM endpoint** (FuelIX / Azure OpenAI / Vertex AI / Bedrock — always backend-proxied)
5. **Runtime + gateway** (Azure Container Apps / Cloud Run / ECS / AKS)

*The seams stay swappable, but the concrete first target is now decided — see AC-007.*

**AC-005 — CIBC deployment topology: in-client-cloud**
Bank-tier clients (CIBC and equivalent) shall receive a dedicated stack deployed into their own cloud/VPC. The vendor-hosted (Telus-hosted) topology is for permissive clients (Epic, Google, FitBit) only. The same container image supports both topologies; topology is a manifest property.

**AC-006 — Computer-use / OCR excluded from Phase 1**
Verint screen capture via computer vision or OCR is excluded from Phase 1 production scope. It requires training a classifier on 200–500 CIBC screenshots and is not production-ready. It remains available as a fallback (Track A) only if the Verint REST credential request (Track B) is not fulfilled by CIBC. Track B is the preferred and designed path.

**AC-007 — Hosting target: Telus Digital GCP project**
The concrete first-target runtime is a dedicated **Telus Digital GCP project** (provisioned 2026-07-06), replacing the generic "GCE e2-small / Cloud Run" sketch in earlier design notes. Named services, all deployed via **Terraform / Infrastructure-as-Code**: **Cloud Run** (services), **Pub/Sub** (messaging), **Cloud Scheduler + Cloud Tasks** (scheduling/queueing), **Secret Manager** (credentials), **Cloud Storage** (report/artefact store), **Cloud SQL** (relational/state) and **Firestore** (immutable audit). Constraints established during provisioning: (a) the legacy **Telus International GCP is being decommissioned** — all workloads migrate to Telus Digital under the Cloud COE with tighter security review; (b) GCP identity must resolve to **telusinternational.com** (an alias of telus.com); **telusdigital.com is not a valid GCP identity**; (c) **WFM-network connectivity is the gating unknown** — compute without connectivity to the WFM network is unusable (see AD-009, R-11). This constraint does not override AC-004; the cloud-neutral seams remain, but GCP/Telus Digital is the committed first deployment.

**Reference diagrams:** `docs/diagrams/output/command-center-integration-topology.png` (component/integration view — shows reuse of the existing platform's orchestrator and Intelligent Insights spine, plus the NICE expansion seam) and `docs/diagrams/output/command-center-infrastructure.png` (infrastructure view — Telus Digital GCP project, named services, WFM-network connectivity as the gating unknown, and cost anchors). Sources: `docs/diagrams/sources/*.mmd`.

---

## 11. Data Requirements

**DR-001 — Verint adherence (primary capture)**
The Verint `calendar-filter` API response is the canonical source for agent adherence state. Proven schema: `resourceData[].adherence.violations[]` (planned activity, actual activity, duration) and `resourceData[].actualSchedule.events[]`. The `workResourceDetails.name` object provides first/last name. Authentication: `impact360authtoken` header + session cookie.

**DR-002 — GTT attendance (primary time-capture source for Tier-1)**
The GTT ATOS Report API returns an array-of-arrays with 22 columns per row. Confirmed column map:
- Column 0: SITE
- Column 1: EMAIL
- Column 2: WORKDAY_ID (8-digit)
- Column 3: EMPLOYEE (full name)
- Column 6: SUBGROUP (LOB)
- Column 7: STATUS (event type: `clock_in`, `clock_out`, `break-1`, `productivity`, `team-meeting`, etc.)
- Column 8/9: DATE_ET / TIME_ET

Proven live: 339 rows (FA_Epic Games) and 78–84 rows (FA_CIBC) on confirmed dates.

**DR-003 — Employee identity join key**
The join key between Verint agent records and GTT attendance records shall be **Workday ID** in production. Workday ID is available in the GTT response (column 2) and in the Kraken employee master (93-field Firebase dataset, managed by the VV team). Surname fuzzy match (POC method) is acceptable only in the absence of Workday ID and shall be clearly flagged in output.

**DR-004 — Data retention**
Reconciliation report JSON and CSV outputs shall be retained for ≥90 days in the operational store. Raw Verint capture payloads shall not be written to persistent storage. Raw GTT API responses shall not be retained after processing.

**DR-005 — Audit log schema**
Every audit log entry shall contain at minimum:

```json
{
  "timestamp": "ISO-8601",
  "tenant_id": "string",
  "trace_id": "UUID",
  "actor_id": "string",
  "actor_type": "human | system",
  "actor_role": "analyst | supervisor | om | system",
  "action": "string",
  "card_id": "string | null",
  "outcome": "success | failure | suppressed",
  "channel": "google_chat | teams | servicenow | audit_only | null",
  "prev_record_hash": "SHA-256"
}
```

---

## 12. Integration Catalogue

| System | Phase | Direction | Auth method | Current status |
|---|---|---|---|---|
| **Verint WFM API** (`/api/wfm/main/v2/calendar-filter`) | 1 | Inbound read | `impact360authtoken` header + session cookie | ✅ Proven (Scenario 2 extension); ⛔ Blocked (Scenario 1 REST — credential pending) |
| **GTT ATOS Report API** | 1 | Inbound read | GCP SA identity token (audience = endpoint URL) | ✅ Proven live (339 EPIC rows, 2026-06-23) |
| **Google Chat webhook** | 1 | Outbound write (HITL-gated) | Webhook URL per LOB (secret vault) | 🔶 Designed, not built |
| **Azure AD / SSO** | 1 | Auth | OIDC authorization-code flow | 🔶 Not built |
| **Kraken employee master** | 1 | Inbound read (Workday ID only) | TBD (VV team credentials) | 🔶 Designed, not wired |
| **FuelIX LLM endpoint** | 1 | Outbound advisory | API key (backend proxy — current client-side key must be rotated) | ✅ Proven (⚠️ key compromised — rotate before production) |
| **Intelligent Insights** (existing observability/reporting spine) | 1 | Outbound write (logs/metrics) + inbound read (reports) | Telus ID login; self-serve data dumps + scheduled reports (no API gateway today) | 🔶 Existing platform — access request pending (AD-008) |
| **Google Chat / Google Sheets webhooks** (existing) | 1 | Outbound write (HITL-gated) | Existing webhooks — "just need a login account" | 🔶 Existing on the platform; reuse for dispatch |
| **NICE IEX** (second WFM capture source) | Expansion | Inbound read | TBD (existing platform reads it today) | 🔷 Adapter-blind seam (BR-030); not Phase 1 build |
| **ServiceNow REST API** (`/api/now/table/incident`) | 2 | Outbound write (HITL-gated) | API key | 🔷 Designed for Phase 2 |
| **Microsoft Teams webhook** | 2 | Outbound write (HITL-gated) | Bot Framework / Incoming Webhook | 🔷 Designed for Phase 2 |

---

## 13. Security & Compliance

### Data Classification
The RTA Command Center processes **employee adherence and attendance PII** — names, work schedules, clock-in records, and disciplinary-adjacent notifications. This data is:
- **Not** cardholder data → PCI DSS does not strictly apply
- **Is** employee PII subject to applicable labour and privacy law (PIPEDA for Canada, GDPR for EU operations, etc.)
- Build target: **SOC 2 Type II baseline controls**; claim "PCI-aligned controls" where CIBC requires it, not "PCI compliant"

### Key Controls

| Control | Requirement |
|---|---|
| **No AI write path** | LLM code holds no write credentials; structural proof via audit query (see AC-001, FR-AUDIT-002) |
| **PII in LLM prompts** | Agent names and employee IDs shall be tokenised before any LLM API call; detokenised after response |
| **Secrets management** | All credentials in managed vault; no hardcoded secrets; no `.env` files in production images |
| **Tenant isolation** | Per-tenant isolated data store; no cross-client data commingling at the application or storage layer |
| **Verint credential scope** | Read-only service account; GET-only on adherence/schedule endpoints; no schedule modification capability |
| **Audit trail integrity** | WORM append-only log; hash-chaining for tamper detection; ≥90-day retention |
| **Data minimisation** | Raw capture payloads discarded after normalisation; only processed, structured data persisted |
| **LLM key rotation** | FuelIX key exposed in POC session chat — rotate immediately; move to backend proxy before any production traffic |

---

## 14. Assumptions & Dependencies

| ID | Assumption / Dependency | Owner | Impact if not met |
|---|---|---|---|
| **AD-001** | CIBC grants a read-only Verint REST service account credential scoped to GET-only adherence and schedule endpoints | CIBC IT / Telus relationship | Without it, CIBC capture requires OCR classifier training (weeks); delays CIBC onboarding |
| **AD-002** | VV team grants a service account read access to the Kraken employee master for Workday ID lookups | VV team | Without it, reconciliation falls back to surname fuzzy match (false positives; lower report quality) |
| **AD-003** | Telus GCP SA `td-sa-wfm-gtt-reports02` retains `run.invoker` permission on the GTT endpoint | Maximiliano / GCP team | GTT adapter stops working immediately if revoked |
| **AD-004** | FuelIX (TELUS OpenAI-compatible LLM gateway) remains available and the API key is rotated before production | Telus / FuelIX team | Copilot advisory feature unavailable; current key is compromised |
| **AD-005** | Engineering team has access to a non-production Verint tenant for integration testing | Mike Nearing / Telus | Integration tests against production Verint — not acceptable |
| **AD-006** | Automation Anywhere credential issues (documented: credentials revoked for Herman and Amy) are resolved by Andrew's escalation | Andrew / AA partner | Any AA-based orchestration or RPA dispatch path unavailable until resolved |
| **AD-007** | Workday is the source of truth for employee identity; Workday IDs are stable and unique across Verint and GTT datasets | Workday / VV team | Join quality degrades; report accuracy cannot be guaranteed |
| **AD-008** | Intelligent Insights access is granted (Anshul) and the FDI/config session confirms cost, licensing, and bot-sizing before the extend path (Section 2) is committed | Anshul Gaddoo / FDI team | Extend-vs-build economics remain unverified; may force a costlier standalone build |
| **AD-009** | The new Telus Digital GCP project has network connectivity to the WFM network | Marcelo Save / Telus network team | Hosted compute is unusable ("a server with no connectivity"); pilot stranded (see R-11) |
| **AD-010** | Silver Cluster's dollar figures depend on a future Silver-specific real per-geo hourly-rate workup (currently uses Golden Cluster's blended rate as a placeholder) | Mateus / data team | Silver's $ figures remain directional, not board-grade, until Silver gets its own rate verification |

---

## 15. Risks & Mitigations

| ID | Risk | Probability | Impact | Mitigation |
|---|---|---|---|---|
| **R-01** | CIBC does not grant Verint REST read credential | Medium | High — blocks server-side CIBC adherence capture | OCR Track A as fallback (requires 200–500 labeled screenshots + training sprint); credential ask letter already drafted (see CIBC Verint Credential Ask document) |
| **R-02** | Verint changes the `calendar-filter` API schema | Low | High — breaks the entire capture pipeline | Versioned API contract pinned in code; golden-fixture conformance test runs on every CI build; schema changes caught before deployment |
| **R-03** | Automation Anywhere credential instability continues | Medium | Medium — blocks AA-based RPA dispatch path | Document incidents for Andrew's escalation; design GCP-native dispatch (Cloud Tasks + Cloud Run) as AA-independent fallback |
| **R-04** | Surname fuzzy match produces false-positive joins in reconciliation | High | Medium — report accuracy; compliance risk | Workday ID join is the production fix; treat as P1 in Sprint 1; clearly flag all fuzzy-matched rows in report output until fixed |
| **R-05** | FuelIX API key remains exposed | High | High — credential compromise; potential PII exposure via LLM | **Rotate immediately**; move to backend proxy before any production use; do not merge to main with client-side key in code |
| **R-06** | Verint presents native agentic capability at demo; stakeholders question build-vs-buy | Medium | Medium — stakeholder alignment, programme justification | Technical brief prepared pre-demo; Mateus and Andrew attend; this BRD's Section 5 (account analysis) and Section 2 (why not Verint native) are the counter-arguments |
| **R-07** | GCP SA key for GTT is not rotated; expires or is revoked | Medium | High — GTT adapter stops | Key rotation procedure documented; alert on GTT 401/403 responses; backup SA provisioned |
| **R-08** | Kraken employee master access not granted; Workday ID unavailable | Medium | Medium — report falls back to surname match | Scope a direct Workday API path as alternative (note: only 2 Workday credentials at VV team; may need new service account) |
| **R-09** | The **Attendance Reporting slice** of this business case overlaps a separate, sister initiative ("Attendance Report as a Service"). Investigation (2026-07-07) found this sister initiative's actual footprint is far larger than previously stated — ~219 accounts (`WFM_Attendance_Report_Repository.xlsx`), not just the 4 Golden Cluster accounts (MasterCard, Riot Games, Tiktok, WestJet - Airlines) originally flagged. **Scope of the risk is narrower than it sounds, though:** the overlap is confined to attendance-reconciliation savings only — real-time adherence monitoring/alerting and Floor View (the majority of the Command Center's value and differentiation) are untouched by the sister initiative, which does attendance reporting exclusively | Medium | Medium — double-counted *attendance-reporting* savings claim if both business cases reach the same C-level audience without a scope boundary; does not threaten the adherence-monitoring/Floor View portion of the business case | Resolve which initiative is authoritative for Attendance Reporting automation per intersecting account before this BRD's business case and the sister initiative's are presented together; tracked as an open item in `Golden_Cluster_Impact_Model.xlsx`'s Decision Log and Data Gaps tab |
| **R-10** | Duplication: capabilities that already exist in Telus's WFM automation platform (observability, orchestration, dispatch, hosting) are rebuilt from scratch because build-vs-extend is not ratified | Medium | High — wasted engineering spend; duplicated run-cost; slower delivery | Section 2 "Build vs Extend" recommendation + BO-07 + the FDI/config session (AD-008); get the extend path explicitly ratified by Andrew / Mike Nearing before net-new build of any spine capability |
| **R-11** | Telus International GCP decommissioning + unknown WFM-network connectivity strand the pilot (compute provisioned but unreachable) | Medium | High — pilot cannot run against real WFM data | Marcelo Save's migration plan; connectivity thread with Juan Monada / network team; treat connectivity confirmation as a gate before pilot start (AD-009, AC-007) |
| **R-12** | Extend-path economics are opaque — AA licensing + shared-services pricing not fully transparent; bot-sizing is a rough Excel today | Medium | Medium — cost surprises could undercut the business case | FDI/config session to confirm cost/licensing/bot-sizing (AD-008); do not commit the extend path's run-cost claims until confirmed |
| **R-13** | PCI status is unconfirmed for every Bronze Cluster and Bronze-candidate account — no PCI-DSS flag or compliance-scope column exists in any of the four authoritative source files checked (confirmed via full-text search, 2026-07-08) | Medium | High — if a Bronze account is committed to a delivery timeline before PCI status is known, undiscovered compliance scope could force a costly rework | Legal/compliance or account-team confirmation required before any Bronze account is scoped into a delivery commitment; do not infer PCI status from account name or industry |

---

## 16. Success Criteria

The following criteria define "production-ready" for Phase 1. All criteria must be met before the system is promoted to production.

| ID | Criterion | Measurement method |
|---|---|---|
| **SC-01** | Attendance reconciliation report generated automatically 3× per shift without human action | Automated smoke test on staging; report files present in store within 5 min of each trigger |
| **SC-02** | Adherence alert delivered to RTA UI within 60 seconds of Verint state change | Latency measured from Verint `calendar-filter` response timestamp to card `created_at` in the UI; p95 ≤ 60s |
| **SC-03** | Audit trail contains zero AI-initiated external writes | Automated audit query: `SELECT * FROM audit_log WHERE actor_type='system' AND action_type='write_external'` → 0 rows; run on every CI build |
| **SC-04** | Extension / bridge liveness alert fires if silent > 10 minutes | Manual test: disconnect extension; verify supervisor receives alert within 11 minutes |
| **SC-05** | ≥85% employee match rate on GTT × Verint reconciliation (post Workday ID join implementation) | Measured on staging dataset with matched Verint + GTT data from the same shift |
| **SC-06** | A supervisor with no Python knowledge can modify an alert threshold and report schedule in ≤10 minutes | User acceptance test with a non-technical tester using the configuration panel |
| **SC-07** | All NFR-MAINT-003 test coverage targets met | `pytest --cov` output ≥80% on normalisation, triage, and reconciliation modules |
| **SC-08** | Zero hardcoded secrets in the production container image | Automated secret scan (`truffleHog` or equivalent) in CI pipeline; build fails on detection |

---

## 17. Glossary

| Term | Definition |
|---|---|
| **RTA** | Real-Time Adherence. The discipline of monitoring whether call centre agents are following their scheduled activities in real time. Also used to refer to the analyst role responsible for this monitoring. |
| **WFM** | Workforce Management. The broader function that includes scheduling, forecasting, capacity planning, and real-time adherence. |
| **OOA** | Out of Adherence. The state in which an agent is performing an activity different from what their schedule specifies. |
| **COAC** | Coaching Out of Adherence Count. A WFM metric measuring the duration an agent has spent out of adherence before being coached. Threshold: typically 30 minutes. |
| **LOB** | Line of Business. An organisational unit within a call centre account, typically corresponding to a specific client product or service queue (e.g., EPIC_Player_Support, CIBC_Cards). |
| **GTT** | Global Time Tracker. Telus International's internal time-capture and attendance management system. Agents clock in and out via GTT. The GTT ATOS Report API provides server-side access to these records. |
| **Verint** | Verint Systems WFM platform. The workforce management tool used by RTAs to view agent schedules, adherence states, and violations. Hosted at `wfo.a87.verintcloudservices.com` for Telus clients. |
| **Adherence** | The degree to which an agent's actual activity matches their scheduled activity. Expressed as a percentage (e.g., 85% adherence = agent was in the right activity 85% of the time). |
| **Reconciliation** | The process of cross-referencing GTT attendance records against Verint adherence data to identify discrepancies (agents present in one system but not the other). |
| **HITL** | Human-in-the-Loop. An architecture pattern where a human must explicitly approve any action before it is executed. In this system: no alert is dispatched to an external channel without an RTA analyst clicking Approve. |
| **Tenant Manifest** | A JSON configuration document that binds a single deployment of the RTA Command Center to a specific client. Contains: capture adapter type, credential references, dispatch channel routing, LOB map, alert thresholds, report schedule, and cloud provider bindings. |
| **FuelIX** | Telus International's OpenAI-compatible LLM gateway. Proxies requests to Claude, GPT-4, and other models. Used for the Copilot advisory panel. |
| **FDAE** | Telus's internal name for the WFM automation initiative. The FDAE configuration console is the long-term vision for a self-service control plane allowing non-technical operators to configure the platform. |
| **BPO** | Business Process Outsourcing. Telus International is a BPO company — it provides customer experience services to clients (Epic Games, CIBC, TikTok, etc.) on their behalf. |
| **Kraken** | Telus International's internal employee master data system. Maintains 93 fields per employee including Workday ID, updated in real time from Workday via Firebase. |
| **MoSCoW** | Prioritisation framework: Must Have, Should Have, Could Have, Won't Have (this time). Used to classify requirements by priority. |
| **WORM** | Write Once, Read Many. A storage constraint that prevents records from being modified or deleted after initial write. Used for the audit trail to ensure tamper-evidence. |
| **Golden Cluster** *(formerly "Tier-1 accounts")* | Accounts with the Verint + GTT (Global Time Tracker) + Workday ID technology stack, all internally hosted, TI-owned, across 3 regions — Americas / Europe / APAC (20 identified as of v1.6 — was 18 Americas+APAC-only in v1.2, before the region scoping was reversed; 29 in v1.1; 35 in v1.0). The immediate Phase 1 production target. No new integrations required. |
| **Silver Cluster** *(formerly "Tier-2 accounts")* | Accounts with at least 2 of {Verint, GTT, Workday} present, not Citrix/VDI-locked, not PCI-flagged — ownership not required (85 identified as of v1.6, 12,258 HC; corrected from 86/13,097 after CIBC moved to Bronze). Reachable with one time-capture adapter per tool variant. |
| **Bronze Cluster** | Accounts with a genuinely different WFM/CCaaS stack and/or confirmed Citrix/VDI-locked access and/or confirmed PCI scope — any one condition is sufficient. A confirmed seed list of 7 account families (CIBC, Bank of Montreal, MasterCard, MoneyGram, CoreLogic, T-Mobile, United Healthcare), not an exhaustive count. Access-gated: needs negotiation or confirmation before it can be sized like Golden/Silver. See Section 5 and R-13. |

---

*End of document — BRD v1.7*

*Prepared by Mateus Teixeira · Engineering Architecture Lead · 2026-06-23 (last revised 2026-08-03)*
*For questions or amendments, contact: mateus.teixeira@poatek.com*
