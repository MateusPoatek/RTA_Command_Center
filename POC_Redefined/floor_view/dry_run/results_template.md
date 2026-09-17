# Floor View — Dry-Run Results

> **RESULT RECORD — gate run 2026-06-11.** Counts/statuses/latencies only — no names, no raw bodies. Run via the
> extension probe (popup → "Run gate probe"); see [EXTENSION_PROBE.md](EXTENSION_PROBE.md) and
> [../docs/decisions/0005-probe-via-extension-not-console.md](../docs/decisions/0005-probe-via-extension-not-console.md).

- **Date / time:** 2026-06-11, ~09:21 PDT
- **Operator:** Mateus
- **Tenant:** `wfo.a87.verintcloudservices.com`
- **Filter applied:** EPIC (calendar Draft Schedule, ~744 employees across 15 pages)
- **Instrument:** extension `inject.js` probe (authenticated MAIN-world replay; read-only)

## Capture

- `hasRequest`: true (captured live from the XHR path after a tab reload + one page)
- `indexed`: 21,506 resources (inflated by the V1 offset=50 census — see finding F1)

## Variant results

| # | Variant | HTTP status | requested / returned | latency (ms) | PASS? |
|---|---------|-------------|----------------------|--------------|-------|
| V1 | census offset=0 | 201 | page / 50 | 2,651 | ✅ (normal page) |
| V1 | census offset=50 | 201 | page / **21,501** | **88,421** | ⚠️ see F1 (heavy) |
| V2 | ⭐ arbitrary IDs (cross-page) | 201 | **10 / 10** | 707 | ✅ |
| V3 | ⭐ cross-LOB IDs | 201 | **6 / 6** | 729 | ✅ |
| V4 | single-LOB pull | 201 | **12 / 12** | 730 | ✅ |
| V5 | health 1/3 | 201 | 10 / 10 | 735 | ✅ |
| V5 | health 2/3 | 201 | 10 / 10 | 567 | ✅ |
| V5 | health 3/3 | 201 | 10 / 10 | 594 | ✅ |

## Verdict

> ✅ **GREEN-LIGHT.** Verint honours a **self-composed `workResourceIds` set** — cross-page (V2 10/10), cross-LOB
> (V3 6/6), and a full neighbourhood (V4 12/12) — all `201`, all exact, all sub-second. The attention-driven,
> LOB-scoped refresh scheduler (ADR-0003) is **proven on live Verint.** Build the FloorView (Phase 3).

## Findings

- **F1 — Census is expensive; targeted pulls are cheap (THE architectural confirmation).** A broad
  `useAllEmployees:true` census over the calendar's multi-week view window returned **21,501 resource rows in
  ~88 seconds** (V1 offset=50), whereas every **targeted `workResourceIds` pull returned in ~0.6–0.7s**. This is
  exactly why the design makes the census tier **rare + tightly bounded** (narrow date window, real pagination) and
  leans on targeted pulls as the workhorse. *To investigate:* whether the blow-up is driven by the wide
  `viewStartDate→viewEndDate` window, the `summaryIntervals`, or offset semantics — and pin the census to a 1-day
  window in production. It's also a concrete Verint-stress caution for the per-tenant rate budget (ADR-0004) and the
  vendor call.
- **F2 — No rate-limiting observed** across the targeted pulls (no `429`, no `Retry-After`); latency steady at
  ~0.6–0.7s. Encouraging for a conservative polling cadence — to be ratified with the Verint vendor, not assumed.
- **F3 — Auth confirmed solvable in the extension context.** Zero 401s once fired from `inject.js` (vs. uniform 401s
  from the console) — validates ADR-0005.
