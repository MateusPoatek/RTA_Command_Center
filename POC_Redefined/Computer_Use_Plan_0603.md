# Computer Use Plan — 2026-06-03 (rev. 2, live-access)

## Purpose

Prove that an AI agent can drive a **live Verint web session** to capture
real-time adherence data, run it through the **existing CIBC RTA rule engine**,
and produce auditable work cards and draft alert messages — without modifying
the existing POC simulation or the React `command-center` demo.

> **rev. 2 changes:** rewritten after confirming live Verint access
> (`wfo.a87.verintcloudservices.com`, logged in as
> `mateus.teixeira@poatek.com`) and after auditing the real engine contracts.
> The previous draft would have let the LLM *invent* alerts and assumed a
> `dataClass` value the type system rejects. Both are fixed below.

## Non-negotiable principle (the reason this POC exists)

**browser-use extracts; Python decides.**
The browser agent's *only* job is navigation + structured DOM extraction. It
must **never** author alert text. All alerting is done by the deterministic
engine:
`evaluate_agents()` → `build_card()` → `draft_alert_message()`.
If the LLM writes the alert, the auditability/provenance story is gone and the
demo is worthless. This boundary is the heart of the plan.

## Scope

### Included
- A live Verint web adapter, isolated from the React app.
- A browser-use + Playwright **extraction-only** agent that returns structured
  JSON (enforced by an output schema/controller, not free text).
- A **normalization layer** parsing raw screen text into the `AgentRow` contract.
- Mapping normalized rows into the existing `AgentRow` dataclass.
- A **triage layer** (`verint_triage.py`) that consumes Verint's OOA verdict and
  produces `AlertResult`s (reusing the engine's dataclasses; D6).
- Card creation via `POC/07_simulation/engine/card_builder.py` (live-aware).
- Draft alert text via `POC/07_simulation/engine/alert_formatter.py`.
- Provenance logging and audit metadata for every stage.
- A narrative docs file describing the demo and how to run it.
- Output written to **JSON artifacts + console only** (not imported into React).

### Excluded
- Any change to `POC_Redefined/command-center` demo state or logic.
- Production dispatch to Google Chat / Teams.
- Driving the user's existing **Safari** session (not possible via Playwright —
  see Decision D1).
- Live Verint REST/API integration.

## Confirmed live-access reality (from 2026-06-03 screenshots)

- URL: `https://wfo.a87.verintcloudservices.com`, authenticated as
  `mateus.teixeira@poatek.com`.
- **Supervisor rights confirmed.** The **Tracking** module is fully accessible
  with **1000+ agent accounts** in scope (NOTIFICATIONS shows *298,915*
  messages). The earlier "single-agent only" constraint is **resolved** — we can
  capture a real multi-agent picture.
- **Tracking has three sub-tabs:** `ROSTER | ADHERENCE | NOTIFICATIONS`.
  - **ADHERENCE** → the live multi-agent real-time adherence grid. **This is our
    extraction target** (pipeline input). DOM structure still to be inspected —
    remaining Step 1 work.
  - **NOTIFICATIONS → Messages** → Verint's *own* alert engine output. Hundreds
    of thousands of raw, noisy notifications already fire from native "Alert
    Rules" (e.g. `Out of Adherence: BREAK 1`, `LogIn vs Absence Plotted`,
    `TIP_Out of Aherence`, `Scheduled Activity Reminder`). See reframe below.
  - **ROSTER** → not yet inspected.

### What NOTIFICATIONS means for the pitch (important reframe)

Verint *already* detects out-of-adherence and emits ~299k notifications nobody
can triage. So the demo's value is **not** "detect OOA" — it's the layer the RTA
does manually on top of Verint:

> Turn the live adherence picture into a *small set* of prioritized,
> escalation-aware, LOB-routed **work cards with draft dispatch messages**,
> suppressing noise — the RTA's manual triage, automated and auditable.

