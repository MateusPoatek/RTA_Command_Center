# Floor View — Changelog / Journal

*The narrative of the Floor View initiative — what we did, why, and what we learned, dated. Newest first.*

## 2026-06-11 — Gate passed; live derivations; config menu; tests; review

A big day. The gate that blocked everything is now green, and we built on it.

- **🟢 GATE PASSED (live Verint).** Verint honours a `workResourceIds` set we compose ourselves: V2 cross-page
  **10/10**, V3 cross-LOB **6/6**, V4 single-LOB **12/12** — all `201`, ~0.7s, no rate-limiting. The attention-driven,
  LOB-scoped refresh scheduler ([ADR-0003](docs/decisions/0003-two-tier-lob-scoped-refresh.md)) is **proven**, not
  hypothetical. Record: [dry_run/results_template.md](dry_run/results_template.md).
- **Won the gate via the extension, not the console** ([ADR-0005](docs/decisions/0005-probe-via-extension-not-console.md)):
  added a read-only probe runner to `inject.js` that re-fires body-rewritten reads from its authenticated MAIN-world
  context. Fixed the latent bug that `lastCalReq` was only captured from `fetch` (calendar-filter is XHR → it was
  always null). Found **F1**: a broad census = 21,501 rows / 88s while targeted pulls stay sub-second — empirical
  proof that census must be rare + tightly bounded.
- **Mapped what Verint gives us** ([VERINT_EXTRACTION_CAPABILITIES.md](docs/VERINT_EXTRACTION_CAPABILITIES.md)) against
  the four leadership values: Adherence ✅ + Real-Time Alerts ✅ ready; Shift Open/Close + Productive Hours (Evelyn
  Brooks) ⚠️ derivable; Daily Attendance ⚠️ partial → ✅ when GTT lands. Noted the **Load Contract Rules** constraint
  (paid/productive is client-defined; 5 contract types, not yet in hand).
- **Audited the Command Center** ([COMMAND_CENTER_LIVE_DATA_AUDIT.md](docs/COMMAND_CENTER_LIVE_DATA_AUDIT.md)): ~60%
  wireable to live Verint data; telephony KPIs need ACD, tickets need ServiceNow.
- **Quick win (B):** `parse.js` now field-merges census + targeted and derives **adherence %**, **shift open/close**,
  **productive minutes** → live cards show real values (was hardcoded 0). Surfaced in CopilotPanel.
- **Config-panel menu (A)** ([CONFIG_PANEL_MENU.md](docs/CONFIG_PANEL_MENU.md)): the checkbox spec the RTA/Scheduling
  team refines — every toggle tagged by data availability so we never promise un-sourced data.
- **Health:** added golden tests for `parse.js` (the untested live data path); ran an adversarial code review and
  hardened the derivations (string-boolean flags, Date-value time compare, no misleading 0-minute shift) + documented
  the probe's known limitations; wrote [PARSER_PARITY.md](../docs/PARSER_PARITY.md) ledger for the JS↔Python divergence.

## 2026-06-10 — Design, docs, and the console dead-end

- Reshaped Mateus's "gamified floor" idea into a **spatial radar** (stillness-is-the-reward; state-not-scoreboard) +
  the **two-tier LOB-scoped refresh** insight (the map tells the RTA where to look; where they look tells the system
  what to fetch). Captured in README + DESIGN + REFRESH_ARCHITECTURE + ADRs 0001–0004.
- Built the console probe harness (`floor_probe.js`) and attempted the gate live. **Hit a wall:** console replay
  401s — the app fires from a frame the console can't reproduce, and the auth token rotates before a manual
  paste-and-fire. Confirmed the request shape + auth model along the way. Concluded: the console is the wrong
  instrument (→ next day's extension approach).

## 2026-06-09 — The idea

- Mateus proposed a gamified "Floor View." Pressure-tested together; agreed to prove the one unknown (self-composed
  `workResourceIds`) before building any UI. Scaffolded `floor_view/` on branch `feat/floor-view`.

---

*Branch `feat/floor-view` commits: probe + design docs → live derivations + discovery docs → config menu → parser
tests → review hardening. Nothing pushed yet.*
