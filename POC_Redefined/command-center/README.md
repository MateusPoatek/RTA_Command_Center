# RTA Command Center — Developer Guide

> **This is a proof of concept (POC), not a production system.**
> All data is either evidence-backed (from April 28 shadowing), seeded (invented but plausible), or simulated at runtime.
> See [docs/SCOPE.md](../docs/SCOPE.md) for a clear list of what is real and what is simulated.

---

## What is this?

The RTA Command Center is a React web app that demonstrates how an AI agent could change the daily work of a Real-Time Analyst (RTA) at CIBC.

An RTA monitors 200–260 agents across two sites (Guatemala and Philippines) and responds to adherence violations, service-level alerts, and reporting deadlines — all at the same time, every 15 minutes.

Today, RTAs type every message by hand in Google Chat, switch between 5+ tools, and manage everything with mental tracking. This POC shows what changes when the AI does the watching and the typing, and the RTA just reviews and decides.

---

## Quick start

### Requirements

- Node.js 18+
- npm 9+

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables template
cp .env.example .env.local

# 3. Fill in your FuelIX API key in .env.local (optional — AI features disabled if blank)

# 4. Start the dev server
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## How to run the demo

When the app loads, you see the **Shift Briefing** modal. Press **Start shift** to begin.

### Four scenarios

Use the scenario picker in the top bar to switch between:

| Scenario | Name | What it shows |
|----------|------|---------------|
| A | Steady State | Normal shift. AI handles routine volume. Confidence grows as RTA approves. |
| B | Queue Spike | RED/BLUE line health. AI escalates to supervisor and OM correctly. |
| C | Attendance Crisis | Morning attendance at 71%, near the 70% threshold. AI alerts early. |
| D | Tech Outage | Fraud ITR WDE outage. AI runs the full incident playbook automatically. |

### Demo modes

| Button | Effect |
|--------|--------|
| **Live Demo** | Turns on two simulation loops: scan pulse every 3s, new card every 15s. |
| **Auto mode** | AI acts autonomously every 5–8s without waiting for the RTA to click. Shows the "future state" where AI handles routine alerts end-to-end. |
| **Capture Verint** | Simulates the AI reading the Verint screen via OCR and extracting exceptions as cards. |

### Recommended demo flow (15 minutes)

1. Press **Start shift** → point at the briefing (AI prepared this automatically).
2. Select **Scenario B** (Queue Spike) → show RED LOB health.
3. Click a critical card → show the Copilot panel (Why / Recommend / Draft).
4. Press **Approve send** → show the dispatch log update.
5. Press **Escalate** on a coaching card → show the escalation chain.
6. Switch to **Scenario D** (Tech Outage) → show the incident playbook.
7. Enable **Auto mode** → watch the AI act without clicks.
8. Press **Close shift** → show the readiness score.

---

## Codebase reading order

Read files in this order to understand the system from the ground up:

```
1. src/domain/types.ts          — DataClass, CommandCard, ProcessId, LearningSignal
2. src/domain/scenario_types.ts — Scenario, DispatchEntry, AttendanceReportData
3. src/shared/constants.ts      — all timing values and business thresholds
4. src/shared/channelConfig.ts  — single source for channel labels
5. src/data/fixtures.ts         — seed data for the default state
6. src/data/scenarios.ts        — the 4 demo scenarios (A, B, C, D)
7. src/hooks/useLiveEngine.ts   — simulation engine (scan, cards, auto mode)
8. src/hooks/useCycleClock.ts   — 15-minute cycle countdown
9. src/utils/cardHelpers.ts     — sorting, labels, copilot text
10. src/utils/score.ts           — shift close scoring
11. src/services/fuelixClient.ts — FuelIX streaming API client
12. src/App.tsx                  — root orchestrator (all state lives here)
13. src/components/CommandBar    — top chrome
14. src/components/PriorityFeed  — left panel (40%)
15. src/components/ProcessView   — right panel (60%)
16. src/components/CopilotPanel  — inline AI assistant
```

---

## What each data class label means

Every card, agent, and number in the demo is tagged with one of four labels:

| Label | Meaning | Example |
|-------|---------|---------|
| `evidence-backed` | Copied directly from a real Verint screenshot or document. Treat as real. | Diego Salazar's COAC status at 32:14 (screenshot_07) |
| `seeded` | Invented to fill out the demo. Plausible but not verified. | Agent names beyond those in the evidence pack |
| `simulated` | Generated at runtime by the demo engine. Changes every session. | Card statuses as the live demo ticks |
| `future-integration` | Would come from a system not yet connected in the POC. | ServiceNow ticket IDs |

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FUELIX_BASE_URL` | No | FuelIX API base URL. Defaults to `https://api.fuelix.ai/v1`. |
| `VITE_FUELIX_API_KEY` | No | FuelIX API key. If blank, Copilot panel shows a "not configured" message. |
| `VITE_FUELIX_MODEL` | No | Model name. Defaults to `gpt-4o-mini`. |

