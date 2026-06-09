# Verint MCP + the RPA Layer — Future Note

> **Status:** parked for the future (agentic phase, ~Phase 8+). Not scheduled.
> **What this is:** a thinking note on (1) whether an MCP server makes sense for
> Verint — especially in Citrix/OCR situations — and (2) how such an MCP layer
> would compose with the existing **RPA Engine**. Companion to
> [SERVICENOW_MCP_EVALUATION.md](./SERVICENOW_MCP_EVALUATION.md); see also
> [FUTURE_FEATURES.md](./FUTURE_FEATURES.md) and
> [NEXT_STEPS.md](./NEXT_STEPS.md).
> **No code changes** — recommendation/architecture only.

---

## TL;DR

1. **For Verint *capture*, MCP is mostly the wrong shape.** Where Verint has an
   API, the existing adapters already capture deterministically — wrapping them in
   MCP is the same "REST-behind-JSON-RPC for no gain" anti-pattern flagged for
   ServiceNow. Where it's **Citrix**, MCP doesn't solve the actual hard problems
   (pixel egress, OCR accuracy, structure reconstruction). **MCP is not the Citrix
   answer — Track A + RPA are.**
2. **The one place MCP fits:** an *on-demand read tool* — `capture_verint_snapshot(lob, date)` — on the future in-network agentic gateway, a façade over whichever capture adapter is live, sitting next to the ServiceNow write tools.
3. **MCP and RPA are not competitors — they're brain vs. hands, and they compose.**
   The LLM (via MCP) absorbs *judgment*; the RPA Engine (or an API) performs the
   *deterministic, system-touching action*. **MCP must never be a parallel write
   path** — every write stays in the approved RPA/API channel, fully audited.

---

## Part 1 — Does an MCP server make sense for Verint?

There are two different things "Verint MCP" could mean, with opposite verdicts.

**(a) A Verint-*domain* MCP server** (the `servicenow-mcp` analog) — tools like
`get_adherence(lob)`, `list_violations()`. Only viable where Verint exposes an
API, and there the extension / netcap / REST adapters already do deterministic
capture into the stable core (`verint_normalize → verint_triage → card_builder`).
Wrapping that in JSON-RPC adds a hop for no gain. **Skip on the API paths.**

**(b) A *computer-use* MCP server** — `screenshot()` / `click()` / `ocr_region()`
primitives that let an LLM drive a session by pixels. **This is the one that maps
to Citrix** — but MCP, a tool-transport layer, doesn't touch why Citrix is hard:

- **Pixel egress.** Screenshots must be captured *inside* the VDI and data can't
  be copied out ([NEXT_STEPS.md:222-224](./NEXT_STEPS.md)). The elegant topology
  (brain outside the VDI, an MCP "hands" server inside shipping screenshots out)
  is *exactly* the egress the VDI security model exists to block.
- **OCR accuracy.** Baseline was 0/8 LOB codes ([NEXT_STEPS.md:228-229](./NEXT_STEPS.md)) — a perception/training problem (fine-tuned classifier on 200–500 labelled CIBC screens), not a protocol problem.
- **Structure.** The calendar is an SVG Gantt; vision was already proven a dead-end
  there and the project pivoted to netcap. In Citrix you *lose* netcap.