**Validation oracle (free credibility):** when our engine flags agent X from the
ADHERENCE grid, cross-check that Verint's NOTIFICATIONS list independently
flagged the same agent in the same window. Agreement = proof our rules track
Verint's ground truth; divergence = a finding worth showing. Add this as an
optional Step 4b cross-check.

## Prior evidence & reconciliation (from MemPalace, 2026-06-03)

This endeavor is the next step in a lineage already in the palace — not a fresh
start. Respect these confirmations and constraints; do not assume past them.

- **Origin = the RTAs' daily screen.** `screenshot_05` annotation documents the
  exact 7-column layout (`Icons · Agent name · Scheduled · Out of adherence ·
  Activity/status · Time in activity · Adherence %`) — *identical* to the live
  ADHERENCE Quick View. `screenshot_06` = the LOB filter (the `View:` dropdown).
  Source: `POC/01_evidence_pack/manifests/screenshot_manifest.csv`, 12 raw PNGs.
- **OCR baseline already run** (`POC/05_results/ocr_baseline/ocr_baseline_report.md`):
  name 75% · **status 100%** · duration 75% · scheduled 75% · **LOB 0%**.
  Lessons we inherit: raw OCR can't reconstruct the table; **LOB must come from
  the View/filter context** (not the row); raw screenshots are **transient,
  never retained or dispatched** (Citrix policy). → This is *why* we extract from
  the live **DOM** (exact text + structure) and inject LOB from the View (D5).

