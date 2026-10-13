# RTA Board V2

Fresh, deliberately small restart of the alerting UI, built from the Guatemala / El Salvador
visit findings (`Debriefings/` [01], [02], [03]). KISS and "don't make me think": one screen per role,
one question per screen, one action per row, in TELUS Digital colours. No dependencies beyond React.

| Screen | Question it answers | Source in the debriefs |
|---|---|---|
| **My team** (Team Lead) | "Which of my people need me now?" Each row is one sentence ("Carlos Méndez is on Lunch — should be on New ticket · 22 min") with an **On it** button. Red = act now, grey = watch, minor alerts are a count. | [01 §4.2, §4.4], [02 §6, §8.3–8.4] |
| **Floor** (RTA, also wall mode) | "Where is it burning, and which TL hasn't acted?" Headline numbers on one line, LOB incident banner, one row per TL (not seen yet / on it / escalated). A row opens that TL's screen. | [01 §4.4], [02 §9.1] |
| **Reports** (RTA / WFM) | "What does the end-of-shift report say?" GTT × Verint reconciliation from `local_api.py` (`POST /generate-report` → `runs/reports/*.json`), with the Floor's own KPIs and alert outcomes. XLSX / PDF export, browser-side schedule, 30-min Chat digest. | [03 §6.3] |
| **Details** (WFM) | How the numbers are made: Numbers & funnel, Data checks (provenance on every cell), Data sources, Capture (freshness, Full Capture, snapshot). | [03 §6.3], [04], [05] |

## Run
```
npm install
npm run dev     # http://localhost:5174
npm run check   # asserts board rules + provenance statuses (fixture scenarios)
```

## Accounts (pilot)
The header selector has **Demo** (sample data) plus the pilot accounts: EPIC, EPIC_PH and Hotel Planner (`src/data/accounts.ts`).
A pilot account uses **real sources only**:
- **GTT:** fetched live through `POC_Redefined/local_api.py` (`POST /gtt-events`, proxied as `/api`) and refreshed every 5 min. Start it with `.venv-browser/bin/python local_api.py` from `POC_Redefined/`.
- **Verint:** the RTA Live Bridge extension. Reload it after updating so it also posts to `:5174`. Roster rows tagged with another account's LOB are dropped.
- **Workday:** not connected yet.

## Data
- **Fixtures** (synthetic people), shaped like the real inputs: extension roster (Verint), GTT adapter rows, Workday record.
  Each fixture agent exists to exercise one rule — see `src/data/fixtures.ts`.
- **Live Verint (optional):** the existing RTA Live Bridge extension posts to `window`; this app listens
  for the same `{__rtaLiveBridge, kind:"cards", roster}` message (`src/data/bridge.ts`). When capture moves
  server-side, only `bridge.ts` changes. GTT and Workday stay fixtures until connectors exist.
- Join key is Workday ID. The extension roster carries none, so live rows join by name and the provenance
  drawer says so ("fuzzy — no ID in this source yet").

## Google Chat (TL Alert System) — `src/alerts/chat.ts`
Once a minute, new Sev 1 alerts go in one card per account ("For {TL}: {agent} {what} · N min"); an alert nobody
pressed "On it" for is posted again once per escalation level (→ Ops Manager, → WFM Director). Sev 2 only goes in the
30-min digest (Reports → Settings); Sev 3 is never sent. Delivery is `POST /api/dispatch-alert`, which uses the
account's incoming webhook (`GCHAT_WEBHOOK_<ACCOUNT>` in `POC_Redefined/.env`). Without one the board says "simulated".
An incoming webhook posts to the account's **space**, it cannot DM one TL, so every line names the TL.

## Rules — [docs/ALERT_RULES.md](docs/ALERT_RULES.md), code in `src/domain/exceptions.ts`
Six alert types: A1 not clocked in, A2 out of adherence, A3 break overrun, A4 not clocked out, A5 LOB incident, A6 unmapped activity.
Three severities: Sev 1 is a direct alert to the TL with escalation, Sev 2 goes in the TL digest, Sev 3 is board only.
Approved absences, trainees and declared outages are suppressed. Distilled from the ANA Bot SOP + debriefs [01]/[02].

## Data Sources tab
`src/screens/Sources.tsx` is an engineering reference. It shows what comes from GTT, from Workday via GTT, and from the Verint extension, plus the formulas and docs.
The data lives in `src/data/lineage.ts`. `npm run export-lineage` renders the same data to a standalone HTML page.

## Deliberately not here (ponytail)
Proactive alerts ([02] E13, P3) · Chat DMs to one TL (needs a Chat app) and ack from Chat (ack is on the board, in-memory) ·
per-account rule config (constants in `CFG`) · auth/SSO · ServiceNow · scorecard write-back (the feed
preview shows the shape only) · persistence.
