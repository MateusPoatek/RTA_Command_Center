# Architecture — Technical Design of the RTA Command Center

> This document describes the current technical architecture of the POC
> and includes a comparison table showing what changes in a production deployment.
>
> Read [NEXT_STEPS.md](./NEXT_STEPS.md) for the production integration plan.

---

## Current architecture (POC)

```
Browser
│
├── React (Vite + TypeScript)
│   │
│   ├── App.tsx — root orchestrator (all state + all mutations)
│   │   ├── useState(cards)         — card list (mutable via runCardAction)
│   │   ├── useState(dispatchLog)   — shift alert log (append-only)
│   │   ├── useState(learningSignals) — AI training signals
│   │   └── useState(globalAudit)  — audit trail (append-only)
│   │
│   ├── useLiveEngine.ts — simulation engine (intervals)
│   │   ├── setInterval(3s)  — scan pulse: advance card status + log
│   │   ├── setInterval(15s) — inject new card from scenario queue
│   │   └── setTimeout(5–8s) — autonomous AI action (auto mode only)
│   │
│   ├── src/data/fixtures.ts — initial seed state (cards, LOBs, profile)
│   ├── src/data/scenarios.ts — 4 pre-built demo scenarios (A, B, C, D)
│   │
│   └── src/services/fuelixClient.ts
│       └── fetch() → FuelIX API (HTTPS, streaming SSE)
│
└── FuelIX API (external, OpenAI-compatible)
    └── /v1/chat/completions (streaming)
```

**No backend. No database. No authentication. All state is in-browser.**

---

## Component tree

```
App
│
├── ShiftStartModal        — shown on load, dismissed by "Start shift"
│
├── CommandBar             — top chrome
│   ├── Shift identity     — name, shift, LOBs
│   ├── AI status          — Idle / Watching / Needs Review / Generating / Autonomous
│   └── Controls           — Start · Close · Live Demo · Auto mode · Capture · Briefing
│
├── HealthStrip            — 6 live operational metrics
│   ├── SLA risk
│   ├── Queue (calls holding)
│   ├── AI rate (% handled by AI)
│   ├── Incidents (open critical cards)
│   ├── Needs you / Auto-sent
│   └── Cycle clock (15-min countdown, powered by useCycleClock)
│
├── workspace
│   ├── PriorityFeed (40%)         — left panel
│   │   ├── Priority card (top)    — highest-urgency item, full-width
│   │   ├── Compact queue (below)  — remaining cards as list
│   │   └── CopilotPanel           — inline AI assistant (Why → Recommend → Draft)
│   │
│   └── ProcessView (60%)          — right panel
│       ├── Tab: Adherence         — agent status tiles + cards
│       ├── Tab: LOB Health        — SLA, queue depth, coaching gates
│       ├── Tab: Coaching          — coaching/huddle approval decisions
│       ├── Tab: Reports           — attendance reports + send status
│       ├── Tab: Tickets           — ServiceNow exceptions + escalations
│       └── Tab: Handoff           — shift end notes + DispatchFeed
│           └── DispatchFeed       — reverse-chronological alert log
│               └── AlertDetailModal — full detail for one dispatch entry
│
├── LearningStrip              — AI confidence + decision history
│
├── AgentActivityTicker        — bottom: live AI activity log
│
├── CaptureModal               — Verint OCR simulation overlay
├── CloseShiftPanel            — end-of-shift readiness modal
└── AutoActionToast            — bottom-right notification (autonomous AI)
```

---

## Data flow

### Startup
```
fixtures.ts → initialCards → useState(cards)
scenarios["A"].reports.dispatchLog → useState(dispatchLog)
```

### Scenario switch
```
User picks Scenario B
→ setActiveScenarioId("B")
→ useEffect: setCards(scenarios["B"].cards)
→ useEffect: setDispatchLog(scenarios["B"].reports.dispatchLog)
→ setFocusedCardId(null)
```

### Card action (RTA clicks "Send alert")
```
RTA clicks "Send alert" on card "coac-diego"
→ runCardAction("approve-send", "coac-diego", "rta")
  → appendAudit("ai", "Send alert", ...) → setGlobalAudit
  → updateCard("coac-diego", c => ({ ...c, status: "sent" })) → setCards
  → buildLearningSignal(card, "approve-send", ...) → setLearningSignals
  → append DispatchEntry to setDispatchLog
  → if card was focused and is now terminal: setFocusedCardId(null)
```

### Autonomous AI action
```
useLiveEngine auto-mode timer fires
→ pick highest-severity actionable card
→ onAutoAction(card.id)         (callback from App.tsx)
  → formatChannel(card.selectedChannel) → channelLabel
  → runCardAction("approve-send", card.id, "ai")    (same as RTA action)
  → setAutoSentCount(n + 1)
  → setLastAutoAction({ id, title, channel, lob, severity })
  → AutoActionToast renders with key=lastAutoAction.id (forces fresh mount)
```

