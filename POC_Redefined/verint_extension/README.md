# RTA Live Bridge — Chrome Extension

Reads Verint's **own** schedule/adherence API directly in the browser the RTA
already uses, turns it into adherence work cards, and pushes them **live** into
the RTA Command Center. No connectors, no GScripts, no Citrix integration — just
the browser + Verint + the dashboard.

## What it does (read-only)

- On `*.verintcloudservices.com`: passively tees Verint's `calendar-filter`,
  `work-resources`, and `activities` API responses (the JSON the calendar SVG is
  drawn from). It **never** modifies Verint or sends anything back to it.
- Parses those into adherence alerts (Verint's own planned-vs-actual verdict).
- Shows them in the toolbar popup (with a count badge).
- Pushes them into an open Command Center tab at `http://localhost:5174`.

**Privacy/security:** host permissions are limited to `*.verintcloudservices.com`
and `localhost:5174`. All processing is local; **no data leaves the machine.**

## Install (Chrome/Edge — "Load unpacked")

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder
   (`POC_Redefined/verint_extension`).
4. Pin the **RTA Live Bridge** icon to the toolbar.

## ⚠️ Demo topology — important

The **live bridge works within ONE browser**: the extension injects cards into a
Command Center tab in the *same* browser session. So the cleanest demo runs all
three on **one machine**:

- **Verint** (EPIC account, logged in) +
- **Command Center** at `http://localhost:5174` (running) +
- **this extension** installed.

Two ways to run the demo:

- **A — On your machine (recommended, fully live):** you install the extension,
  log into Verint EPIC, open the Command Center → cards appear live. Dione
  watches / verifies. You drive; it's genuinely live.
- **B — On Dione's machine:** she installs the extension **and** runs the Command
  Center locally (`npm run dev` in `RTA_Board_V2`) + logs into Verint → she
  sees her own live cards; screen-share to you.

**Dione's self-contained proof (no Command Center needed):** even without the
dashboard, once she installs the extension and opens the Verint EPIC calendar,
the **extension popup shows the captured alerts + a badge** — that alone proves
the capture works on her real Verint session.

> Cross-machine note: Dione's extension cannot push to *your* Command Center over
> the network (by design — we keep employee data local). Live bridging is
> same-browser. A networked relay is the production answer (with PII handled).

## Demo run (setup A)

1. Start the Command Center: `cd ../../RTA_Board_V2 && npm run dev` → `localhost:5174`.
2. Open Verint, go to the calendar, apply the **EPIC_TISV** filter so employees
   show. The extension badge shows the alert count.
3. Open `http://localhost:5174` in the same browser → the board fills with the
   live EPIC roster. (Or click the extension popup → **Push to Command Center**.)

## Verify the bridge WITHOUT Verint (do this first)

Open `http://localhost:5174`, open DevTools console, and paste the contents of
**`BRIDGE_TEST.js`** (generated from a real capture — 12 cards). The feed should
fill immediately. This confirms the Command Center side works before involving
the extension or Verint.

## Troubleshooting

- **No cards after capture:** make sure you actually loaded the calendar with a
  filter applied (that's what triggers `calendar-filter`). Re-open the popup.
- **Command Center didn't update:** confirm it's at `http://localhost:5174`
  (the host permission is exact) and reload the tab.
- **Badge stuck at 0:** open the Verint calendar fresh; the capture fires on the
  API call, not on a cached view.

## Tests

`parse.js` is the live data path (it runs in the RTA's browser). Golden tests
cover the card contract + the adherence%/shift/productive derivations + the
census↔targeted field-merge + the filters/variety-cap, against a **synthetic**
fixture (no real employee data):

```
node --test verint_extension/parse.test.js     # from POC_Redefined/
```

## Note

The JS parser (`parse.js`) mirrors the Python pipeline
(`verint_calendar_parse.py` + `card_builder.py`). For production these should be
unified into one source of truth — note the 2026-06-11 adherence%/shift/
productive derivations currently live only in `parse.js` (see
`floor_view/docs/VERINT_EXTRACTION_CAPABILITIES.md` §4b).
