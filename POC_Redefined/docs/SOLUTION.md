# Solution — What Was Built and How It Works

> This document explains the RTA Command Center POC.
> It is written for engineers who are taking over this codebase.
> Read [PAIN_POINTS.md](./PAIN_POINTS.md) first if you have not already.

---

## Summary

The RTA Command Center is a React web app that replaces the "read Verint, write message, switch tools" cycle with a single surface where:

1. **The AI watches** — it monitors adherence, queue health, and reporting deadlines continuously.
2. **The AI drafts** — it writes alert messages, selects the right channel, and ranks work by urgency.
3. **The RTA decides** — they approve, edit, suppress, or escalate with one click.
4. **The AI learns** — every decision the RTA makes becomes a training signal that improves future recommendations.

---

## The card system

Every alert, task, and report in the system is a **CommandCard**.

A card answers four questions:
1. **What happened?** — title + summary
2. **How urgent is it?** — severity (critical / high / medium / low / info)
3. **How confident is the AI?** — confidence score (0–1; shown as a percentage)
4. **What should the RTA do?** — recommendedAction + draftMessage + targetChannel

### Card lifecycle

```
detected → classified → needs-review → [RTA acts] → sent / suppressed / escalated / resolved
```

- **detected**: AI saw an anomaly but has not yet classified it.
- **classified**: AI assigned type, severity, and drafted a message. Waiting for RTA.
- **needs-review**: AI recommends action. The RTA's decision is needed.
- **sent**: Alert was dispatched to the target channel.
- **suppressed**: RTA decided no action was needed (teaches AI to filter similar alerts).
- **escalated**: Sent to a supervisor or operations manager.
- **resolved**: Handled without dispatching (e.g. situation resolved itself).

### Card types

| Type | Example |
|------|---------|
| `alert` | Agent in COAC 32+ minutes |
| `task` | ServiceNow ticket needs updating |
| `report` | Morning attendance report due in 8 minutes |
| `exception` | OCR could not classify agent status — needs human review |
| `escalation` | Third cycle in violation — escalate to OM |
| `coaching-decision` | Supervisor requesting coaching — LOB SLA at 78% (approve or deny?) |
| `rebalance` | TLB SLA at 12% — Cards at 94% — move 2 agents? |
| `outage-playbook` | Fraud ITR WDE outage — step-by-step incident response |

---

## The AI + human model

This POC demonstrates **Human-in-the-Loop (HITL)** AI, not full automation.

### What the AI does automatically (no click needed):
- Scans Verint data every 15 minutes.
- Classifies each exception by type, severity, and confidence.
- Drafts the alert message in the correct format.
- Selects the target channel based on the LOB map.
- Ranks all active cards by priority.
- Generates attendance reports and pre-fills email body/subject.

### What the RTA does (one decision per card):
- Reviews the AI's recommendation.
- Approves, edits, suppresses, or escalates.
- Asks the AI to explain or improve the draft (via Copilot panel).

### What the RTA does when AI confidence is low (<70%):
- The card is flagged as an `exception`.
- The Copilot panel is prompted open automatically.
- The RTA provides the correct action, which becomes a training signal.

### The "Autonomous" demo mode:
In the demo, pressing **Auto mode** removes the RTA from the loop entirely.
The AI acts on every actionable card without waiting for a click.
This shows what full automation looks like — and why it requires high confidence levels before it is safe to enable.

---

## The Copilot panel (inline AI assistant)

When the RTA wants to understand a card before acting, they open the Copilot panel.
It has three steps:

1. **Why?** — The AI explains what happened, why it matters, and what the risk is if ignored.
2. **Recommend** — The AI gives a specific recommendation: who to notify, how, and why.
3. **Draft** — The RTA can edit the pre-drafted message; the AI can improve the text on request.

The Copilot streams tokens so answers feel immediate (the RTA sees words appear one by one, not a loading spinner).

The Copilot is powered by FuelIX (Telus's internal LLM, OpenAI-compatible).
Configuration: see `.env.example` and `src/services/fuelixClient.ts`.

---

## The learning strip

At the bottom of the screen, the Learning Strip shows:

- How many decisions the RTA has made this shift.
- The current AI confidence level (starts at 78%, changes with each decision).
- What the AI just learned from the last decision.

This is the most strategically important element in the demo for leadership:
> **Every time the RTA uses the system, it gets better.**

In production, learning signals feed into fine-tuning pipelines or preference extraction systems. In the POC, they adjust the local confidence counter.

---

## The four demo scenarios

The POC includes four pre-built scenarios. Each one tells a different story.

### Scenario A — Steady State
Normal shift. Minor adherence violations. AI handles most alerts automatically.
The RTA's confidence score grows to 90%+ by the end.
**Story:** "The AI reduces routine work and lets the RTA focus on coaching."

### Scenario B — Queue Spike
Two LOBs go RED simultaneously (SLA collapse). The AI escalates correctly to the supervisor and OM.
The RTA approves all coaching denials (SLA too low to allow offline time).
**Story:** "The AI knows when to escalate and who to notify."

### Scenario C — Attendance Crisis
Morning attendance is 71%, just above the critical 70% threshold.
The AI alerts early, adjusts LOB coverage automatically, and flags anomalies in the report.
**Story:** "The AI catches staffing risks before they become service failures."

### Scenario D — Tech Outage
Fraud ITR WDE goes down. 6 agents affected. The AI detects the pattern, opens a ServiceNow ticket, and runs the incident playbook with timed escalation steps.
**Story:** "The AI manages the full incident response without the RTA having to remember every step."

---

## What data is in this demo

All data in the demo is tagged with a **DataClass** label:

| Label | Meaning |
|-------|---------|
| `evidence-backed` | From a real Verint screenshot or April 28 shadowing session |
| `seeded` | Invented but plausible — fills out the demo |
| `simulated` | Generated at runtime by the demo engine |
| `future-integration` | Would come from a system not yet connected |

**The demo contains no real agent names, no real SLA data, and no real CIBC customer data.**
The evidence-backed values are Verint status codes and durations from the shadowing session, used with approval.

---

## See also

- [ARCHITECTURE.md](./ARCHITECTURE.md) — component tree, data flow, production comparison
- [SCOPE.md](./SCOPE.md) — what is in and out of scope
- [NEXT_STEPS.md](./NEXT_STEPS.md) — how to go from POC to production
