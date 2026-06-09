# Live-Verint Dry-Run + Calendar-Refresh Observability

> The dry-run is an **experiment**, not just a smoke test. We instrument first,
> then measure how/when Verint refreshes the calendar, and confirm the extension
> auto-updates the Command Center. Fill in the **Results** template as you go —
> the findings become hardening items for the production council.

## Questions we're answering

1. Does `inject.js` actually capture the **live** `calendar-filter`? (last unproven link)
2. Does Verint **re-fetch on a timer** (interval?), only on navigation/filter, or not at all?
3. Is refresh data delivered over **WebSocket** (which the extension does NOT hook)?
4. Does each capture **auto-push** to the Command Center within seconds (no click)?
5. **Coverage:** does the extension's page hook catch everything the network layer
   sees (service-worker / bundled-fetch blind spots)? Does paging accumulate pages?

## Guardrails (read before running)

- **Read-only.** Never click Edit/Delete/Save/etc. in Verint.
- **One LOB** (`EPIC_TISV`), minimal paging. Live production data.
- **Metadata only** in logs/timeline — no employee names or payloads. Raw bodies
  stay local + transient; don't commit; respect `runs/` retention.
- **All local, no network egress.**

## Part 1 — Flight recorder (measure the heartbeat)

```bash
cd "POC_Redefined"
../.venv-browser/bin/python verint_browser_use_demo.py observe --observe-seconds 900
```
1. The Test-stripe Chromium opens at the calendar. **Log in**, apply **EPIC_TISV**.
2. Press **Enter** to start the ~15-min window. **Leave the calendar open.**
3. Mid-window: **page through** 1–2 pages and **re-apply the filter** to see which
   actions trigger fetches. (If the calendar has a refresh-rate control, set it.)
4. Watch the live heartbeat (`♥ calendar-filter ← N resources`, `⚡ WebSocket…`).
5. At the end it prints a summary (refresh intervals, ws counts) and writes
   `runs/observe_<ts>/timeline.jsonl` (metadata only).

## Part 2 — Extension auto-push (confirm zero-click live update)

1. Load the extension (`chrome://extensions` → Developer mode → Load unpacked →
   `POC_Redefined/verint_extension`).
2. Open the Verint calendar (EPIC filter) **and** the Command Center
   (`localhost:5173`) in the **same** browser.
3. Watch: the extension **badge** + popup ("last capture HH:MM:SS"), and the
   Command Center **"● LIVE — last synced HH:MM:SS"** banner advancing **with no
   clicks** as Verint refreshes.
4. Cross-check Part 1's timeline vs the extension's capture log — same events? Any
   gap = a hook blind spot to fix.

## Results — Run 1 (2026-06-05, `runs/observe_20260605T1200060300/`)

Window: ~15 min. User actively paged/filtered ~12:01–12:08, then idle (lunch).

| Question | Finding |
|---|---|
| calendar-filter observable live? | ✅ yes — 26 calls → **13 distinct refreshes**, 50 resources/page (one `4` = narrower view) |
| Refresh mechanism | **Interaction-driven** — refreshes only while the user acted; **~9.5 min idle → 0 refreshes** (no idle timer) |
| "Refresh interval" | N/A as a system metric — distinct-refresh gaps `[111,14,31,5,20,22,39,22,57,84,13,20]s` just track user actions |
| WebSocket present? | ✅ **No** (`ws-open: 0`) → the extension's fetch/XHR hook is sufficient |
| A refresh = a bundle | calendar-filter fires **×2 (~1s apart)** + companions: `calendar-events-bulk`, `event-conflict`, `find-shiftworkrules`, `find-shift-ot-extensions` (~13 each) |
| Pagination | ✅ each page = a calendar-filter call (50/page); paging accumulates |
| inject.js (extension hook) live capture | ✅ **PASS (Part 2, 2026-06-05)** — extension captured live in regular Chrome; badge populated; 12 real EPIC cards reached the Command Center |
| Auto-push latency (capture → CC banner) | ✅ live — banner showed "last synced 3:53:25 PM" with no manual click |
| Extension-vs-flight-recorder coverage gap | ✅ none observed — extension hook caught the calendar-filter the flight recorder saw |

### Verdict
**No WebSocket; refresh is interaction-driven.** The extension will stay fresh
**as the RTA works** (RTAs page/filter constantly), but will **not** auto-update
while idle. Do **not** claim "continuous zero-touch sync." For idle freshness, add
a **gentle re-trigger** (re-issue the calendar-filter request on a timer — a read
the app already makes). Still pending: Part 2 (confirm `inject.js` captures
in-page and the CC banner advances with no clicks).

## Interpreting the result (what each outcome means)

- **Timer re-fetch (XHR):** ✅ best case — the extension rides it; "continuous
  auto-sync" claim is **true**. Note the interval.
- **Navigation-only:** the extension updates when the RTA navigates (which they do
  anyway), but not while idle — consider a gentle periodic re-trigger.
- **WebSocket:** the current extension (fetch/XHR-only) will **miss** idle
  refreshes → add a **WebSocket hook** (`inject.js`) — file as a follow-up.
- **Coverage gap (netcap sees more than the extension):** likely a service-worker
  or pre-hook fetch → adjust `inject.js` injection timing / add a SW intercept.

## Follow-ups this likely generates

- WebSocket tap in `inject.js` (if §WS is yes) — the "real-time tap" idea.
- A gentle re-trigger if refresh is navigation-only.
- Unify the JS/Python parser (one source of truth) — already on the handoff list.
