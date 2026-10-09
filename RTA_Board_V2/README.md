# RTA Board V2

Fresh, deliberately small restart of the alerting UI, built from the Guatemala / El Salvador
visit findings (`Debriefings/` [01], [02], [03]). Two screens, no dependencies beyond React.

| Screen | Answers the RTA complaint | Source in the debriefs |
|---|---|---|
| **Alert Board** | "So many messages, they're ignored" → one board, only exceptions; direct alert only for critical | [01 §4.4], [02 §8.2–8.4, §9.1] |
| **Report Composition** | "Hand-typed files, 81–85% confidence" → numbers assembled from GTT + Verint + Workday with provenance on every cell | [03 §6.3], [04], [05] |

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

## Rules — [docs/ALERT_RULES.md](docs/ALERT_RULES.md), code in `src/domain/exceptions.ts`
Six alert types: A1 not clocked in, A2 out of adherence, A3 break overrun, A4 not clocked out, A5 LOB incident, A6 unmapped activity.
Three severities: Sev 1 is a direct alert to the TL with escalation, Sev 2 goes in the TL digest, Sev 3 is board only.
Approved absences, trainees and declared outages are suppressed. Distilled from the ANA Bot SOP + debriefs [01]/[02].

## Data Sources tab
`src/screens/Sources.tsx` is an engineering reference. It shows what comes from GTT, from Workday via GTT, and from the Verint extension, plus the formulas and docs.
The data lives in `src/data/lineage.ts`. `npm run export-lineage` renders the same data to a standalone HTML page.

## Deliberately not here (ponytail)
Proactive alerts ([02] E13, P3) · real Chat delivery / ack endpoint (notify+ack are in-memory) ·
per-account rule config (constants in `CFG`) · auth/SSO · ServiceNow · scorecard write-back (the feed
preview shows the shape only) · persistence.
