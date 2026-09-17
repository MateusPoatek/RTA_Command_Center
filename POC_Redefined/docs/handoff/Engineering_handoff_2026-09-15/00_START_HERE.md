# Engineering Handoff Index — 2026-09-15

Reading list for the incoming engineering team. This snapshot supersedes [`Engineering_handoff_08_31_2026/`](../Engineering_handoff_08_31_2026/) — read this one, not that one, unless you're specifically diffing what changed. This folder is self-contained: everything linked below lives inside it, no need to go hunting through the repo.

**What this update covers:** the Aug-31 snapshot's four areas (Floor View, Attendance/GTT, Verint Capture, Platform) are carried forward — their reading order and content are unchanged and still current. This index adds what happened since, and is explicit about what was and wasn't re-verified this round.

## What's new since 2026-08-31

1. **Verint-only adherence reporting.** GTT (Global Time Tracker) isn't available for every account — some run on other clock-in/out systems entirely. `local_api.py`'s `/generate-report` now accepts `"source": "gtt_verint" | "verint_only"`; in `verint_only` mode, GTT is never queried and the report is built purely from Verint capture (attendance/adherence), with the frontend adapting labels, summary stats, and charts accordingly. Selectable per account via a manual toggle in the Report Config panel — not a hard-coded gate. See [`attendance_gtt/REPORT_SCHEMA.md`](attendance_gtt/REPORT_SCHEMA.md) (`source` / `_meta.sources` fields) and code: `gtt_verint_reconciler.py`, `report_intelligence.py`, `command-center/src/domain/accounts.ts`.

2. **Three new/updated accounts, reflecting Epic Games' real branch structure**: `EPIC` (El Salvador, GTT, live), `EPIC_PH` (Philippines, target system **PST**, API access being negotiated — runs `verint_only` today), `EPIC_BG` (Bulgaria, target system **Verint MyTime**, also negotiating — unconfirmed Verint URL/timezone, placeholder pending real values). The account catalog (`accounts.ts`) now carries a `clockSystem`/`clockSystemStatus` pair per account — purely descriptive metadata for whoever picks up the PST/MyTime connector work next, not a runtime gate.

3. **Two real production incidents, root-caused and fixed — not just patched around:**
   - GTT's OAuth2 token endpoint was intermittently rejecting valid, correctly-signed JWTs (confirmed via independent local signature verification — not a bad key, not our crypto stack). Fixed with an 8-attempt retry in `gtt_adapter._mint_token`.
   - The same transient-rejection pattern hit the Google Chat dispatch webhook. Fixed the same way (retry on 5xx only, never on 4xx) — plus a separate, compounding bug: `local_api.py` never actually auto-loaded `.env`, so a missing manual `export` looked exactly like "the webhook stopped working" when it hadn't. Both are now fixed; see `local_api.py` and `gtt_adapter.py`.
   - ⚠️ **Not yet resolved as of this writing**: the GTT service-account key itself went fully dead (100% rejection, not intermittent) around 2026-09-14, most likely a real key rotation on the GCP IAM side. Blocked on whoever manages that GCP project re-issuing the key — check current status before assuming GTT reports work end-to-end.

4. **`docs/engineering/SECURITY_ARCHITECTURE.md` is now fully drafted** — it was a headers-only outline as of Aug-31 (flagged then as a real gap). All 12 sections now have real content: trust model, OIDC/MFA, RBAC, API gateway, secrets (closes the real `fuelixClient.ts` `VITE_`-exposure issue found in the POC), network, capture/write-path security, LLM endpoint security, STRIDE threat model, audit/non-repudiation, and compliance hooks.

5. **The architecture diagram set (`Product_and_Architecture_docs/`) is genericized** — "CIBC" and "Automation Anywhere" no longer appear anywhere in the 22 `.mmd` diagrams, the two archify-based diagrams (production GCP hosting + its plain-language explainer), or the 7-Volume prose package. Replaced with the generic descriptors already used elsewhere in this doc set: "bank-tier client," "RPA Engine" (or "Google Looker" where the original role was analytics/reporting, not orchestration). **"Telus" and all GCP service names were deliberately kept** — this was a client/vendor-name genericization, not a de-Telus-ing. A new diagram, `D-23-data-architecture-pipeline.mmd`, consolidates the full capture → reconcile → report → dispatch flow across all four clock-in sources (GTT, Verint, Verint MyTime, PST) in one view. Also added: an explicit "under assessment, not yet decided" note on shared-GCP-project vs. one-project-per-account for future production environments (`D-05`, `D-21`), and a **Looker Studio** component alongside Intelligent Insights on `D-21`. Same pass extended to `platform/engineering/*.md` (this folder) — including embedded Mermaid diagrams and the example tenant manifest's `"tenantId"` in `FDAE_CONFIGURATION_LAYER.md`. **Not touched**: the BRD and other client-facing deliverables, which are intentionally CIBC-specific.

6. **The `Product_and_Architecture_docs/` 7-volume architecture package is now part of the committed handoff**, not a separate future artifact — Volumes 0 (Product Vision) through 6 (Program Control Tower), plus the full diagram set and `DOC_PRODUCTION_PLAYBOOK.md` (this repo's own documented process for producing these docs — read it before adding to this package).

## What was NOT re-verified this round

The Aug-31 snapshot's caveats — the Floor View README/refresh-engine mismatch, the undocumented "Full Capture" feature, the BRD §6 "no data commingling" contradiction against the real multi-account switcher, the stale dispatch-flow diagrams — were **not re-checked against the current working tree this round**. Treat them as still-open unless you've personally re-verified them; don't assume they were silently fixed just because this index doesn't mention them.

## Reading order

Same four areas as before — go to [`Engineering_handoff_08_31_2026/00_START_HERE.md`](../Engineering_handoff_08_31_2026/00_START_HERE.md) for the full per-area reading list and caveats (Floor View, Attendance/GTT, Verint Capture, Platform); the docs it links to are duplicated fresh in this folder's matching subdirectories. Read items 1-6 above first — they're the delta, and change how a couple of the Aug-31 docs should now be read (particularly `REPORT_SCHEMA.md` and `SECURITY_ARCHITECTURE.md`).

## Summary for the meeting

Nothing here is a rushed or undocumented codebase — the two incidents in item 3 were root-caused with evidence (independent JWT verification, statistical retry-rate testing), not patched blind. The one real open item is the dead GTT key (item 3's last bullet) — that's an external dependency, not something fixable from this codebase. Everything else in this update is complete and verified working end-to-end.
