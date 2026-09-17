# ADR-0005 — Answer the gate via the extension, not the DevTools console

- **Status:** Accepted
- **Date:** 2026-06-11
- **Context:** The dry-run gate ([../DRY_RUN_PROTOCOL.md](../DRY_RUN_PROTOCOL.md)) — does Verint honour a
  self-composed `workResourceIds` set? First attempted via a console-pasteable harness ([../../dry_run/floor_probe.js](../../dry_run/floor_probe.js)).

## Why (the decision)

**Run the gate probe from inside the extension's `inject.js`, not from the DevTools console.** The console replay is
abandoned as the instrument (the harness stays as a documented reference / fallback).

## What the 2026-06-10 live session taught us

The console harness could not authenticate — every replay returned **HTTP 401** — for two compounding reasons:

1. **Wrong execution context.** The Verint WFM calendar issues `calendar-filter` as **XHR** from a specific
   frame/origin context. A request re-fired from the top-frame console is rejected; reproducing the exact frame via the
   console's context dropdown is fiddly and unreliable.
2. **Rotating, short-lived auth.** The request carries an `impact360authtoken` + `x-csrf-header` / `x-csrf-login` that
   rotate. By the time a human copies a request and pastes-and-fires it, the token is stale → 401.

Meanwhile the extension's `inject.js` **already** fires authenticated reads (the app's own calendar-filter calls flow
through its wrapped `XHR.send`, initiator `inject.js:78`, status 201). It lives in exactly the right place, with fresh
tokens, by construction.

## The decision in practice

- `inject.js` (MAIN world) captures the live `calendar-filter` request (now from the **XHR** path too — it previously
  only captured `fetch`, so `lastCalReq` was always null and `refetch()` was a silent no-op; that bug is fixed).
- A read-only **probe runner** in `inject.js` clones that captured request, rewrites
  `data.attributes.calendarFilterCriteria` (offset / `workResourceIds`), and re-fires **from inject's own context**
  using the captured headers — so auth is valid and the token is fresh.
- Triggered by the popup ("Run gate probe") through the existing `popup → background → content_verint → inject`
  message backbone; results (ids/counts only, **no names**) return the same way and render in the popup.

## Consequences

- **Positive:** beats the 401 and the frame problem at once; fresh tokens for free; the popup is an isolated results
  surface immune to the wrong-DevTools-target pain; the body-rewrite code is the **same primitive** the production
  LOB-scoped scheduler (ADR-0003) will use — this de-risks that too.
- **Negative / accepted:** requires loading the unpacked extension and a one-time `inject.js` change (additive, backed
  up). This is **active polling** (we compose reads now, not verbatim replay) — flag for governance; still strictly
  read-only, "no AI writes" intact.

## Guardrails (unchanged from the protocol)

Read-only (only `calendar-filter`); **sequential, never parallel**; abort-on-`5xx` kill switch; conservative count
(V5 = 3 calls); names stripped from every result. Coordinate with Dione; low-traffic window.