- **⚠️ Tenant reconciliation (critical — do not misstate).** The CIBC evidence
  pack is **CIBC/Avaya**: thresholds `INBD>9m`, `BLEN`, `Coaching>30m`; LOBs
  *Cards, Costco, Fraud ITR, Telephone Banking* (Guatemala/Philippines);
  channels *"CBC … TDPH WFM"*. The live `wfo.a87` tenant is a **different client
  base** (Zillow, TikTok, Etsy, Roblox, TELUS, Epic Games…). It is the **same
  Verint product and same RTA screen, NOT CIBC's data.** Therefore:
  - CIBC `alert_thresholds.json` / `lob_channel_map.json` will **not** match live
    rows; `lob_channel("Zillow")` → fallback channel. This is expected, not a bug.
  - We prove the **computer-use mechanics** on the real screen; the rules/routing
    layer is **client-configurable**, seeded from CIBC's pack when pointed at
    CIBC's tenant. **Never claim we are reading CIBC's live floor.**
  - This is exactly why **D6 (triage on Verint's verdict)** is correct: it is
    client-agnostic and works on Zillow rows with zero CIBC-specific config.

## Mission: abundance of confirmations (multi-source matrix)

A generated alert/card is only trustworthy if **independent sources corroborate
it**. For every flagged agent, we triangulate:

| # | Source | Role | Status |
|---|---|---|---|
| 1 | Original RTA screenshots + annotations | screen layout is real | ✅ in palace |
| 2 | OCR baseline report | prior extraction + accuracy floor | ✅ in palace |
| 3 | **Live ADHERENCE Quick View (DOM)** | primary capture (this endeavor) | building |
| 4 | **Verint NOTIFICATIONS** (native alert engine) | independent verdict oracle | Step 4b |
| 5 | Quick View "Out Of Adherence" column | Verint per-agent verdict | D6 input |
| 6 | LOB Google Chat message | dispatch destination / format truth | Step 5 |
| 7 | Simulation `sim_cards.json` | expected card-shape contract | reference |
| 8 | PH Service-Level alerts (Google Chat) | cross-GEO corroboration | per ABD |

**Confirmed alert** = grid OOA verdict (5) **and** an independent NOTIFICATIONS
hit (4) for the same agent/window, shaped like (7), routed as it would appear in
(6). Record agreement in the run log; surface disagreements as findings rather
than hiding them. This matrix is the demo's credibility engine.

### ABD alignment (canonical process — corroborates the design)

`POC/00_source_inputs/redy_outputs/.../2_RT_Adherence_Monitoring/` (the P1 ABD)
defines the real RTA loop, and our pipeline maps to it 1:1:
`Cycle start (15-min)` → `Cycle 10 LOB tabs (Verint)` → `Identify long calls &
AUX abuse (Verint)` → `Anomalies?` → `Compose & post LOB chat alert (Google
Chat)` → `Track & re-alert if persistent` → `Status persists? → Tag OM` →
`3+ cycles? → Escalate to senior RTA` → `Cross-check PH SL alerts` → `Cycle
complete`. Our D6 triage = the "Identify… (Verint)" step consuming Verint's own
detection; our card/format layer = "Compose & post"; escalation ladder matches
exactly. The demo loops one LOB tab (D5); the full process cycles ~10.

## Decisions (made; flag if you disagree)

- **D1 — Browser: Chromium, persistent profile.** Playwright's `webkit` is not
  real Safari and cannot attach to your current logged-in Safari window. We use
  Chromium with a persistent `user_data_dir`; you log in **once** in that
  profile and the session persists across runs. `--start-logged-in` reuses it.
- **D2 — Card provenance / `dataClass`.** The TS union
  (`POC_Redefined/command-center/src/domain/types.ts`) is
  `"evidence-backed" | "seeded" | "simulated" | "future-integration"` — there is
  **no `"live"`**. For this demo, cards are written to **JSON files only** and
  are **not** imported into React, so we tag them `dataClass: "evidence-backed"`
  (honest: copied from a real live screen) and carry the live-adapter detail in
  `source.*`. If you later want these cards in the React UI, add a new union
  member `"live-capture"` — that is a separate, opt-in TS change (Step 6b).
- **D3 — Single cycle for v1.** One capture = `cycle 1`, empty
  `persistence_map` → first-occurrence severities. Multi-cycle persistence
  (escalation ladder) is a fast follow once single-cycle capture is solid.
- **D4 — Strictly read-only on live production.** This is a live prod WFM system
  with real employees. The agent must **never** click `Edit`, `Purge`,
  `Send Message`, modify an Alert Rule, or take any mutating action. Allow-list
  navigation/read/extract only; the task prompt forbids writes explicitly.
- **D5 — Scope-limit + PII discipline.** Demo against **one LOB / a filtered
  slice** (not all 1000+ agents). Do not persist a mass dump of employee PII or
  any screenshots; keep only the structured rows needed for the captured slice,
  in the run artifacts, and treat them as confidential.
- **D6 — Engine role = TRIAGE layer (chosen 2026-06-03).** Verint already
  detects OOA (the "Out Of Adherence" column). We **consume that verdict** as the
  detection signal; our engine adds the layer the RTA does by hand: severity
  (from OOA duration), escalation tracking across refreshes, LOB→channel routing,
  work-card creation, draft dispatch text, and noise suppression. We do **not**
  re-derive adherence or rebuild Verint's per-LOB rules. Consequence: the
  CIBC-canonical status taxonomy in `alert_thresholds.json` is **not** required
  for the live path; raw LOB activity names (`Zillow_Break 2`, etc.) flow
  straight into the card/message text.

## Current repository status (verified)

### Engine (ready, do not change semantics)
- `POC/07_simulation/engine/alert_engine.py` — `AgentRow`, `AlertResult`,
  `load_thresholds()`, `evaluate_agents(agents, thresholds, persistence_map)`.
  Matches on **exact** `status_from_verint` strings and **integer**
  `duration_seconds`.
- `POC/07_simulation/engine/card_builder.py` — `build_card(result,
  snapshot_time, cycle)`; currently hardcodes `dataClass="simulated"` and a
  synthetic artifact path (must be parameterized — Step 6).
- `POC/07_simulation/engine/alert_formatter.py` — `draft_alert_message()`,
  `lob_channel()`, `recommended_action()`.
- `POC/01_evidence_pack/rules/alert_thresholds.json` — threshold rules.
- `POC/07_simulation/data/sim_snapshot_t0.json` — **the target shape** the live
  capture must reproduce (per-agent objects with `agent_id, agent_name, lob,
  geo, actual_status, scheduled_activity, duration_seconds, adherence_pct, …`).

### Engine contract — the exact strings that make rules fire
`actual_status` and `scheduled_activity` must match the canonical Verint
strings, e.g.:
- time-limited: `INBD - Inbound`, `After Call Work`, `CallOnHold`,
  `Not Ready Outbound`, `NOT READY - TIG Offline`, `Login`, `MEET - Meeting`,
  `COAC - Coaching`, …
- out-of-adherence: `OUTB - Outbound`, `LNCH - Lunch unpaid`, …
- exceptions (never flagged): `BLEN - Blended`, `TECH Issues`,
  `ABSU - Absence Unpaid`, `TRGR - Training Regular`, `Vacation`, …

**If the screen text doesn't normalize to one of these exact strings, no rule
fires and the demo shows zero alerts.** The normalization layer (Step 3) is the
make-or-break component.

### Artifacts to finish
- `POC_Redefined/verint_browser_use_demo.py` — currently lets the LLM write the
  alert (must be reworked to extraction-only).
- `POC_Redefined/docs/VERINT_BROWSER_USE_DEMO.md`,
  `POC_Redefined/docs/HARNESS_FOR_COMPUTER_USE_HOWTO.md` — exist; update.

## Architecture

```
┌─ browser-use Agent (Chromium, persistent profile) ──────────────┐
│  ADHERENCE → Quick View; select one-LOB saved View (≤2500)      │
│  extract grid rows from the "Main Content" frame                │
│  RETURNS: structured JSON only (output schema enforced)         │
│  READ-ONLY — never Edit/Delete/Create/Send (D4)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │  raw rows: name, sched, OOA dur, actual, time, adh%
                           ▼
┌─ verint_normalize.py (pure Python, deterministic) ──────────────┐
│  • "H:MM:SS"/"MM:SS" → seconds (int)   • "78%" → 78.0 (float)   │
│  • raw activity names kept verbatim (no canonical remap, D6)    │
│  • lob from selected View/config, geo from config              │
│  • agent_id = hash(agent_name:lob:geo)                          │
│  RETURNS: list[AgentRow]  (duration_seconds = Verint OOA dur)   │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─ verint_triage.py (NEW — consumes Verint's verdict, D6) ────────┐
│  flag rows where Verint OOA duration > 0 (or > min threshold)   │
│  severity from OOA duration + escalation_cycle                  │
│  → AlertResult (reuses existing dataclass)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
        build_card(live-aware) → draft_alert_message() → lob_channel()
                           ▼
        JSON artifacts + console provenance log  (no React import)
```

The browser agent is swappable; the card/format layer is the existing, unchanged
engine. `verint_triage.py` replaces `evaluate_agents()` for the live path
**without modifying it** — the simulation keeps using `evaluate_agents()`. The
production story: "Verint detects; swap the capture adapter, keep the triage and
dispatch layer."

## Implementation plan

### Step 1 — Discovery (live, together) — **DONE**
Path: `Tracking → ADHERENCE → Quick View`. Supervisor rights; 1000+ agents.
The **Quick View grid** is the extraction target. Confirmed schema:

| Column | Example | Maps to `AgentRow` |
|---|---|---|
| Name | `Avery, Sam` | `agent_name` |
| Scheduled Activity | `Zillow_Email` | `scheduled_activity` (raw, LOB-custom) |
| **Out Of Adherence** | `0:11:07` (red) | **Verint's OOA verdict + duration** |
| Actual Activity | `Zillow_Break 2` | `actual_status` (raw, LOB-custom) |
| Time In Activity | `0:11:07` | `duration_seconds` (after parse) |
| Day's Adherence | `78%` | `adherence_pct` |

Summary block above the grid: `Total Selected / Total In / Out Of Adherence /
Too Long In Activity`. Refresh rate selector (default 5 min). Date/time stamp.

**Key facts that reshape the build:**
- **Verint already detects OOA and time-limit breaches** (the "Out Of Adherence"
  column and "Too Long In Activity" counter). Re-detecting is redundant.
- **Activities are LOB-custom** (`Zillow_Email`, `Zillow_Break 2`, `Zillow_Lunch`)
  — *not* the CIBC canonical strings in `alert_thresholds.json`. Mapping is
  **per-LOB** and central (Step 3). We will not rebuild Verint's adherence rules.
- **Scope:** `View: All Current` dropdown; hard cap *"Maximum of 2,500 shown"* →
  must select a narrower saved View (one LOB) per D5.
- **Safety:** Day Details exposes `Insert/Delete/Edit Time Entry`, `Create
  Record`, `Edit Comments` — never click (D4). Stay on Quick View for capture.
- **Frame:** "Main Content" tooltip suggests the grid is inside a named
  frame/iframe — Playwright must resolve the frame, not just `page`.

Remaining: capture exact selectors/frame name during first scripted run.

### Step 2 — Extraction-only browser agent
Rework `verint_browser_use_demo.py`:
- Chromium, persistent `user_data_dir`; visible (non-headless) for the demo.
- `--start-logged-in` reuses the saved profile; otherwise pause for manual login.
- Navigate `Tracking → ADHERENCE → Quick View`; select a **one-LOB saved View**
  in the `View:` dropdown to stay under the 2,500 cap (D5).
- Resolve the **"Main Content" frame** before reading the grid.
- Task prompt is **navigation + extraction only**, READ-ONLY (D4), ending in:
  "return the rows as JSON matching this schema." Enforce via browser-use
  structured output / controller so the result is parsed JSON, **not** prose.
- Capture raw, per-agent from the grid: `name`, `scheduled_activity_text`,
  `out_of_adherence_text` (the OOA duration), `actual_activity_text`,
  `time_in_activity_text`, `days_adherence_text`.
- Graceful failure: if the grid/frame/selectors aren't found, log page state and
  exit cleanly with an empty list (never crash, never invent rows).

### Step 3 — Normalization layer (new: `verint_normalize.py`)
Pure, deterministic, unit-testable. No network, no LLM.
- `parse_duration(text) -> int` handling `MM:SS` and `H:MM:SS` (e.g. `0:11:07`).
- `parse_pct(text) -> float` (`78%` → `78.0`).
- Activity names kept **verbatim** (no canonical remap — D6).
- `lob` injected from the selected View/config; `geo` from config.
- `agent_id = sha1(f"{agent_name}:{lob}:{geo}")[:12]` (stable across runs).
- `to_agent_rows(raw_rows, lob, geo) -> list[AgentRow]`, where
  `duration_seconds = parse_duration(out_of_adherence_text)` (the alert-relevant
  duration is Verint's OOA duration), `actual_status = actual_activity_text`,
  `scheduled_activity = scheduled_activity_text`,
  `adherence_pct = parse_pct(days_adherence_text)`. Also carry the raw OOA
  seconds explicitly so triage can flag on it.

### Step 4 — Triage via Verint's verdict (new: `verint_triage.py`, D6)
Do **not** call `evaluate_agents()` (that path keys on CIBC canonical statuses).
Instead consume Verint's OOA verdict:
```python
def triage(rows, persistence_map=None):
    persistence_map = persistence_map or {}
    results = []
    for r in rows:
        ooa = r.duration_seconds            # Verint OOA duration
        if ooa <= 0:                        # Verint says in-adherence → skip
            continue
        cycle = persistence_map.get(r.agent_id, 0)
        results.append(AlertResult(
            agent=r,
            rule_type="scheduled_activity_mismatch",
            rule_id=f"verint_ooa_{slug(r.actual_status)}",
            threshold_seconds=None,
            threshold_label="Verint OOA",
            severity=severity_from_ooa(ooa, cycle),  # ladder by duration+cycle
            escalation_cycle=cycle,
        ))
    return results
```
`severity_from_ooa`: cycle≥2 → critical, cycle==1 → high; else by duration
(e.g. ≥20m → high, ≥5m → medium, else low). Reuses the existing `AlertResult`
and `AgentRow` dataclasses; the simulation's `evaluate_agents()` is untouched.

### Step 4b — Validation cross-check (optional, high-value)
Capture the NOTIFICATIONS list for the same LOB + time window (read-only) and
match agents our engine flagged against agents Verint independently flagged.
Report agreement rate. Agreement proves our rules track Verint's ground truth;
divergence is a finding to surface. Read-only; no edits.

### Step 5 — Build cards + draft alerts (live-aware)
- `build_card(result, snapshot_time, cycle=1)` for each result.
- `draft_alert_message(result)` for the mock dispatch text.
- `lob_channel(result.agent.lob)` for the channel mapping.

### Step 6 — Make `card_builder` live-aware (minimal, surgical change)
`build_card` currently hardcodes simulated provenance. Parameterize the source
block without changing existing simulated behavior:
- Add optional args (default to current simulated values):
  `data_class="simulated"`, `source_label=None`, `source_detail=None`,
  `source_artifact=None`, `card_id_prefix="sim"`.
- Live call passes `data_class="evidence-backed"` (per D2),
  `source_label="Live Verint browser adapter | cycle 1 | rule: <id>"`,
  `source_detail="DOM extraction from wfo.a87.verintcloudservices.com → "
  "normalize.py → rule engine. Adapter swappable for Verint REST/OCR/webhook."`,
  `source_artifact="live-capture <ISO timestamp>"`, `card_id_prefix="live"`.
- `auditEvents[].dataClass` follows the same `data_class`.
- **Regression guard:** existing simulation callers pass nothing → identical
  output to today. Verify the two `sim_snapshot` runs are byte-identical before
  and after.

#### Step 6b (optional, deferred) — React-importable live cards
Only if you want live cards in the UI: add `"live-capture"` to the `DataClass`
union in `command-center/src/domain/types.ts` and switch D2 to use it. Out of
scope for v1.

### Step 7 — Provenance / narrative logging
Emit a clear, ordered log (console + `runs/<timestamp>.log`):
```
Navigated to Verint (wfo.a87...)
Located RTA grid via <path>
Extracted N rows from DOM
Normalized: K matched canonical statuses, U unknown (logged)
Mapped LOB=<lob> GEO=<geo>; generated stable agent_ids
Evaluated: M alerts (rule_id, severity) of N agents
Built M live cards (dataClass=evidence-backed, source=live adapter)
Drafted M mock dispatch messages → channel <name>
Wrote artifacts: runs/<timestamp>/cards.json, alerts.json
```
No secrets in logs. No raw screenshots persisted (transient debug only).

### Step 8 — Preserve existing POC
Do **not** modify (unless Step 6b is explicitly chosen):
- `command-center/src/App.tsx`, `hooks/useLiveEngine.ts`, `data/fixtures.ts`,
  `data/scenarios.ts`.

### Step 9 — Docs
- `VERINT_BROWSER_USE_DEMO.md`: why browser-use; Python 3.11; install
  (`browser-use`, `playwright`, `langchain-anthropic`; `playwright install
  chromium`); Chromium-persistent-profile login; run steps; the Step-1 selector
  notes; security notes; the **extract-only / Python-decides** principle.
- `HARNESS_FOR_COMPUTER_USE_HOWTO.md`: add the live-browser path; Chromium safe
  path; **Safari not drivable via Playwright** (D1); no-raw-screenshot rule.
- `NEXT_STEPS.md`: note browser-use is the early demo-only live adapter.

### Step 10 — Verify & validate
1. Existing React POC runs unchanged.
2. `sim_snapshot` engine output byte-identical pre/post Step 6 (regression).
3. `verint_normalize.py` unit tests pass (status/duration/pct/agent_id).
4. Playwright launches Chromium; persistent login works; `--start-logged-in`
   reuses session.
5. Agent selects a one-LOB View, resolves the frame, returns **parsed JSON**.
6. Normalization yields ≥1 `AgentRow` with OOA duration parsed to seconds.
7. `verint_triage` yields `AlertResult`(s) for rows Verint marked OOA.
8. `build_card` emits live-provenance cards; `draft_alert_message` produces text.
9. Logs show navigation + extraction + provenance.
10. All new behavior isolated from `command-center`.

## Risks and mitigation

- **Account only exposes "My Adherence" (single agent).** → Demo still proves
  the pipeline on one agent; multi-agent depends on Tracking rights (Step 1).
  State this honestly in the narrative.
- **Status text ≠ canonical string → zero alerts.** → Explicit `STATUS_ALIASES`
  seeded from Step 1; log unknowns; unit-test the map. (Highest-priority risk.)
- **Can't drive the live Safari session.** → Chromium persistent profile (D1).
- **LLM tempted to invent alerts.** → Extraction-only schema; Python does all
  alerting; assert the agent returns data, not prose.
- **`dataClass` type violation.** → Use `"evidence-backed"` + JSON-only output;
  React import is opt-in via Step 6b only.
- **Selectors brittle / page virtualized.** → Prefer role/text selectors;
  graceful failure with page-state capture; no crash.
- **Secrets / screenshots leak.** → `.env` only; structured logs; no persisted
  screenshots.
- **Regressing the funded simulation demo.** → Step 6 is additive with
  defaults; byte-identical regression check (Step 10.2).

## File-level tickets

1. `POC_Redefined/verint_browser_use_demo.py` — extraction-only agent
   (Chromium persistent profile, one-LOB View, frame-aware, structured-JSON
   output, READ-ONLY, graceful failure).
2. `POC_Redefined/verint_normalize.py` *(new)* — duration/pct parsing, lob/geo
   injection, stable `agent_id`, `to_agent_rows()` (OOA dur → `duration_seconds`).
3. `POC_Redefined/verint_triage.py` *(new, D6)* — consume Verint OOA verdict →
   `AlertResult`; `severity_from_ooa()`. Does not touch `evaluate_agents()`.
4. `POC_Redefined/verint_pipeline.py` *(new)* — glue: capture → normalize →
   triage → cards → drafts → write artifacts + provenance log.
5. `POC/07_simulation/engine/card_builder.py` — parameterize provenance
   (additive, defaults preserve simulated output).
6. `POC_Redefined/tests/test_verint_normalize.py` + `test_verint_triage.py`
   *(new)* — unit tests (duration parsing, OOA flagging, severity ladder).
7. `POC_Redefined/docs/VERINT_BROWSER_USE_DEMO.md` — setup/run/selectors/security.
8. `POC_Redefined/docs/HARNESS_FOR_COMPUTER_USE_HOWTO.md` — live path, Safari/D1.
9. `POC_Redefined/docs/NEXT_STEPS.md` — note the demo-only live adapter.

## Summary

The destination is right and the engine is ready. This revision fixes the two
blockers from the prior draft — **(a)** the agent now extracts only and the
existing rule engine generates every alert, and **(b)** live cards use a legal
`dataClass` and JSON-only output. It adds the missing **normalization layer**
(the real make-or-break piece) and grounds the navigation in the **confirmed
live instance**, starting with a short discovery step to locate the multi-agent
RTA grid under Tracking.