### Copilot stream
```
RTA clicks "Why did AI flag this?"
→ CopilotPanel opens, step = "why"
→ buildExplainPrompt(card) → prompt string
→ streamCompletion(prompt, onToken, onDone, onError, signal)
  → fetch(FUELIX_URL, { body: { stream: true }, signal })
  → ReadableStream → decoder → "data: ..." SSE lines → onToken(token)
  → text accumulates in useState(aiText)
  → RTA sees tokens appear one by one
```

---

## Simulation vs production comparison

| Feature | POC (simulation) | Production (future) |
|---------|-----------------|---------------------|
| Agent data source | `src/data/fixtures.ts` (seeded) | Verint REST API / WebSocket (Track B) or VDI screenshot OCR (Track A) |
| Alert detection | Hardcoded scenario cards | Rules engine on live Verint stream |
| Card injection | `setInterval` every 15s | Backend WebSocket push on anomaly detection |
| Google Chat | Updates dispatch log only | Backend calls Incoming Webhook |
| Teams | Label only | Azure Bot Framework |
| ServiceNow | Updates card status only | ServiceNow REST API (`/api/now/table/incident`) |
| Workday | Seeded absence records | Workday Reporting API → Justifications file update |
| GTT (Genesys Telecom Tool) | Not modelled — seeded attendance numbers | GTT ATOS Report API → Attendance file → Data Studio refresh |
| Google Sheets + Apps Script | Not modelled — data seeded directly | Backend service calls Sheets API + Apps Script programmatically (short-term); replaced by DB (long-term) |
| Data Studio / Looker | Not modelled | Looker API refresh + screenshot capture → Reporting Agent email |
| Verint VDI | Not applicable (simulation) | Client VDI — data export via TELUS email address (Track A constraint); bypassed by Track B REST API |
| AI model | FuelIX via client-side key | FuelIX / Azure OpenAI via backend proxy |
| Learning signals | Local React counter | Backend API → training pipeline |
| OCR | Mock animation | Azure Computer Vision or Google Cloud Vision (VDI-aware — see `NEXT_STEPS.md`) |
| Audit log | In-memory React state | Immutable store (Cosmos DB / Firestore) |
| Authentication | None | CIBC SSO (Azure AD) |
| Deployment | `npm run dev` (local only) | Azure App Service / Cloud Run |
| GT/PH team coordination | Not modelled | Backend coordination layer — Philippines RT completion signal triggers Guatemala RT Phase 4 automatically |

---

## Key architectural decisions

### All state in App.tsx
The POC has ~15 state variables — small enough to manage in one component.
All card mutations flow through `runCardAction()`, all audit events through `appendAudit()`.
This makes the data flow easy to trace for new engineers.

In production, consider:
- Lifting card state to a server-side event store with optimistic updates (React Query / SWR).
- Separating card state from UI state (split into `useCardStore` and local component state).

### Scenario switching resets all state
When the user switches scenarios, all cards and the dispatch log are replaced.
This is intentional for the demo — it lets the presenter jump between stories quickly.
In production, there is no "scenario" concept — the state comes from live data.

### The useLiveEngine hook is demo-only
`useLiveEngine.ts` contains only simulation code. It has no production value.
When Verint integration is complete, remove this file and replace the card state updates
with a WebSocket listener that receives `CardEvent` objects from the backend.

### No backend = no security
The POC has no authentication, no authorisation, and no server-side validation.
Any browser can open the app and take any action.
For production, add Azure AD SSO, role-based access (RTA vs supervisor vs OM), and
server-side validation of all card actions before they are persisted.

---

## File dependency graph

```
domain/types.ts ←──────────── shared/channelConfig.ts
      ↑                                ↑
      │                         utils/cardHelpers.ts
domain/scenario_types.ts               ↑
      ↑                         components/*.tsx
      │                                ↑
data/fixtures.ts                  App.tsx
data/scenarios.ts                      ↑
      ↑                         hooks/useLiveEngine.ts
      └─────────────────────────┘
```

The domain types (`types.ts`, `scenario_types.ts`) are the foundation.
Nothing in the domain layer imports from components, hooks, or utils.
This keeps the domain model portable and testable in isolation.

---

## See also

- [ATTENDANCE_PROCESS.md](./ATTENDANCE_PROCESS.md) — canonical attendance process (GTT, Workday, VDI, Data Studio, two-team flow)
- [SOLUTION.md](./SOLUTION.md) — what was built and why
- [NEXT_STEPS.md](./NEXT_STEPS.md) — production integration plan
- [SCOPE.md](./SCOPE.md) — what is real and what is simulated
