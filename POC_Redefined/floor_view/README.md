# Floor View

> A spatial, glanceable radar of the contact-centre floor — and the adaptive refresh engine that feeds it.
> One mechanism, viewed from two ends: **the map tells the RTA where to look; where the RTA looks tells the
> system what to fetch.**

**Status:** 🟡 Design + dry-run gate. No interface code yet — and deliberately so. The whole feature is blocked on
one unproven API question (see [The gate](#the-gate-read-this-first)). We prove the primitive, *then* we build.

---

## What this is

Today an RTA (Real-Time Analyst) monitors the floor by reading a **serial list** of priority cards. Reading a list
is effortful and builds no memory of the floor.

Floor View replaces the *front door* (not the machinery) with a **top-down spatial map**: agents are avatars,
clustered into **line-of-business (LOB) neighbourhoods**, where **position + colour + motion encode floor state**.
The RTA groks the whole floor in one glance. Clicking a flaring avatar opens the **existing** command card to resolve
it. The radar finds; the card resolves.

It is built for the **internal RTA daily-driver** — so it leans into game-feel and delight for the *operator* — but
it holds one hard line: **avatars depict operational state, never a person's score.** No agent leaderboards. (See
[ADR-0002](docs/decisions/0002-state-not-scoreboard.md) for why this line is load-bearing.)

## Why it's worth building

1. **Attention, used correctly.** The governing principle is **stillness-is-the-reward**: the floor is calm and quiet
   when healthy; motion, colour, and accumulating "heat" are spent *only* on exceptions. A still, green floor means
   "you've got this." The one avatar that flares is the only thing that moves — so your eye lands on it, not on noise.
2. **It builds expertise.** A stable map develops *spatial muscle memory*: an RTA learns that "COSTCO flares first at
   the 12:00 lunch wave." Anticipation replaces reaction. This is the concrete, daily embodiment of the locked
   strategy to **reposition RTAs as WFM experts** rather than data-entry resources.
3. **It's cheap.** It renders `AgentProfile` data we *already* capture live (via the Verint bridge). And it turns
   Verint's pagination *liability* into the *fetch engine* (see below) — no new pipeline.

## The big idea: one mechanism, two ends

```
        ┌─────────────────────────────────────────────────────────┐
        │                       FLOOR VIEW                          │
        │   neighbourhoods · heat · the lunch/break wave · radar    │
        └─────────────────────────────────────────────────────────┘
              ▲  renders                         drives  │
              │  (state → pixels)        (attention → IDs)│
              │                                           ▼
        ┌─────────────────────────────────────────────────────────┐
        │                  ADAPTIVE REFRESH ENGINE                  │
        │  census (paged, rare)  +  targeted pulls (ID-scoped, hot) │
        │           per-tenant rate budget · backoff                │
        └─────────────────────────────────────────────────────────┘
```

The floor view's **attention model is the fetch scheduler.** Hot neighbourhoods get polled tight; calm ones get
polled lazily. Total load scales with *how much of the floor is hot* — not with headcount. That's gentler on Verint
*and* more responsive exactly where the RTA is looking.

## The gate (read this first)

Everything depends on a single question:

> **Will Verint accept a `workResourceIds` set that we compose ourselves** — spanning multiple census pages and
> multiple LOBs — in a `calendar-filter` POST?

- **Yes** → the attention-driven scheduler is real; build it.
- **No** → fall back to *page-aligned neighbourhoods* (group LOBs onto Verint's 50-row page boundaries). Still works,
  less elegant.

We answer this with a **read-only dry-run** ([dry_run/](dry_run/)) **before writing any interface** — the same
"prove the primitive first" discipline that's carried this POC end-to-end. The dry-run needs a live Verint login and
is run by Mateus.

## Map of this folder

| Path | What it is |
|------|------------|
| [docs/DESIGN.md](docs/DESIGN.md) | The Floor View UX — radar/action split, neighbourhoods, stillness, heat, the wave |
| [docs/REFRESH_ARCHITECTURE.md](docs/REFRESH_ARCHITECTURE.md) | Two-tier fetch, per-tenant rate budget, backoff, scaling math |
| [docs/DRY_RUN_PROTOCOL.md](docs/DRY_RUN_PROTOCOL.md) | The gate: exact request variants + pass/fail criteria |
| [docs/decisions/](docs/decisions/) | ADRs — one decision per file, *why* first |
| [dry_run/](dry_run/) | The read-only probe harness + how to run it + a results template |

## How to run the dry-run (short version)

1. Log into live Verint in a Chrome tab with the RTA Live Bridge extension loaded.
2. Apply an account/org filter so a real `calendar-filter` fires (this populates the extension's `lastCalReq`).
3. Open DevTools console on the Verint tab, paste [dry_run/floor_probe.js](dry_run/floor_probe.js), and run the
   variants **in order** (`V0 → V5`).
4. Record results in a copy of [dry_run/results_template.md](dry_run/results_template.md) (PII stripped).

Full procedure, safety rails, and the meaning of each variant: [dry_run/README.md](dry_run/README.md) and
[docs/DRY_RUN_PROTOCOL.md](docs/DRY_RUN_PROTOCOL.md).

## Status & next step

- [x] Design captured (this folder)
- [x] Dry-run harness written
- [~] Dry-run **attempted live 2026-06-10** — confirmed the request shape + auth model, but console replay hit 401
  (rotating tokens + frame context). Retired the console path ([ADR-0005](docs/decisions/0005-probe-via-extension-not-console.md)).
- [x] **Gate probe rebuilt into the extension (2026-06-11)** — `inject.js` captures the live request from XHR + a
  read-only probe runner re-fires from its authenticated context; popup **"Run gate probe."** How-to:
  [dry_run/EXTENSION_PROBE.md](dry_run/EXTENSION_PROBE.md).
- [x] ✅ **GATE PASSED on live Verint 2026-06-11** — composed `workResourceIds` honoured: V2 cross-page 10/10, V3
  cross-LOB 6/6, V4 12/12, all 201 / ~0.7s. Record: [dry_run/results_template.md](dry_run/results_template.md).
- [ ] **← NEXT: build the FloorView UI** (Phase 3) — the scheduler is proven.
- [ ] Implementation — *gated on the dry-run verdict*; see Phase 3 of the plan.

## Guardrails this feature inherits (non-negotiable)

- **Read-only.** We never write to Verint. "No AI writes" must stay provable.
- **PII stays local + transient.** Raw response bodies hold real names/IDs → `runs/` (gitignored). The committed
  `floor_view/` tree is docs + harness only.
- **Conservative on Verint.** Sequential requests, never parallel fan-out; back off on any sign of strain. Stability
  was explicitly flagged by the team — coordinate with Dione before live runs.
