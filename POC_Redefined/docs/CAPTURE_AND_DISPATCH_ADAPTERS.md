# Capture & Dispatch Adapters — the browser extension is ONE of many

> **Read this before assuming "the system = the browser extension."** It is not.
> The browser extension is a single, interchangeable **capture adapter**. The
> architecture is deliberately a swappable-adapter model so we can meet each
> client/system/access-constraint with the right mechanism — without changing the
> rules/cards/dispatch core.

## The stable core (does not change per adapter)

```
            ┌──────────── STABLE CORE ────────────┐
 CAPTURE →  │  normalize → triage (rules) →        │ → DISPATCH
  adapter   │  CommandCards + draft messages       │   adapter
            └──────────────────────────────────────┘
```

- **Core (unchanged):** `verint_normalize` / `verint_triage` / `card_builder` /
  `alert_formatter`. Consumes a normalized snapshot, applies the rules, emits
  evidence-backed cards + draft alerts. Already built + tested (44 tests).
- **Capture adapters (swappable):** *how* we get the data in.
- **Dispatch adapters (swappable):** *where* the approved alert goes out.

Today we proved the **browser-extension** and **netcap** capture adapters and a
**mock/in-app** dispatch. Everything else below is a known, designed slot.

## Capture adapters (how data comes IN)

| Adapter | How it works | Best for | Status |
|---|---|---|---|
| **Browser extension** ("RTA Live Bridge") | Reads the app's own API responses in the RTA's browser; live-bridges to the Command Center | Web-accessible Verint; "just a browser" deployments | ✅ Built; bridge verified; live capture pending login test |
| **netcap (local agent / Playwright-CDP)** | Drives/observes a browser session, records the API JSON | Repeatable capture, headless, dev/testing | ✅ Proven on real EPIC data |
| **Vision/OCR (Vision Agent)** | OCR on the rendered screen/pixels | **Citrix pixel-stream** (only local-only option) | ⚠️ Baseline measured; fallback |
| **Verint REST API ("Track B")** | Authenticated API calls, no UI | When a read-only API credential is granted | 🔓 Designed; needs credential |
| **GScript / file export** | Scheduled export → ingest | Batch/offline, legacy | 🔓 Designed; not built |

All capture adapters output the **same normalized snapshot shape**, so the core
doesn't know or care which one produced it. (Verint snapshot contract:
`POC/07_simulation/data/sim_snapshot_t0.json`; live calendar contract:
`/api/wfm/main/v2/calendar-filter`.)

## Dispatch adapters (where alerts go OUT)

| Adapter | Target | Status |
|---|---|---|
| **In-app / mock** | The Command Center feed + draft message (RTA reviews) | ✅ Current demo |
| **Google Chat (LOB channels)** | The real RTA workflow target; `lob_channel()` already maps LOB→channel | 🔓 Designed (`alert_formatter`); needs prod provisioning |
| **Microsoft Teams** | Alternate channel | 🔓 Designed in architecture |
| **ServiceNow** | Ticket creation/follow-up | 🔓 Future (process #5) |
| **Audit-only** | Log without sending | ✅ Supported (`audit-only` target channel) |

## Why this matters for the handoff

1. **No single point of fragility.** If a client is web-accessible → extension. If
   Citrix-locked → server-side capture or vision. If they grant an API → REST. The
   core and the Command Center are unchanged in every case.
2. **The same model generalizes beyond Verint** (see `FUTURE_FEATURES.md`):
   ServiceNow, NICE, Workday are all browser-based apps with HTTP data feeds — the
   *same* capture-adapter approach reads them; only the per-system parser differs.
3. **The demo's "just a browser" story is true for the extension adapter** — and
   honest about the others: "where Verint is reachable in a browser, the extension
   is all you need; where it's behind Citrix, we run the capture server-side or use
   the API."

## Production note

The capture→cards logic currently exists twice (Python pipeline + JS in the
extension). For production, unify into **one source of truth** (e.g., a shared
spec/library), so all adapters feed an identical core.
