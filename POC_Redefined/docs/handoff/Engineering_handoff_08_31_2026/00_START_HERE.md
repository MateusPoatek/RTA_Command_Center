# Engineering Handoff Index — 2026-08-31

Reading list for the incoming engineering team, verified against the current working tree (not just the last commit — several core files are mid-edit as of this date). Each entry says what to read it for, and whether it's current or has a known gap. Read the ⚠️ caveats before the doc itself, not after — they change how the doc should be read.

This folder is a self-contained copy of all relevant docs + rendered diagrams — everything linked below lives inside this folder, no need to go hunting through the repo.

## 1. Floor View

Read in order:
1. [`floor_view/README.md`](floor_view/README.md) + [`floor_view/DESIGN.md`](floor_view/DESIGN.md) — design intent and radar metaphor.
2. [`floor_view/REFRESH_ARCHITECTURE.md`](floor_view/REFRESH_ARCHITECTURE.md) — two-tier census/targeted-pull refresh engine, rate budget, backoff (ADR-0004). **Current** against `verint_extension/inject.js`.
3. [`floor_view/decisions/`](floor_view/decisions/) — ADRs 0003 (census/cross-LOB composition) and 0005 (console-probe abandoned) — both current.
4. Code (not copied here, read in the repo): `command-center/src/components/FloorView.tsx` — the actual UI, wired into `App.tsx:76,337-338,843-851`.

⚠️ **Caveats — say these out loud, don't let the team read the docs at face value:**
- `README.md` line 7-8 says "No interface code yet — deliberately so." **This is false.** FloorView.tsx is built and live. The README's own Phase-3 checklist item is still unchecked; CHANGELOG.md predates the UI build (last entry 2026-06-11).
- The UI and the refresh engine described in REFRESH_ARCHITECTURE.md are **not actually wired together**. The two-tier engine only runs inside the standalone extension's "Full Capture" flow (`popup.js`); the Command Center's `useLiveEngine.ts` has no census/targeted-pull logic. FloorView.tsx is explicit in its own header comment that it's a "FIRST SLICE" — calm-count is a sampled proxy from `lobHealth`, not the full roster.
- No dedicated Mermaid diagram exists for Floor View — only prose docs.
- [`floor_view/IDEAS_BACKLOG.md`](floor_view/IDEAS_BACKLOG.md) is explicitly speculative (says so in its own header) — don't present it as scope.

Also included for reference (not required reading, but useful if questions come up): [`floor_view/COMMAND_CENTER_LIVE_DATA_AUDIT.md`](floor_view/COMMAND_CENTER_LIVE_DATA_AUDIT.md), [`floor_view/CONFIG_PANEL_MENU.md`](floor_view/CONFIG_PANEL_MENU.md), [`floor_view/DRY_RUN_PROTOCOL.md`](floor_view/DRY_RUN_PROTOCOL.md).

## 2. Attendance / GTT Report

Read in order:
1. [`attendance_gtt/REPORT_SCHEMA.md`](attendance_gtt/REPORT_SCHEMA.md) — schema of the GTT×Verint reconciliation report.
2. [`attendance_gtt/ATTENDANCE_PROCESS.md`](attendance_gtt/ATTENDANCE_PROCESS.md) — the manual legacy CBC process this replaces (Workday/Sheets/GTT/Verint-via-VDI). Different audience from #1 — process, not schema.
3. Code (not copied here, read in the repo): `gtt_adapter.py`, `gtt_verint_reconciler.py`, `report_intelligence.py`, `local_api.py`.

✅ **Verified fully current** — REPORT_SCHEMA.md was edited in the same session as the reconciler (+99/-16 doc, +244 code) and every field claim checked (ooa_seconds/ooa_minutes, scheduled_minutes source, not_yet_scheduled logic, discrepancy_count exclusions, surname-join rule, fuzzy_match_available, hourly_attendance bucketing) matches the working tree exactly, including UI field names end to end. The "restart local_api.py after edits" operational note is still accurate (no `reload=True`).

## 3. Verint Capture Layer (browser extension)

