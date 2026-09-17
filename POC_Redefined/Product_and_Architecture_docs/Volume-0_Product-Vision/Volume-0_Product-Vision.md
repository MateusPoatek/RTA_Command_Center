*Audience: everyone — executives, program stakeholders, engineers, new hires · Purpose: what is this platform and why does it exist?*

---

# Volume 0 · Product Vision

> Traces to principle(s): **P1–P5** (see [package README](../README.md#architecture-principles--brd-constraint-map) and the sibling [Architecture Principles](./Volume-0_Architecture-Principles.md) chapter).
> Source of truth: [BRD §1 Executive Summary](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#1-executive-summary) and [§2 Business Context](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#2-business-context). This chapter elevates, it does not restate.

## Summary

RTA analysts today spend roughly 4 hours a day watching adherence dashboards and hand-building attendance reports — work that is repetitive, error-prone, and doesn't scale past one client per analyst. The **RTA Command Center** is a human-in-the-loop platform that captures adherence data as it happens, classifies it deterministically, and hands an analyst a pre-drafted decision to approve — never an action the AI took on its own. It is built as a **product platform**, not a one-off automation: one container image, configured per client by a manifest, addressable across a confirmed **105-account, 19,026-headcount** base inside Telus's existing 415-account portfolio.

## The Problem

Two manual processes dominate an RTA analyst's day:

- **Adherence monitoring** — watching a Verint dashboard for out-of-adherence agents, composing a Teams/Chat message by hand, and repeating that cycle every ~15 minutes across every Line of Business the analyst covers at once.
- **Attendance reconciliation** — logging into the GTT portal, downloading a CSV, cross-referencing it against Verint by hand, and writing a report, up to several times a shift. For one bank-tier client's Guatemala site alone this is 49 minutes per cycle, 2.5 hours a day.

Neither process is intellectually hard. Both are high-frequency, high-attention-cost, and today they consume analyst time that doesn't grow linearly with the number of clients Telus serves — it caps at roughly one client per RTA.

## What the Platform Is

The RTA Command Center:

- Captures Verint adherence data in real time, via browser extension (client-owned tenants) or server-side REST API (Telus-hosted tenants) — the capture mechanism is a swappable adapter, not a fork.
- Runs captured data through a deterministic rules core that classifies exceptions and drafts the notification.
- Presents every draft to an RTA analyst as a `CommandCard` for one-click approval, edit, or suppression — the AI never sends a message or writes to an external system on its own (see **P1**, **P5** in the [Architecture Principles](./Volume-0_Architecture-Principles.md) chapter).
- Generates GTT × Verint attendance reconciliation reports automatically, on a configurable schedule.
- Logs every action to an immutable audit trail.

The core insight that makes this a *platform* rather than a bank-tier-client-specific tool: the rules core is adapter-blind (**P2**) and ships as one OCI image configured per client by a tenant manifest (**P3**). Onboarding the next account is a configuration exercise, not a rebuild — which is what makes the 105-account addressable base in the next section credible rather than aspirational.

## Why It's Not a Bespoke Automation

A point automation solves one client's problem once. This platform is designed so the same image, the same rules core, and the same audit guarantees serve every account Telus adds — Gold accounts today, Silver accounts after a capture-adapter sprint, Bronze accounts once access is negotiated. The value chain from raw capture to a report a director trusts is the same chain regardless of which client sits at the front of it — see **D-02** (Product Value Chain, detailed in Volume 1).

This is also why the five architecture principles in the sibling chapter aren't implementation trivia: they're the reason a bank-tier client can adopt a platform with an AI-adjacent core in the first place. No AI write path, one image many manifests, human-in-the-loop before anything reaches the outside world — those aren't features, they're the platform's admission ticket.

## The Opportunity, in One Table

| | Current state | With the platform |
|---|---|---|
| Attendance report | 5–45 min/report, up to 7×/day | < 5 min, automated |
| Adherence exception response | ~15 min manual cycle | < 60 seconds |
| RTA monitoring load | ~4h/day per analyst | < 30 min/day supervision |
| Audit trail | None | Immutable, every action logged |
| Scale | 1 client per RTA | 105+ accounts confirmed reachable, one service |

Full financial modeling, tiering methodology, and the value chain that produces these numbers live in Volume 1 (Executive Strategy) and Volume 2 (Product Architecture) — this chapter exists so the *shape* of the opportunity is legible before any of the supporting numbers are read.

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-00 | Platform Poster — the signature synthesis of the whole package; the intended cover of Volume 0 (see [`../diagrams/output/D-00-platform-poster.png`](../diagrams/output/D-00-platform-poster.png)) |
| D-02 | Product Value Chain — how raw capture becomes a trusted decision, detailed in Volume 1 |

![Platform Poster](../diagrams/output/D-00-platform-poster.png)

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Problem, solution, POC evidence, business case | [BRD §1 Executive Summary](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#1-executive-summary) | references (this chapter elevates, never restates) |
| Current-state manual workflows | [BRD §2 Business Context](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#2-business-context) | references |
| The five non-negotiable constraints (P1–P5) | [Volume 0 · Architecture Principles](./Volume-0_Architecture-Principles.md) | extends (read next) |
| Account tiering, addressable market, impact model | [BRD §5 Account Prioritisation](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#5-account-prioritisation) | references (detailed in Volume 1/2) |
| Package index & volume map | [`../README.md`](../README.md) | extends (this chapter is Volume 0's narrative half) |

<!-- Status: 🟢 drafted/reviewed -->
