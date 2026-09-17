*Audience: architects, engineering leadership, program sponsors · Purpose: the five non-negotiable architecture principles that govern every design decision in the WFM Automation Platform — read this before any other volume.*

---

# Volume 0 · Architecture Principles

> Traces to principle(s): **P1–P5** (see [package README](../README.md#architecture-principles--brd-constraint-map)).
> Source of truth: [BRD §10 Architecture Constraints, AC-001–AC-007](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints), plus [§7.3 Human-in-the-Loop Dispatch](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#73-human-in-the-loop-dispatch). This chapter elevates, it does not restate.

## Summary

Five constraints, ratified by executive stakeholders during the POC, are non-negotiable and cannot be overridden without Andrew Deatherage's explicit approval. They are not implementation details — they are the platform's governance contract: an AI system that recommends but never acts, a rules core that never forks per client, and a deployment model that scales to any cloud without a rewrite. Every diagram, sequence, and design decision in this package traces to one of these five.

## P1 — No AI Write Path

**Statement.** The LLM subsystem holds no write credentials to any external system. It cannot call Google Chat, Microsoft Teams, ServiceNow, Workday, or any other channel directly. Every external write is either human-initiated (an analyst clicks Approve) or deterministic non-AI code.

**Why it matters.** This is the single control that lets a bank-tier client accept an AI-adjacent system into its operational path. It bounds blast radius by construction rather than by policy: there is no code path, however misconfigured, through which the model can act on the world unsupervised. For engineering leadership, it also simplifies the security review surface — the LLM is a read-and-recommend component, full stop, and that claim is independently verifiable rather than asserted.

**Audit-query proof.** The invariant is not a design intention; it is a structural, queryable fact of the audit log. Per BR-018:

> The audit log shall be structured such that the query "retrieve all records where the actor is an AI system and the action is a write to an external system" returns zero rows — for any time window.

Concretely: `SELECT * FROM audit_log WHERE actor_type = 'system' AND action_type = 'write_external'` must return an empty set, for any time window, indefinitely. If this query ever returns a row, the invariant has been violated and the incident is a P1 governance breach, not a bug ticket.

**BRD source of truth.** AC-001 (+ BR-018).

## P2 — Adapter-Blind Rules Core

**Statement.** The `normalise → triage → card_builder` pipeline processes `AgentRow[]` objects regardless of how they were captured — REST, browser extension, Citrix relay, or (future) OCR. Per-client customisation — thresholds, LOB maps, message templates — lives entirely in the tenant manifest, never in pipeline code.

**Why it matters.** This is what makes the platform a platform rather than a bespoke integration per client. It decouples the cost of onboarding a new capture source or a new client from the cost of maintaining correctness in the rules engine. Engineering leadership can staff and scale these independently: one small team owns adapters and onboarding, a separate team owns the rules core, and neither blocks the other. It is also the mechanism by which a second WFM vendor (NICE IEX, already read by the existing Telus platform) becomes a capture-adapter addition rather than a rebuild.

**BRD source of truth.** AC-002 (+ BR-026, BR-030).

## P3 — One OCI Image, Many Tenant Manifests

**Statement.** A single container image is deployed per client. A JSON tenant manifest binds that image to the client's cloud credentials, capture adapter, dispatch channels, LOB map, and alert thresholds. There are no client-specific code forks; moving a client between clouds or tiers is a manifest change, not a code change.

**Why it matters.** This is the constraint that makes fleet-wide maintenance tractable at scale — one CVE patch, one release, one test suite, applied uniformly across every tenant. It also removes the temptation (and the risk) of a client-specific branch quietly drifting from the audited baseline. For a security or compliance reviewer, "which code is running for a bank-tier client" always has one answer: the same image everyone else runs, configured differently.

**BRD source of truth.** AC-003 (+ BR-027, FR-CONFIG-001).

## P4 — Cloud-Neutral Seams, GCP-First

**Statement.** Five integration points — secrets vault, operational/audit store, intelligence store, LLM endpoint, and runtime/gateway — sit behind swappable interfaces, never hard-wired to one cloud provider. The committed first deployment target is the Telus Digital GCP project, provisioned via Terraform, but the seams themselves remain provider-agnostic.

**Why it matters.** Bank-tier clients require in-client-cloud deployment topologies (AC-005); permissive clients are vendor-hosted. Hard-wiring to one cloud would mean re-architecting for every topology change, which is untenable at fleet scale. Committing to a concrete first target — rather than staying abstractly "multi-cloud" forever — is equally deliberate: it forces the seams to be proven against a real environment instead of remaining theoretical, while leaving the abstraction intact for the next client's cloud.

**BRD source of truth.** AC-004 + AC-007.

## P5 — Human-in-the-Loop Before Any External Write

**Statement.** Every generated `CommandCard` remains in `pending_review` state until a human analyst acts on it — approve, edit, suppress, or escalate. No notification reaches an external channel (Google Chat, Teams, ServiceNow) without that explicit human action, and the analyst's decision and any edits are logged.

**Why it matters.** This is the operational complement to P1: P1 is the structural guarantee that AI *cannot* write; P5 is the workflow guarantee that a *human always does*, deliberately, with the action attributed and auditable. Together they mean the system can recommend aggressively without the organization ever ceding accountability for what actually happened on the floor. It is also what makes the platform legible to a supervisor: nothing surprises them, because nothing reaches an agent or a ticketing system without someone in the room having chosen to send it.

**BRD source of truth.** FR-DISPATCH-001 (+ §7.3, BR-008, BR-009, BR-010).

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-00 | Platform Poster — synthesizes all five principles into the cover diagram |
| D-13 | Trust Boundaries — where P1's write-path exclusion is enforced structurally |
| D-08 | Tenant Configuration / Manifest — the mechanism behind P2 and P3 |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Architecture Constraints (AC-001–AC-007) | [BRD §10](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints) | references (this chapter elevates, never restates) |
| Human-in-the-Loop Dispatch (BR-008–BR-010) | [BRD §7.3](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#73-human-in-the-loop-dispatch) | references |
| Audit Trail & Governance (BR-017–BR-019) | [BRD §7.5](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#75-audit-trail--governance) | references (P1 audit-query proof) |
| Tenant Configuration (FR-CONFIG-001/002) | [BRD §8](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#8-functional-requirements) | references (P3 mechanism) |
| Package index & P#→AC map | [`../README.md`](../README.md#architecture-principles--brd-constraint-map) | extends (this chapter is that map's expanded form) |

<!-- Status: 🟢 drafted/reviewed -->
