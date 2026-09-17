*Audience: RTA Automation team + stakeholders seeing the product for the first time · Purpose: how the Extension and Command Center work together as one system, walked through the four flows people actually recognize — Attendance Report, Adherence Report, Alert Dispatch, Shift Open/Close.*

---

# Command Center — Functional Flows (Extension + Core as One Product)

> Traces to principle(s): **P1** (no AI write path), **P2** (adapter-blind rules core), **P5** (human-in-the-loop before dispatch) — see [package README](../README.md#architecture-principles--brd-constraint-map).
> Companion to [Volume 2 · Product Architecture](./Volume-2_Product-Architecture.md) (D-01 capability map, D-06 capability stack) and [Volume 4's D-12 sequence](../Volume-4_Deployment-and-Operations/Volume-4_Deployment-and-Operations.md) (the alert-dispatch sequence in full detail). This document reframes the same underlying systems around the four flows a floor manager actually recognizes, so the team can present "what does this product do" without walking through C4 layers first.

## Summary

The Browser Extension and the Command Center are not two products glued together — they're two ends of **one pipeline**: the extension is how the pipeline *sees* the floor, the Command Center is how a human *acts* on what it sees. Everything in between — the rules core, the data store, the AI advisor — is shared, built once, and reused by all four flows below. That reuse is the entire pitch when this becomes a standalone product: adding a fifth report or a new alert type doesn't mean building new plumbing, it means adding a new branch off a spine that already exists.

## The main systems (what to point at in the diagram)

| System | What it is | What it solves |
|---|---|---|
| **Browser Extension** (capture adapter) | Runs in the RTA's browser, reads the Verint grid | The only way to see agent state when there's no API access (Citrix/VDI, `none`-access tenants) — this is the "eyes" of the system |
| **API Gateway** | Single authenticated entry point for everything the extension or SPA sends | One place to validate, rate-limit, and authenticate every request — no service talks to the outside world directly |
| **Rules Core** (normalize → triage → card_builder) | The one shared brain: turns raw capture rows into a consistent, scored "thing that might need attention" | Runs identically no matter which capture adapter fed it — this is what lets every flow below reuse the same logic instead of four separate implementations |
| **Operational + Audit Store** | Append-only record of every card, decision, and dispatch | The system of record for "what happened and who approved it" — feeds all four flows below, not just alerts |
| **Intelligence Store** | Aggregated, per-tenant analytics data, built from the Operational Store over time | Where trend data (adherence over a week, attendance over a month) lives — separate from the live/operational path so heavy reporting queries never slow down real-time alerting |
| **LLM Advisor** | Drafts message text and summaries only — holds no credential to write anywhere (P1) | Speeds up the human's job (draft copy, summarize a pattern) without ever being the thing that takes action |
| **Command Center SPA** | The RTA's screen — live card feed, report views, shift controls | Where a human sees everything the pipeline surfaced and is the *only* place an action can be approved (P5) |
| **Dispatch Workers** | Fan out an approved action to its destination (chat, ServiceNow, a report export) | The one exit door from the system — every outbound message or write goes through here, so there's one place to audit and one place to add a new destination |

**The pattern to say out loud to the team:** *Capture → Core (normalize/triage/store) → Human review (where needed) → Dispatch/Output.* All four flows below are that same pattern, just with a different trigger and a different output at the end.

## The four flows

### 1 — Shift Open / Close

**Trigger:** RTA (or a schedule) marks the start/end of a monitoring window for a shift.
**Path:** Command Center SPA → API Gateway → Rules Core (opens/closes the shift's tracking window) → Operational Store (timestamps the window).
**Output:** A bounded time window that every other flow below uses to know "what counts as this shift's data." No dispatch, no external write — this flow's entire job is to set the boundary the other three flows measure against.
**Why it's foundational:** Attendance and adherence numbers are meaningless without a clear start/end — this is the flow that makes "today's attendance report" mean something specific instead of an arbitrary rolling window.

### 2 — Attendance Report

**Trigger:** End of a shift window (flow 1), or on-demand from the SPA.
**Path:** Capture (extension, continuously through the shift) → Rules Core normalize → Operational Store → aggregation job reads the shift window → Intelligence Store → Command Center SPA (report view).
**Output:** Who was present, absent, or late for the shift, scoped to the window flow 1 defined.
**Why it reuses the spine:** Attendance doesn't need its own capture path or its own capture logic — it's the same normalized rows the alert flow already produces, just aggregated differently.

### 3 — Alert Dispatch (real-time)

**Trigger:** Rules Core triage detects an out-of-adherence or exception condition *while the shift is open*.
**Path:** Capture → Rules Core (normalize → triage → card_builder) → LLM Advisor drafts message copy → Operational Store (card, `pending_review`) → Command Center SPA (RTA sees it live) → RTA approves/edits/suppresses/escalates → Dispatch Workers → Chat / ServiceNow.
**Output:** A human-approved message or ticket, delivered within the shift, never sent without review (P5).
**This is the flow with a human gate** — the other three are read/report flows; this is the one where the system is asking a person to act. See the full step-by-step sequence in [Volume 4's D-12](../Volume-4_Deployment-and-Operations/Volume-4_Deployment-and-Operations.md).

### 4 — Adherence Report

**Trigger:** Scheduled (e.g. weekly) or on-demand from the SPA.
**Path:** Operational Store (every triage decision + every RTA approve/suppress outcome, across many shifts) → aggregation job → Intelligence Store (trend data) → Command Center SPA (report view).
**Output:** A trend view — how often agents drift out of adherence, how often alerts were suppressed vs. approved, patterns over time per LOB.
**Why it's slower-cadence:** Unlike alert dispatch (must be fast, real-time), this flow trades latency for scope — it reads across many shift windows at once, which is exactly what the Intelligence Store split (from the live Operational Store) exists to make cheap.

## Why this is one product, not two

The extension and the Command Center are the two visible bookends; everything that makes all four flows possible sits between them and is built exactly once:

- One capture pipeline feeds all four flows — nobody re-instruments the extension per report.
- One rules core (normalize/triage) means a new alert rule or a new report metric is a change in one place, not four.
- One audit store means "prove what happened" answers every flow's questions from the same source, including compliance questions about the alert flow and reporting questions about the other three.

That reuse is the argument for why, once this becomes a standalone hosted product (see the [rollout sequence](../Volume-4_Deployment-and-Operations/COMMAND_CENTER_ROLLOUT_SEQUENCE.md)), it should ship as **one deployed system with four surfaced flows** — not four separate services that happen to share a database.

## Diagrams

| D-ID | What it shows |
|------|---------------|
| (supplementary) | Functional System Map — the shared spine (Extension → Core → SPA) with the four flows branching off it; see [`functional-system-map.mmd`](../diagrams/sources/functional-system-map.mmd) |
| D-01 | Business Capability Map — the underlying capability clusters this document reframes around flows |
| D-12 | Sequences — the detailed step-by-step for the Alert Dispatch flow specifically |

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Business capability map, personas | [Volume 2 · Product Architecture](./Volume-2_Product-Architecture.md) | extends (reframes D-01 around flows, not capability clusters) |
| Full alert-dispatch sequence | [Volume 4 · Deployment & Operations](../Volume-4_Deployment-and-Operations/Volume-4_Deployment-and-Operations.md) (D-12) | references |
| Standalone-product rollout sequence | [`COMMAND_CENTER_ROLLOUT_SEQUENCE.md`](../Volume-4_Deployment-and-Operations/COMMAND_CENTER_ROLLOUT_SEQUENCE.md) | extends (the "why one system" argument feeds that doc's hosting rationale) |

<!-- Status: 🟡 starter — first pass, framed for a team walkthrough; fold into D-01/D-06 formally if the team wants it cataloged -->
