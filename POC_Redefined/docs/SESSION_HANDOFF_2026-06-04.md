# RTA Automation — Session Handoff & Knowledge Log (2026-06-04)

> Master record of the live computer-use endeavor: what we built, what we
> learned, what worked, what's still open. Written to be read, understood, and
> extended by other AIs/engineers ahead of the POC→production handoff.
> Companions: `COMPUTER_USE_ENDEAVOR_LOG.md`, `CAPTURE_AND_DISPATCH_ADAPTERS.md`,
> `FUTURE_FEATURES.md`, `../Computer_Use_Plan_0603.md`.

## 1. Goal & outcome

**Goal:** prove an AI can use *live Verint* to generate the alerts/cards the RTA
Command Center is built around — without GScript connectors, Citrix integration,
or a Verint API project.

**Outcome: achieved.** End-to-end, on real data:

```
Live Verint (EPIC account, browser)
  → capture Verint's OWN calendar API (network capture / browser extension)
  → parse schedule + adherence (Verint's own planned-vs-actual verdict)
  → triage → CommandCards (evidence-backed) + draft LOB-chat messages
  → RTA Command Center: priority feed → card detail → copilot → dispatch
```

Two capture mechanisms proven:
- **`netcap`** (Playwright network capture) → `verint_calendar_parse.py` →
  `scenario_from_capture.py` → "Live — EPIC" scenario in the Command Center.
- **Browser extension** ("RTA Live Bridge") → captures in the RTA's own browser →
  live-bridges cards into the Command Center (Playwright-verified).

## 2. The decisive insight

Verint's calendar Gantt is an **SVG** — vision/DOM scraping it failed (the agent
got stuck). The breakthrough was to **stop reading the picture and read the data
that draws it**: the SPA fetches `/api/wfm/main/v2/calendar-filter`, whose
`resourceData[]` contains, per employee, `actualSchedule.events[]` **and**
`adherence.violations[]` (Verint's own out-of-adherence verdict: planned activity
vs actual, with exact times). We tap that feed. It's exact, complete, and is
literally Verint's ground truth.

**Separate "how it's drawn" (pixels — hard) from "what data the app received"
(JSON — clean). Capture the second.** This is the core reusable principle.

## 3. Approaches explored (and verdicts)

| Approach | Verdict |
|---|---|
| browser-use agent composes the alert text | ❌ Rejected — alerts must come from the deterministic engine, not the LLM (auditability). |
| OCR on screenshots (original Vision Agent) | ⚠️ Baseline only — status 100% but LOB 0%, table reconstruction unsolved. Justified going DOM/API. |
| browser-use agent vision/DOM-scrapes the SVG Gantt | ❌ Dead end — got stuck walking the SVG. |
| browser-use agent does navigation + structured extraction | ⚠️ Works to navigate/login, but extraction of the SVG is unreliable. |
| **netcap — capture the calendar's own JSON API** | ✅ **Win.** Exact schedule + adherence. |
| **Browser extension capturing the same API in-browser** | ✅ Built + bridge verified; live-Verint capture step pending a real login test. |
| Verint REST API ("Track B") | 🔓 Cleanest if CIBC grants a credential; not pursued (no credential). |

## 4. Key technical findings (carry these forward)

- **Tenant:** `wfo.a87.verintcloudservices.com` is **TELUS's** Verint, serving
  many clients (EPIC/Zillow/TikTok/Etsy/… AND CIBC). It is a **direct web app** —
  which is why the browser-native approach works. CIBC's own data (Cards/Costco/
  ITR/TLB) lives in this same tenant.
- **The schedule/adherence endpoint:** `/api/wfm/main/v2/calendar-filter` →
  `data.attributes.resourceData[]` → per employee `id`, `actualSchedule.events[]`
  (`activityId`,`startTime`,`endTime`,`durationMinutes`), `adherence.violations[]`
  (`plannedActivityName`, `actualEventData[].label`, `startTime`/`endTime`,
  `employeeId`). Join names via `/api/wfm/main/v1/work-resources`, activity names
  via `/api/wfm/main/v1/activities`.
- **`"Deleted Timeline"`** as an actual = no recorded actual (future/untracked) —
  filtered out of alerts.
- **FuelIX** (`https://api.fuelix.ai/v1`, OpenAI-compatible) is the sanctioned LLM
  gateway — Claude Sonnet 4.6 confirmed. No direct Anthropic key needed.
- **Citrix is the boundary condition** — see §6.
- **Demo gotchas that cost us time:** browser-use launched Brave (default browser)
  until `executable_path` was pinned; Verint session cookies die on browser close
  (login + capture must share one session); a 57h-stale Vite dev server cached old
  source (new scenarios need a server restart, not just a browser reload).

## 5. What's proven vs open

**Proven / tested:**
- Python pipeline: `verint_normalize` + `verint_triage` + `card_builder`
  (live-aware) + `verint_pipeline` — **44 unit tests pass**.
