*Audience: program and ops leadership · Purpose: how is the program run and observed — and how do we know, in production, that the human-in-the-loop and no-AI-write guarantees actually hold?*

---

# Volume 6 · Program Control Tower

> Traces to principle(s): **P1** (no AI write path), **P5** (human-in-the-loop before any external write) (see [package README](../README.md#architecture-principles--brd-constraint-map)).
> Source of truth: [BRD §7.3 Human-in-the-Loop Dispatch](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#73-human-in-the-loop-dispatch), [§7.5 Audit Trail & Governance](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#75-audit-trail--governance), [§7.6 Authentication & Access Control](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#76-authentication--access-control), [§10 Architecture Constraints](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints). This chapter elevates, it does not restate.

## Summary

The platform's admission ticket to a bank-tier client rests on one operational claim, not a marketing one: an AI system drafts, a human decides, and every decision is provably recorded. This chapter is the leadership view of how that claim is *run* day to day — the roles that keep humans in the loop at scale (P5), and the audit posture that makes the no-AI-write guarantee (P1) a standing, queryable fact in production rather than a design intention. It draws on the observability model detailed in Volume 4 (**D-17**) and the trust boundaries detailed in Volume 3 (**D-13**).

## Governance model

Governance here is deliberately narrow: it covers who is accountable for the platform staying inside its non-negotiable constraints (BRD §10, AC-001–AC-007), not general program management.

| Role | Accountable for |
|------|-----------------|
| **RTA Analyst** | Every individual HITL decision — approve, edit, suppress, or escalate each `CommandCard` before it reaches an external channel (BR-008, BR-009) |
| **RTA Supervisor** | Threshold configuration, floor-level exception handling, report schedules — the operational layer above individual cards |
| **Operations Manager** | Cross-LOB audit visibility, user/role management — the layer that can run the P1 audit-query proof and answer for it |
| **Executive sponsor (Andrew Deatherage)** | Sole approver of any change to the AC-001–AC-007 constraints (BRD §10: "shall not be overridden without Andrew Deatherage's explicit approval") |

Role boundaries are enforced technically, not just organizationally — RBAC is checked at the API Gateway trust boundary (**D-13**, Boundary Crossing 1) before any request reaches the rules core, per BR-020/BR-021.

## HITL operations at scale (P5)

P5 is not a UI convenience — it is the mechanism that makes every external write attributable to a named human. The operational shape:

- Every alert reaches the analyst as a `CommandCard` in state `pending_review` (BRD §7.3, BR-008). No card self-dispatches.
- The analyst's available actions — approve, edit, suppress, escalate — and any edits to the drafted message are captured at decision time, not reconstructed after the fact (BR-009).
- Rows that fail to normalize cleanly are routed to an **exception card** (confidence `0.0`, `targetChannels: audit-only`) that forces HITL review rather than silently dropping or auto-dispatching (see **D-17**, resilience view) — the fallback path stays human-gated even under capture degradation.
- Dispatch itself (**D-13**, Boundary Crossing 4) is deterministic RPA/API code triggered only after approval — "never AI-initiated" is enforced at the code path, not by convention.

What makes this scale past a single analyst: the floor view (Volume 4) surfaces alert density so a supervisor can direct attention across LOBs without reading every card, and the same `pending_review` gate applies uniformly regardless of account tier (Gold/Silver/Bronze) or capture adapter — HITL is a property of the rules core (P2), not a per-client customization.

## Audit posture: the P1 proof

The audit trail exists to answer one governance question on demand, at any point in the program's life: *has the AI ever written to an external system on its own?* BRD §7.5 makes this a structural requirement, not a report to be compiled:

> "The audit log shall be structured such that the query `retrieve all records where the actor is an AI system and the action is a write to an external system` returns zero rows — for any time window." (BR-018)

This is operationalized as a standing query against the audit store, not a one-time audit exercise:

```
actor_type = 'ai' AND action_type = 'write_external'  →  expected: ZERO ROWS, always
```

(**D-17** shows this as the `p1` proof node, run continuously against the audit store.)

Supporting properties that make the proof trustworthy rather than merely present:

| Property | Mechanism | Source |
|----------|-----------|--------|
| Append-only, tamper-evident | Hash-chained, WORM audit store (Firestore, per AC-007) | BR-017, **D-17** |
| Complete actor coverage | Every `CommandCard` action logs actor identity (human or AI), timestamp, and action taken — including AI drafting activity, so the "zero AI writes" claim is falsifiable, not assumed | BR-017 |
| Retention discipline | Reconciliation outputs retained ≥90 days; raw pre-processing capture data is *not* retained after the job completes | BR-019 |
| Read-only enforcement, not just logging | The LLM subsystem holds no write credential at the trust-boundary level (**D-13**, `llmZone`) — the audit proof reflects a structural constraint, not a policy the AI could theoretically violate | AC-001, **D-13** |

The distinction that matters for leadership: BR-018 is satisfied *by construction* (the LLM subsystem has no write credential to call — **D-13** shows dispatch as the only path crossing into external systems, and only after human approval), and the audit query is how that construction is verified continuously in production rather than trusted on the architecture diagram alone.

## Observability feeding the control tower

The five-pillar observability model (Health, Logs, Trace, Audit, Telemetry — detailed in Volume 4, **D-17**) is what the Operations Manager and program leadership actually watch:

- **Health** and **Telemetry** answer "is the program running" (capture-source freshness, per-tenant volume, dispatch latency).
- **Audit** answers "did governance hold" — the P1 proof lives here.
- Both route into the existing **Intelligent Insights** observability spine (BR-029) rather than a parallel stack, so the control tower reuses an already-SOC 2 Type II-audited component instead of standing up new audit infrastructure per client.

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-17 | Observability — five pillars (Health/Logs/Trace/Audit/Telemetry) and the standing P1 audit-query proof |
| D-13 | Trust Boundaries — where RBAC, OIDC, and the human-approval gate (Boundary Crossing 4) are enforced end to end |

![Observability](../diagrams/output/D-17-observability.png)

![Trust Boundaries](../diagrams/output/D-13-trust-boundaries.png)

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| HITL dispatch requirements | [BRD §7.3](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#73-human-in-the-loop-dispatch) | references (this chapter elevates, never restates) |
| Audit trail & governance requirements | [BRD §7.5](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#75-audit-trail--governance) | references |
| Roles & access control | [BRD §7.6](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#76-authentication--access-control) | references |
| Non-negotiable constraints (AC-001–AC-007) | [BRD §10](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#10-architecture-constraints) | references |
| Observability model detail | Volume 4 · Deployment & Operations | extends |
| Trust boundaries detail | Volume 3 · Technical Architecture | extends |
| Package index & principles | [`../README.md`](../README.md) | extends |

<!-- Status: 🟢 drafted/reviewed -->
