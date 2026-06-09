# Computer-Use Live Verint Endeavor — Attempts & Lessons Log

> Filed into MemPalace so this endeavor's attempts, lessons, and reconciliations
> are recoverable later. Started 2026-06-03. Companion to
> `POC_Redefined/Computer_Use_Plan_0603.md`.

## What this endeavor is

Prove an AI agent can drive a **live Verint web session** (computer use) to
capture the real-time adherence grid, run it through a **triage layer**, and
produce auditable work cards + draft LOB-chat alert messages — without modifying
the existing POC or React `command-center`.

Mission framing (from Mateus): **abundance of confirmations from every source** —
the alerts, the cards, and the LOB-chat messages must each be corroborable. It
all started with the **screenshots of the Verint screens the RTAs work daily**;
that discovery runs through everything here.

## Lineage (what we already had — from MemPalace)

1. **April 28 shadowing screenshots** (`POC/01_evidence_pack/screenshots/raw/`,
   12 PNGs + `screenshot_manifest.csv`). `screenshot_05` documents the 7-column
   RTA adherence grid; `screenshot_06` the LOB filter. This is the screen we now
   drive live.
2. **Rule base** parsed from the annotated workbook: `alert_thresholds.json`,
   `aux_definitions.json`, `lob_routing_seed.json`, `line_health_codes.json`.
3. **OCR baseline attempt** (`POC/05_results/ocr_baseline/`): macOS Vision OCR
   vs. ground truth.
4. **Simulation engine** (`POC/07_simulation/engine/`): `alert_engine.py`,
   `card_builder.py`, `alert_formatter.py` + `sim_snapshot_t*.json`,
   `sim_cards.json`.
5. **React command-center** demo (`POC_Redefined/command-center`).

## Attempts so far

- **A1 — OCR baseline (prior).** macOS Vision `VNRecognizeTextRequest`. Result:
  name 75%, status 100%, duration 75%, scheduled 75%, **LOB 0%**. Verdict: raw
  OCR can't reconstruct the table or recover LOB; usable as a floor, not a
  solution.
- **A2 — browser-use scaffold (first draft).** `verint_browser_use_demo.py` let
  the LLM *compose* the alert text. Rejected: alerts must come from the
  deterministic engine, not the model, or auditability is lost.
- **A3 — live discovery (this session).** Logged into `wfo.a87` with **supervisor
  rights**; mapped `Tracking → ADHERENCE → Quick View` (the live equivalent of
  the April-28 grid) and `NOTIFICATIONS` (Verint's own alert output, ~299k msgs).

## Lessons (carry these forward)

- **L1 — DOM > OCR.** The live web app exposes a real DOM; extract structured
  text directly. OCR (A1) proved table reconstruction and LOB recovery are the
  hard parts — both solved by reading the DOM + injecting LOB from the View.
- **L2 — Model extracts, Python decides.** browser-use does navigation +
  structured extraction only. Triage/severity/cards/messages are deterministic
  Python (A2 lesson).
- **L3 — Verint already detects OOA.** The ADHERENCE grid has an "Out Of
  Adherence" column and "Too Long In Activity" counter; NOTIFICATIONS fires
  ~299k native alerts. So our value is **triage, not detection** (decision D6).
- **L4 — Tenant ≠ CIBC.** The live `wfo.a87` client base is Zillow/TikTok/Etsy/
  Roblox/TELUS/Epic Games — **not** CIBC's LOBs (Cards/Costco/Fraud/Telephone
  Banking). Same Verint product + same RTA screen, different data. CIBC rules/
  routing will not match live rows; that is expected. **Prove mechanics here;
  swap the client config when pointed at CIBC's tenant. Never claim we are live
  on CIBC's floor.**
- **L5 — Read-only on live prod.** Supervisor rights expose Edit/Delete/Create/
  Purge/Send. The agent must never invoke them. Scope to one LOB View (2,500
  cap); no PII/screenshot dump.
- **L6 — Honest data labels.** The TS `DataClass` union has no `"live"`; live
  cards are JSON-only, tagged `evidence-backed`, with live-adapter detail in
  `source.*` (decision D2).

## Confirmation matrix (the mission, operationalized)

A flagged agent is "confirmed" when independent sources agree:
grid OOA column (Verint verdict) + NOTIFICATIONS hit (native alert engine) +
card shaped like `sim_cards.json` + message routed as it would land in LOB chat.
Agreement and disagreement are both logged. See plan §"Mission: abundance of
confirmations".

## Decisions on record

D1 Chromium persistent profile (can't drive Safari) · D2 JSON-only cards,
`evidence-backed` · D3 single cycle for v1 · D4 strictly read-only on live prod ·
D5 one-LOB scope + PII discipline · D6 triage on Verint's verdict (not re-detect).

## Status / next

Plan revised (rev. 2). Next build (browser-free, fully testable): the
normalize + triage core with unit tests, then `card_builder` provenance params
(regression-guarded), then the extraction-only browser agent + one live run to
capture the real frame name and selectors.

---

### Update 2026-06-04 — endeavor delivered. See `SESSION_HANDOFF_2026-06-04.md`.

Core built + tested (44 tests). **Pivot:** target moved to the schedule/attendance
**Calendar** (`#wsm[ws]=wfmcal`). The Gantt is an **SVG** → vision scraping failed
→ **pivoted to network capture** (`netcap`) of the calendar's own API
(`/api/wfm/main/v2/calendar-filter`), which yields exact schedule +
`adherence.violations`. Built `verint_calendar_parse.py` (real EPIC cards),
integrated into the Command Center as the **"Live — EPIC"** scenario
(`scenario_from_capture.py`; additive + reversible), and built the **RTA Live
Bridge browser extension** (`verint_extension/`) that captures in-browser and
live-bridges cards into the Command Center (Playwright-verified).

**The browser extension is ONE capture adapter** — see
`CAPTURE_AND_DISPATCH_ADAPTERS.md`. Future features (productive hours, attendance,
adherence reporting, attrition) sketched in `FUTURE_FEATURES.md`. Full lessons /
open items / handoff checklist in `SESSION_HANDOFF_2026-06-04.md`.