Read in order:
1. [`verint_capture/RTA_EXTENSION_MASTER_BRIEF.md`](verint_capture/RTA_EXTENSION_MASTER_BRIEF.md) — the authoritative architecture doc: MAIN-world XHR hook (inject.js) → content_verint.js bridge → background.js (MV3 service worker) → parse.js → Command Center → local_api.py. Full swimlane diagram included.
2. [`verint_capture/VERINT_EXTRACTION_CAPABILITIES.md`](verint_capture/VERINT_EXTRACTION_CAPABILITIES.md) — complementary: Verint API data/field inventory, not code mechanics.
3. [`verint_capture/README.md`](verint_capture/README.md) — operator quickstart (install/demo).

⚠️ **Real gap, not a nit**: the extension shipped a completed, uncommitted feature the master brief doesn't cover at all (7 files, +299/-11, tests included):
- **"Full Capture"** — a new one-click automated census+targeted capture (`runFullCapture()` in inject.js). This is **active polling**, which contradicts the brief's central safety claim (§2.1/§3.1) that the mechanism is a passive tap. This distinction matters for risk sign-off — say it explicitly.
- **Multi-account/LOB selector** (`activeLob` replacing hardcoded `"EPIC"`) — also removed the per-agent card cap (`target: 200` → `Infinity`), which contradicts brief §4.2's "max 2 cards per agent" claim.
- New parse.js field derivations (scheduled shift, hourly buckets, adherence/violation minutes) extend past the documented field contract.

## 4. Overall Command-Center / Platform

Read in order:
1. Diagrams (rendered as PNG, source `.mmd` also included) — [`platform/diagrams/command-center-integration-topology.png`](platform/diagrams/command-center-integration-topology.png), [`platform/diagrams/command-center-infrastructure.png`](platform/diagrams/command-center-infrastructure.png), [`platform/diagrams/verint-extension-dataflow.png`](platform/diagrams/verint-extension-dataflow.png).
2. [`platform/BRD_RTA_Command_Center_Phase1.md`](platform/BRD_RTA_Command_Center_Phase1.md) — scope, HITL gate concept, Out-of-Scope table (ServiceNow/Workday/Teams — still accurate, still just type-level placeholders in code).
3. [`platform/WFM_SAAS_MULTI_TENANT_ARCHITECTURE.md`](platform/WFM_SAAS_MULTI_TENANT_ARCHITECTURE.md)
4. [`platform/engineering/`](platform/engineering/) — PRD, API spec, security, deployment, connector catalog.

⚠️ **Contradiction to flag explicitly — don't let this slide**: BRD §6 (line 384) states "Single-tenant deployment... no data commingling between accounts." The current uncommitted `App.tsx` implements a multi-account switcher that holds multiple accounts' cards in **one shared state**, filtering only client-side per render. That's commingled storage with UI-level separation, not instance isolation. Anyone taking BRD §6 at face value would be wrong about the current build.

⚠️ **Diagrams are stale on dispatch flow**: the `.mmd` diagrams show immediate dispatch on approval. Code now batches approved alerts (`flushBatch()`, every `batchIntervalMinutes`, chunks of 25) — a real behavioral change, not cosmetic. The diagrams' AI-layer labels ("ANA Bot," "Alert Rules Engine") also don't match the actual code surface (`fuelixClient.ts` + `CopilotPanel.tsx`) — likely aspirational naming, worth a one-line correction rather than treating as broken.

⚠️ **Undocumented new product behavior** (not bug fixes — call these out as "shipped, not yet written up"): per-account switcher, dispatch batching, per-shift dedup (`actionedKeysRef`/`cardIdentityKey`), grouped priority cards ("× N agents").

---

## Summary for the meeting

- **Attendance/GTT**: hand over as-is, fully verified current.
- **Floor View, Verint capture, Platform**: docs are real and mostly good, but each has at least one concrete place where the doc is stale or the code has outrun it. None of this reflects a rushed or undocumented codebase — comments throughout are WHY-not-WHAT and no TODO/FIXME markers exist anywhere in scope (see morning code-annotation audit). This is the normal state of docs lagging a fast-moving final week, not a red flag — but say it out loud so the new team doesn't inherit false assumptions from README status lines or BRD scope claims that are no longer true.