**Shape mismatch for the core use case:** real-time adherence monitoring is a
*continuous push* pipeline; MCP tools are *on-demand pull*. You don't want an LLM
gating every 60s refresh. So MCP fits **ad-hoc copilot investigation** ("pull Fraud
ITR adherence right now"), not the monitoring loop.

---

## Part 2 — How the MCP layer composes with the RPA Engine

This is the heart of the note.

### The architecture's existing division of labor

The "AI agent" decomposes into capabilities ([POC/02_architecture/README.md:18](../../POC/02_architecture/README.md)). The relevant four:

| Layer | Role | In the architecture |
|-------|------|---------------------|
| **Vision / OCR Agent** | Perception — pixels → structured data | `Vision Agent (OCR)` |
| **Decision / triage** | Judgment — apply rules to a snapshot | the stable rules core (deterministic today) |
| **Integration Agent** | Move data via **APIs/files** | `ServiceNow · GTT · Staffing Outlook` |
| **RPA Engine** | Execute **deterministic UI steps**, esp. Telus-side | `UiPath / Automation Anywhere`; "GTT pull · report export · ticket updates" |

Two load-bearing governance rules constrain anything we add:
- **Writes go through approved RPA or API channels only — nothing writes directly
  into Verint or CIBC systems** ([generate_presentation.mjs:996](../../POC/06_board_materials/generate_presentation.mjs)).
- **RPA stays narrow: deterministic steps only, never judgment or exception
  handling** ([generate_presentation.mjs:1945-1947](../../POC/06_board_materials/generate_presentation.mjs); [executive_storyline.md:17](../../POC/06_board_materials/executive_storyline.md)).

### The core idea: brain vs. hands

**MCP is the brain's tool interface. RPA is the certified hands. They compose.**

- The LLM (via MCP) handles **perception + judgment** — the ambiguous parts RPA is
  explicitly forbidden from touching.
- The RPA Engine (or an API connector) handles **execution** — the deterministic,
  auditable, system-touching step.
- **MCP is not a new write path.** When the brain decides "open a ticket" or
  "correct this schedule," it *delegates* to RPA/API; it never pokes the target UI
  itself. Governance and the audit trail stay intact.

This resolves a real tension. RPA must stay deterministic, but actual RTA work is
full of ambiguity. The MCP/LLM layer **absorbs the ambiguity and emits a concrete,
deterministic instruction** that RPA can safely execute — so you automate fuzzy
workflows *while keeping RPA narrow and compliant*.

### The data flow

```
 PERCEPTION                 DECISION                       EXECUTION
 ──────────                 ────────                       ─────────
 Vision/OCR (Citrix)   ┐                              ┌→ RPA Engine  (UI / Citrix, Telus-side)
 or API capture        ├→ normalized snapshot →  rules core      │   "approved write channel"
 (extension/netcap/    │                          + LLM-via-MCP  ┤
  REST)                ┘                          (ambiguous only)└→ Integration/API (ServiceNow, GTT…)
                                                       │
                                                       └──────────────→ Command Center audit trail
```

The MCP layer sits **between Decision and Execution** as the tool interface; the
tools it exposes are *backed by* RPA and APIs.

### Why RPA is the right partner for the Citrix case specifically

RPA actually **resolves the egress dilemma** that broke the elegant MCP topology in
Part 1: the RPA Engine runs **Telus-side, "no Citrix restriction"**
([CIBC_RTA_Workflow_Diagrams.html:419](../../POC/02_architecture/diagrams/CIBC_RTA_Workflow_Diagrams.html)) — i.e. it operates *inside* the boundary where the data lives, using UiPath/AA's mature Citrix automation. So the bot works inside the VDI; MCP carries **instructions and PII-minimized normalized results**, not bulk pixel egress out of the VDI.

### Two composition topologies

- **(A) MCP-over-RPA — agent orchestrates bots.** RPA bots are exposed as MCP tools
  (`run_gtt_pull()`, `submit_attendance(...)`, `correct_schedule(...)`). The LLM
  decides; bots execute. Best for **new end-to-end agentic workflows** (writes stay
  in the RPA/API channel).
- **(B) RPA-calls-AI — bot escalates to the brain.** A deterministic RPA flow runs
  as today; when it hits an ambiguous screen/state it can't classify, it calls the
  LLM via MCP for a perception/decision, then resumes. Best for **hardening Citrix
  capture/navigation** against the messy 10%. (This is the industry's "agentic
  automation" direction — UiPath/AA bolting AI onto bots.)

**For CIBC:** use **(A)** for new agentic workflows and **(B)** to make Citrix
capture robust — in both, MCP orchestrates and RPA/API remain the only things that
touch a real system.

---

## Guardrails to carry forward (non-negotiable)

1. **MCP orchestrates; it never writes directly** to Verint/CIBC. Writes route
   through approved RPA or API channels.
2. **RPA stays deterministic.** The LLM owns judgment, then hands RPA a concrete,
   unambiguous action.
3. **Everything system-touching is logged** (reuse the Command Center audit trail —
   `runCardAction → appendAudit`).
4. **No raw VDI pixel egress.** RPA works inside the boundary and emits
   PII-minimized, normalized data; MCP carries that, not screenshots.

## Timing

Phase 8+ agentic layer, alongside the ServiceNow "Option C — MCP gateway." Not
scheduled. When the copilot graduates from *explain/recommend* to *taking actions*,
revisit this note: a Verint *read* tool and the ServiceNow *write* tools live on
the **same in-network MCP gateway**, with the **RPA Engine as the execution layer
beneath it**.
