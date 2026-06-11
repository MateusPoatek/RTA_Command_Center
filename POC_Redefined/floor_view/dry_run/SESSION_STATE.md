# Floor View — Where we are (session state)

*Written 2026-06-10, end of a long live-Verint session. Read this first when resuming.*

> **UPDATE 2026-06-11:** The console path is retired (see ADR-0005). The gate is now run **through the extension** —
> `inject.js` captures the live calendar-filter from the **XHR** path (the bug: it only captured `fetch` before, so
> `lastCalReq` was always null) and a read-only **probe runner** re-fires body-rewritten copies from its own
> authenticated context. Trigger: popup **"Run gate probe."** How-to: [EXTENSION_PROBE.md](EXTENSION_PROBE.md).
> **Status: ✅ GATE PASSED (2026-06-11).** Composed `workResourceIds` honoured on live Verint — V2 cross-page 10/10,
> V3 cross-LOB 6/6, V4 12/12, all 201 / ~0.7s; no 429. Finding F1: a broad census returned 21,501 rows in 88s →
> census must be rare + tightly bounded; targeted pulls are the workhorse. Full record: [results_template.md](results_template.md).
> **Everything below is now historical — the blocker is resolved. Next: build the FloorView UI (Phase 3).**

---

## The overarching goal (don't lose sight of this)

Build a **Floor View** for the RTA: a curated, top-down, glanceable screen that **uses the analyst's attention
correctly**. Instead of scanning a serial list of cards, the RTA sees the whole floor at once as a spatial map —
agents as avatars, clustered into **LOB neighbourhoods**, where state is encoded in **position + colour + motion**.
The governing principle is **stillness-is-the-reward**: calm and quiet when healthy; motion/heat spent *only* on
exceptions. It builds floor *expertise* (you learn the rhythm — "COSTCO flares first at the lunch wave"), which is the
concrete embodiment of the locked strategy to **upskill RTAs into WFM experts**. Full design: [../docs/DESIGN.md](../docs/DESIGN.md).

The radar (Floor View) and the refresh engine are **the same mechanism from two ends**: the map tells the RTA where
to look; where the RTA looks tells the system what to fetch (attention-driven, LOB-scoped polling). See
[../docs/REFRESH_ARCHITECTURE.md](../docs/REFRESH_ARCHITECTURE.md).

## Why we're doing this dry-run (the gate)

Everything downstream depends on **one unproven API question**:

> Will Verint accept a `workResourceIds` set that **we** compose (cross-page, cross-LOB) in a `calendar-filter` POST,
> and return adherence for exactly those people?

- **Yes** → the attention-driven, neighbourhood-scoped scheduler is real → build it.
- **No** → fall back to page-aligned neighbourhoods.

We refuse to build any UI until this is answered. Full protocol: [../docs/DRY_RUN_PROTOCOL.md](../docs/DRY_RUN_PROTOCOL.md).

## What we CONFIRMED today (real wins — keep these)

1. **Endpoint + method:** `POST https://wfo.a87.verintcloudservices.com/api/wfm/main/v2/calendar-filter`, returns
   **HTTP 201**.
2. **Request body shape (verified live):** JSON:API-wrapped —
   `{ data: { type, attributes: { calendarFilterCriteria: { …, limit, offset, resourcePluginIds[],
   workResourceWorkspaceCriteria: { useAllEmployees, workResourceIds[], employeeFilterName, … } } } } }`.
   The criteria live at **`data.attributes.calendarFilterCriteria`** (not top-level — this bit us; `floor_probe.js`
   `parseBody()` is now fixed for it). `limit` is 50; `offset` pages (we saw `offset:300`).
3. **Auth model (this is the key finding):** the request carries custom auth headers —
   `impact360authtoken` (short, e.g. `5fh1k…`), plus `x-csrf-header` and `x-csrf-login`, and
   `content-type: application/vnd.api+json`, `verint-x-source: WFM_Calendar`, `crnk-compact: true`. These appear
   **short-lived / rotating**.
4. **The extension already does authenticated reads** (status 201) from the correct context — `inject.js` runs inside
   the Verint app **iframe**, fires with fresh tokens, and succeeds.

## Where we STALLED (the blocker — two intertwined problems)

We tried to run the probe from the **DevTools console**, and hit:

- **401 on replay.** When *we* re-fire a captured request from the console, Verint returns **401 Unauthorized** — even
  with the captured `impact360authtoken` + csrf headers + `credentials:"include"`. Two compounding causes:
  1. **Wrong frame.** The console defaults to the **top frame**; the app fires from an **iframe**. The API appears to
     validate the calling context (origin/referer/session), so a top-frame replay is rejected. Switching the console
     execution-context dropdown (`top ▾`) to the app iframe is necessary but fiddly.
  2. **Token staleness.** `impact360authtoken` / csrf rotate; by the time we paste-and-fire, the captured token is
     stale → 401. The extension avoids this by capturing-and-firing in the same instant.
- **Index stayed at 0.** Separately, our response parser never populated the `{id, org}` index. We didn't get to
  confirm the **response** shape (the auth 401 blocked the diagnostic fire, and the app-response sniffer didn't print —
  likely the same wrong-frame issue). **We still need the live response shape** (where `resourceData` / `id` /
  `organizationName` actually live) to finish `indexFromResponse()`.

**Net:** the gate is NOT answered yet. It's blocked by *tooling friction* (frame + token), not by evidence that the
idea won't work.

## Lines of investigation for next session (in priority order)

1. **★ Recommended: run the probe THROUGH THE EXTENSION, not the console.** `inject.js` already runs in the right
   iframe with live, fresh tokens, and already captures the request (`lastCalReq`). Add a small, **additive,
   read-only, temporary** probe to it that: takes the live captured request → swaps in our `workResourceIds` → re-fires
   with the app's own fresh auth → reports status + returned count. This sidesteps **both** the 401 and the frame
   problem at once. Next session becomes a 2-minute click instead of console gymnastics. (Build is code-only, no
   Verint needed — can be prepped anytime. Keep `inject.js.bak`; flag as "active polling" for governance.)
2. **If staying in the console:** (a) switch the execution-context dropdown to the **app iframe** and verify with the
   green ✓ capture line; (b) **capture fresh and fire within ~1–2s** (atomic) to beat token rotation; (c) first just
   get the **response shape** via an in-frame one-shot sniffer of the app's *own* 201 response (no auth needed) — that
   alone lets us finish indexing and may let us pick IDs from the app's responses without firing a census ourselves.
3. **Confirm the response shape regardless** — it's the one piece of structure we still haven't seen live. Needed to
   finish `indexFromResponse()` and `totalFromResponse()`.
4. **Then run the actual gate:** V2 (arbitrary cross-page IDs) + V3 (cross-LOB IDs). 201 + `returnedCount` == requested
   = GREEN-LIGHT. Record in [results_template.md](results_template.md).

## Cleanup note

Everything done in the session was in-page JS (teed `fetch`/XHR, sniffers). It all evaporates on tab reload — close
DevTools + refresh the Verint tab to restore a clean state. Nothing persists; nothing changed on Verint.

## State of the code

- `floor_probe.js` — request-body parsing **fixed** for the real `data.attributes.calendarFilterCriteria` wrapper.
  Still has the (unconfirmed) `resourceData` response path and the console-replay auth limitation. Treat the
  console path as deprecated in favour of the extension probe (line 1 above).
- Nothing committed yet — still on branch `feat/floor-view`, working tree only.