⚠️ **Security**: These variables are embedded in the browser bundle at build time.
They are visible in DevTools. Do not use production keys in a public-facing deployment.
See `src/services/fuelixClient.ts` for the full security warning and production options.

---

## Project structure

```
command-center/
├── src/
│   ├── App.tsx                  Root orchestrator — all state lives here
│   ├── components/              UI components (one file per component)
│   │   ├── CommandBar.tsx       Top chrome bar
│   │   ├── HealthStrip.tsx      6 live operational metrics
│   │   ├── PriorityFeed.tsx     Left panel — AI-ranked cards
│   │   ├── ProcessView.tsx      Right panel — 6-tab process view
│   │   ├── CopilotPanel.tsx     Inline AI assistant (Why/Recommend/Draft)
│   │   ├── DispatchFeed.tsx     Reverse-chronological alert log
│   │   ├── AlertDetailModal.tsx Full detail for a dispatched alert
│   │   ├── ReportDetailModal.tsx Full detail for a sent report
│   │   ├── ShiftStartModal.tsx  Shift briefing overlay
│   │   ├── CloseShiftPanel.tsx  End-of-shift readiness modal
│   │   ├── CaptureModal.tsx     Simulated Verint OCR scan
│   │   ├── AutoActionToast.tsx  Bottom-right notification for autonomous AI
│   │   ├── LearningStrip.tsx    AI learning progress tracker
│   │   └── AgentActivityTicker.tsx  Live AI activity log
│   ├── data/
│   │   ├── fixtures.ts          Seed data (cards, LOBs, profile, audit)
│   │   ├── scenarios.ts         4 full demo scenarios (A, B, C, D)
│   │   └── shiftBriefing.ts     Static shift-start briefing content
│   ├── domain/
│   │   ├── types.ts             Core domain types (CommandCard, etc.)
│   │   └── scenario_types.ts    Scenario-layer types (Scenario, DispatchEntry)
│   ├── hooks/
│   │   ├── useLiveEngine.ts     Simulation engine (intervals, auto mode)
│   │   └── useCycleClock.ts     15-min cycle countdown
│   ├── services/
│   │   └── fuelixClient.ts      FuelIX AI streaming client
│   ├── shared/
│   │   ├── constants.ts         All magic numbers (timings, thresholds)
│   │   └── channelConfig.ts     Channel labels and icons (single source)
│   └── utils/
│       ├── cardHelpers.ts       Card sorting, labels, copilot text
│       ├── score.ts             Shift close scoring
│       ├── export.ts            CSV/text export (not yet wired to UI)
│       └── formatters.ts        Duration, percent, time formatters
├── docs/                        Handoff documentation
│   ├── PAIN_POINTS.md           What problem this solves
│   ├── SOLUTION.md              What was built and how it works
│   ├── SCOPE.md                 In/out of scope, data honesty
│   ├── NEXT_STEPS.md            Production connectors and roadmap
│   └── ARCHITECTURE.md          Component tree and data flow
├── .env.example                 Template for environment variables
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Key design decisions

### Why is all state in App.tsx?
The POC has ~15 state variables. A state management library (Zustand, Redux) would add complexity without benefit at this scale. In production, lift state to a server-side event store and use optimistic updates.

### Why are there four scenarios instead of live Verint data?
Verint access requires CIBC network connectivity and a stable OCR integration pipeline (see `docs/NEXT_STEPS.md`). The scenarios let the team demonstrate any story without depending on live data.

### Why is the AI confidence a number, not just a colour?
The confidence number (e.g. 82%) is a training signal. It tells the RTA how sure the AI is. When confidence is below 70%, the card should always be reviewed before sending. In production, confidence comes from the model's log-probability output.

---

## Further reading

- [docs/PAIN_POINTS.md](../docs/PAIN_POINTS.md) — the problem this solves
- [docs/SOLUTION.md](../docs/SOLUTION.md) — what was built
- [docs/SCOPE.md](../docs/SCOPE.md) — in scope / out of scope
- [docs/NEXT_STEPS.md](../docs/NEXT_STEPS.md) — roadmap to production
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — technical architecture
