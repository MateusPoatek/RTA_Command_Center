*Audience: product + engineering leads. Purpose: define what to build, feature by feature, with front/back/cloud/security/governance and the multi-tenant-for-scale approach.*

> **🟠 STATUS: OUTLINE.** This is the section structure with per-section intent. Content to be filled next pass; acceptance criteria should be finalized after the API contract is frozen ([API_SPECIFICATION.md](./API_SPECIFICATION.md)) so feature specs reference real schemas. Does not restate the problem/value docs — it references them.

---

# Product Requirements Document

## 1. Problem & value
*Why this exists. References — do not restate — [../PAIN_POINTS.md](../PAIN_POINTS.md) (manual 15-min cycles, ~137 min/shift manual work) and [../SOLUTION.md](../SOLUTION.md) (the card system). The recoverable-time and cost model lives in the internal board materials (not included in this repo).*

**Business case (2026-06-08 WFM Transformation Sync):** **369 Real-Time Analysts globally ≈ $6.6M/yr** (vs ~$4.4M for the other WFM roles combined) — automating the RTA role is the highest-impact target. The RTA workflow is **~70% read-only / ~30% write**, so the roadmap automates the **read-only 70% first** (capture → detect → draft), deferring write-back (RPA/API) to a later phase.

## 2. Personas & roles
*RTA, senior RTA, supervisor, Operations Manager, FDAE admin, platform operator. These drive the RBAC model in [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md). Source: [../../command-center/src/domain/types.ts](../../command-center/src/domain/types.ts) `RTAProfile` + the escalation levels in `scenario_types.ts`.*

## 3. Product principles
*HITL-always; no direct AI writes (governance invariant); data honesty (the `DataClass` labels: evidence-backed / seeded / simulated / future-integration); one image, per-client config (D1/D2).*

**Reposition the RTA, don't replace them (6-08 alignment).** The product elevates Real-Time Analysts into **WFM experts** who use data to correct operational course — it removes the manual typing and tool-switching toil, not the people. The assisted mode + learning loop captures every RTA accept/edit/suppress/escalate decision as training signal, so the AI improves while the analyst moves up-value.

## 4. Feature catalog (by ABD workflow)
*The 6 ABD workflows as feature groups, each mapped to its `ProcessId` / `Lane` / `CardType` (from types.ts). Per feature: user story, acceptance criteria, the card lifecycle it drives.*

| # | Feature group | ProcessId | Primary Lane | Cadence |
|---|---|---|---|---|
| 1 | Shift start & morning reconciliation | `handoff` (start) | `shift-handoff` | shift start |
| 2 | Real-time adherence monitoring & alerting | `adherence` | `real-time-adherence` | every 15 min (highest volume) |
| 3 | Coaching & huddle approval (SL gate) | `coaching` | `coaching-huddles` | on request |
| 4 | Outage detection & response | `adherence` | `real-time-adherence` (outage-playbook) | event-driven |
| 5 | ServiceNow ticket processing | `tickets` | `tickets-exceptions` | on new ticket |
| 6 | Attendance reporting & shift end | `reports` / `handoff` | `attendance-reporting` / `shift-handoff` | every 3 h + close |

## 5. Cross-cutting features
*Copilot (explain / recommend / improve-draft — advise & draft only); the learning loop (`LearningSignal` per RTA decision); the audit trail; gated autonomous mode (demo-only today).*

## 6. Front-end requirements
*Command Center UX; role-conditioned views; the card detail + copilot + dispatch feed + learning strip; accessibility target (WCAG 2.1 AA — a known SCOPE gap).*

## 7. Back-end requirements
*The capture→core→dispatch pipeline as services; the rules engine; the push transport; persistence; the parser-unification requirement (one source of truth for the card-building logic).*

## 8. Cloud requirements
*Cloud-neutral seams (D2); per-tier topology (D1). Detail in [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) + [DEPLOYMENT_AND_OPERATIONS.md](./DEPLOYMENT_AND_OPERATIONS.md).*

## 9. Security & governance requirements
*Pointer section — single source of truth is [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) and [DATA_GOVERNANCE_AND_MULTITENANCY.md](./DATA_GOVERNANCE_AND_MULTITENANCY.md). Names the must-haves: SSO+MFA, RBAC, no-AI-write proof, PII tokenization, audit immutability.*

## 10. Multi-tenant approach for scale
*The tenant manifest as the unit of scale; tier-driven topology; per-tenant isolation (D3). Detail in [FDAE_CONFIGURATION_LAYER.md](./FDAE_CONFIGURATION_LAYER.md) + [DATA_GOVERNANCE_AND_MULTITENANCY.md](./DATA_GOVERNANCE_AND_MULTITENANCY.md).*

## 11. Non-functional requirements
*Capture freshness/latency (informed by the interaction-driven refresh finding in [../OBSERVABILITY_DRY_RUN.md](../OBSERVABILITY_DRY_RUN.md)); availability; per-tenant capacity; the 60s poll budget.*

## 12. Out of scope / phasing
*Cross-client benchmarking is design-only (D3); attrition risk and other [../FUTURE_FEATURES.md](../FUTURE_FEATURES.md) items are later phases.*

## 13. Open questions & dependencies
*The read-only Verint REST credential (the bank-tier-client unlock); the OCR classifier training set (200–500 labeled screens); the LLM endpoint decision per client.*
