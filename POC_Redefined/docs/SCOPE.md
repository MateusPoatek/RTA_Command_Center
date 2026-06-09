# Scope — What Is In and Out of Scope

> This document is the honesty contract for the POC.
> It tells engineers and stakeholders exactly what was built, what was simulated,
> and what still needs to be done before this can go to production.

---

## In scope (what this POC demonstrates)

### UI and UX
- ✅ A React web app with a command centre layout (priority feed + process tabs).
- ✅ A card system that represents every RTA operational task as a structured object.
- ✅ Four complete demo scenarios (Steady State, Queue Spike, Attendance Crisis, Tech Outage).
- ✅ A live simulation engine (scan pulse, card injection, autonomous AI mode).
- ✅ A Copilot panel with real AI streaming (FuelIX API).
- ✅ A shift briefing modal, close-shift readiness score, and handoff document.
- ✅ A learning strip that visualises how RTA decisions improve AI confidence.
- ✅ A dispatch log that records every alert sent (by RTA or AI) during the shift.

### Data and rules
- ✅ Six RTA workflows modelled as card types, lanes, and process tabs:
  1. RT Adherence Monitoring (15-min cycle)
  2. LOB Health and Coaching/Huddle Approval (SL gates)
  3. Attendance Reporting (dynamic cadence — repeated whenever significant GTT data is available; not a fixed 3-hour timer)
  4. ServiceNow Ticket Processing
  5. Outage Detection and Response
  6. Shift Start/End and Handoff
- ✅ Evidence-backed data from the April 28 shadowing session (status codes, agent names, durations).
- ✅ Alert thresholds from the ABD documents (COAC > 30 min, hold > 3 min, SLA gates).
- ✅ Line health codes (GREEN/YELLOW/RED/BLUE) with corresponding RTA guidance.

### AI
- ✅ Streaming Copilot responses via FuelIX API (OpenAI-compatible).
- ✅ Three Copilot actions: explain card, recommend action, improve draft.
- ✅ Learning signal generation (every card action → confidence adjustment).
- ✅ Autonomous mode (AI acts without RTA click — demo only).

---

## Out of scope (what this POC does NOT do)

### Live data connections
- ❌ **Verint API integration** — all agent data is seeded or simulated. No real Verint connection. Note: Verint is accessed via client VDI in production; see `ATTENDANCE_PROCESS.md` for the VDI constraint.
- ❌ **Google Chat webhook** — "Send alert" updates the dispatch log but does not send a real message.
- ❌ **Microsoft Teams Bot** — "Teams Workforce" channel is a label only; no real Teams message.
- ❌ **Workday integration** — attendance absence records are seeded. No real Workday export.
- ❌ **GTT (Genesys Telecom Tool) integration** — intraday agent login data is seeded. No real GTT report download or import. GTT is the primary real-time attendance data source used in production.
- ❌ **Google Sheets + Apps Script pipeline** — the Justifications file, Attendance file, and Apps Scripts that run the attendance process are not replicated. The POC seeds attendance numbers directly.
- ❌ **Data Studio / Looker integration** — dashboard refresh is not modelled. The POC does not generate or capture dashboard screenshots.
- ❌ **ServiceNow REST API** — "Open ticket" creates a card entry but does not create a real SNOW ticket.

### AI and ML
- ❌ **Real fine-tuning** — learning signals adjust a local counter, not a real model.
- ❌ **Production OCR pipeline** — the Verint Capture simulation does not call a real OCR service.
- ❌ **LOB-specific model training** — the baseline OCR test showed 0/8 LOB code matches. A production model needs CIBC-specific training data.

### Security and operations
- ❌ **Authentication / SSO** — there is no login. Any browser can open the app.
- ❌ **Role-based access control** — no RTA vs supervisor vs OM permissions.
- ❌ **Immutable audit log** — audit events are in-memory React state. They reset on page reload.
- ❌ **Production deployment** — no CI/CD pipeline, no container, no cloud hosting.
- ❌ **Accessibility audit** — some components have basic ARIA labels but no full WCAG 2.1 AA review.

### Multi-RTA and scheduling
- ❌ **Multi-RTA coordination** — the app is designed for one RTA session. No real-time sync between RTAs. In production, the Guatemala RT and Philippines RT run parallel workflows that must be coordinated (see `ATTENDANCE_PROCESS.md`).
- ❌ **Scheduling system integration** — schedule data is seeded. No connection to Aspect or IEX.

---

## Data honesty labels

Every card, metric, and number in the demo is tagged with one of these four labels.
**Engineers must not confuse demo data with real operational data.**

| Label | What it means | Example |
|-------|--------------|---------|
| `evidence-backed` | Directly from a real document or screenshot. | Diego Salazar COAC 0:32:00 (screenshot_07) |
| `seeded` | Invented to complete the demo. Plausible, not verified. | "TLB SLA 67%" — typical RED scenario value |
| `simulated` | Generated at runtime. Changes every session. | Card status advancing from "detected" to "classified" |
| `future-integration` | Would come from a system not yet connected. | ServiceNow ticket ID "INC-20481" |

These labels are visible in the card detail panel and in the codebase on every data object.
Use them to answer the question: "Is this number real?"

---

## What was NOT tested

- The Copilot panel was not tested with a production FuelIX key in a CIBC network environment.
- The OCR capture simulation has a known closure bug (see `src/components/CaptureModal.tsx`) that affects the scan animation on screens 2 and 3.
- The export functions in `src/utils/export.ts` are implemented but not wired to any UI button.
- The shift score model weights (in `src/utils/score.ts`) are illustrative and not validated against real shift quality data.

---

## See also

- [ATTENDANCE_PROCESS.md](./ATTENDANCE_PROCESS.md) — canonical end-to-end attendance process (source of truth)
- [PAIN_POINTS.md](./PAIN_POINTS.md) — the problem this solves
- [SOLUTION.md](./SOLUTION.md) — what was built
- [NEXT_STEPS.md](./NEXT_STEPS.md) — how to go from POC to production
