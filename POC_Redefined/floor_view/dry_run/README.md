# Floor View — Dry-Run (how to run it, safely)

This is the **instrument** for the gate described in [../docs/DRY_RUN_PROTOCOL.md](../docs/DRY_RUN_PROTOCOL.md).
It proves — with a few read-only requests — whether Verint accepts a `workResourceIds` set **we** compose. Run it
**before** any interface is built.

> ⚠️ **This is "active polling."** It re-issues reads in your session. It is read-only and conservative, but treat it
> as touching a production system: **coordinate with Dione**, pick a **low-traffic window**, and stop at any sign of
> strain.

## Prerequisites

- A live Verint login (the `wfo.a87…verintcloudservices.com` tenant), in a normal Chrome tab.
- That's it — the probe is self-contained and does **not** require the RTA Live Bridge extension to be loaded.

## Procedure

1. **Open the calendar** in Verint and apply an account/org filter so real `calendar-filter` requests fire. For the
   cross-LOB variant (V3), apply a filter broad enough to include **≥2 organisations**.
2. **Open DevTools → Console** on the Verint tab. Paste the entire contents of
   [floor_probe.js](floor_probe.js) and press Enter. You should see `[floor-probe] loaded.`
3. **Arm the capture:**
   ```js
   __floorProbe.arm()
   ```
4. **Generate real traffic:** page through the calendar / re-apply the filter a couple of times. The probe captures
   the most recent request as its **template** and indexes responses into an `{id, org}` list (no names).
5. **Check what you have** (sanitised — ids + org counts only):
   ```js
   __floorProbe.show()
   ```
   Confirm `hasTemplate: true`, a healthy `indexed` count, and ≥2 orgs for V3.
6. **Run the variants in order**, awaiting each (one at a time — the probe enforces sequential firing):
   ```js
   await __floorProbe.v1()                  // pagination: offset=50
   await __floorProbe.v2()                  // ⭐ arbitrary IDs across 2 pages
   await __floorProbe.v3()                  // ⭐ IDs across ≥2 LOBs
   await __floorProbe.v4('<orgName>')       // one whole neighbourhood (pick an org from show())
   await __floorProbe.v5()                  // light health probe (4 calls, 3s apart)
   ```
   Each prints a one-row `console.table` with `status`, `latencyMs`, `returnedCount`, `total`, `retryAfter`.
7. **Record** each result in a copy of [results_template.md](results_template.md). Read off the verdict.
8. **Disarm** when done:
   ```js
   __floorProbe.disarm()
   ```

## Reading the outcome

- **`v2` and `v3` both return 2xx with `returnedCount` == the number of IDs you asked for** → ✅ **GREEN-LIGHT**.
- **Either is rejected / errors / returns the wrong set** → 🟠 **FALLBACK** to page-aligned neighbourhoods. Record the
  exact failure (status + error shape) — it decides whether a milder variant works.
- See [../docs/DRY_RUN_PROTOCOL.md](../docs/DRY_RUN_PROTOCOL.md) for the full pass/fail matrix.

## Built-in safety (what the harness enforces for you)

| Rail | How it's enforced |
|------|-------------------|
| Read-only | Only ever re-issues `calendar-filter` (a read); no write endpoints exist in the probe |
| Sequential, never parallel | An in-flight lock refuses a second fire while one is pending |
| Abort on `5xx` | A kill-switch trips on any server error and blocks further fires (clear with `__floorProbe.reset()`) |
| PII never printed | The index keys on numeric `id` + `organizationName` only; **names are discarded on capture** |
| Conservative volume | A dozen-ish requests total; `v5` is 4 calls, 3s apart — characterising, not stressing |

## PII / git hygiene

- **Never commit a raw response body.** If you save anything, write it under `dry_run/captures/` (gitignored) or
  `runs/` (gitignored).
- The committed artefact of this run is a **sanitised** [results_template.md](results_template.md): counts, statuses,
  latencies, and the verdict — no names, no bodies.
- Before any commit, run the residual-PII scan (`git grep` on the staged tree) per the repo's commit hygiene.