- `verint_calendar_parse.py` on real captured EPIC data → 48 violations → cards.
- Command Center integration ("Live — EPIC") — tsc green, scenarios A–D
  byte-identical (diff-verified), reversible (backups).
- Extension `parse.js` — node-tested vs the real capture (12 cards, valid contract).
- Extension→Command Center **bridge** — Playwright-verified (banner + real cards
  render, 0 console errors).

**Open / not yet done:**
- **Live-Verint extension capture** — only testable with a real Verint login
  (Dione/Mateus). The capture hook is written but unproven against the live page.
- **Citrix path** for real CIBC (if direct web access isn't available).
- **Tests missing** for `verint_calendar_parse.py`, `scenario_from_capture.py`,
  `parse.js` (the newest code).
- **Parser duplicated** in Python and JS (extension) — unify for production.
- **Secrets:** the FuelIX key is hardcoded in run commands + in chat/memory →
  **rotate** and move to `.env`.
- **PII:** `runs/netcap/*` holds real employee data unencrypted → retention policy.
- **Version control:** this working folder is **not** a git clone of
  `git@github.com:MateusPoatek/rtacommandcenter.git` (no `.git`). Reversibility
  today is via manual `*.bak` backups.
- **WebSocket data** (if any real-time stream exists) is not captured.

## 6. Citrix (the production access question)

`netcap`/the extension read Verint's network traffic **in the local browser**.
Under Citrix, Verint runs on a **remote server**; only **pixels** reach the
laptop — so there is no local API traffic to capture. Options, in order of
preference:
1. **Get direct web access** to Verint (it's a web app; Citrix is often an access
   wrapper, not a technical wall). Dissolves the problem — push this first.
2. **Run the capture server-side** (extension/agent inside the Citrix-published
   browser). Needs CIBC IT.
3. **Vision/OCR on the pixel stream** (original Vision Agent) — only local-only
   option; lower fidelity.
4. **Verint REST API** — cleanest if a credential is granted.

**Verify first:** can a CIBC RTA open Verint as a web URL? The answer dissolves or
scopes the whole Citrix question.

## 7. Code map (where everything lives)

Python pipeline (`POC_Redefined/`, runs on `.venv` 3.9):
- `verint_normalize.py` — screen/text → `AgentRow` (parse durations/%, stable ids).
- `verint_triage.py` — consume Verint's OOA verdict → `AlertResult` (severity ladder).
- `verint_calendar_parse.py` — netcap dir → schedule + adherence → cards.
- `verint_pipeline.py` — capture(JSON) → normalize → triage → cards → artifacts.
- `scenario_from_capture.py` — curate cards → write `scenarios_epic.ts`.
- `verint_browser_use_demo.py` — `login`/`extract`/`live`/`netcap` modes.
- `tests/` — 44 unit tests (normalize/triage/card_builder/pipeline).

Engine (`POC/07_simulation/engine/`, unchanged semantics):
- `alert_engine.py`, `card_builder.py` (now live-aware, additive), `alert_formatter.py`.

Browser extension (`POC_Redefined/verint_extension/`):
- `manifest.json`, `inject.js` (MAIN-world capture), `content_verint.js`,
  `background.js` (parse + relay), `content_cc.js` (inject), `parse.js` (JS port),
  `popup.*`, `README.md`, `BRIDGE_TEST.js` (console test snippet).

Command Center (`POC_Redefined/command-center/`, additive + backed up):
- `src/data/scenarios_epic.ts` (NEW, generated), `src/hooks/useExtensionBridge.ts`
  (NEW), `src/App.tsx` (+import, +hook call, +LIVE banner), `src/data/scenarios.ts`
  + `src/domain/scenario_types.ts` (registry edits). Backups: `*.bak`.

## 8. Handoff readiness checklist

- [x] End-to-end proven on real data (two capture mechanisms).
- [x] Code documented (docstrings/comments); this handoff + adapter + future docs.
- [ ] Rotate FuelIX key; move secrets to `.env`.
- [ ] PII retention policy for `runs/`.
- [ ] Tests for `verint_calendar_parse.py`, `scenario_from_capture.py`, `parse.js`.
- [ ] Unify the duplicated parser (one source of truth).
- [ ] Reconcile git (link to `rtacommandcenter` with a PII-safe `.gitignore`).
- [ ] Live-Verint extension capture dry-run with a real login.
- [ ] **Invoke the agentic council** at handoff start (see project memory standing
      decision) to produce: architecture spec, security/PII audit, test strategy,
      production doc set + browser recommendations.

## 9. One-line truth for stakeholders

> "We proved an AI can read **real, live Verint adherence data** and turn it into
> the RTA Command Center's work cards — using only the browser the RTA already has
> open. The browser extension is **one** of several interchangeable ways to do the
> capture and dispatch; the rules/cards engine stays the same underneath."
