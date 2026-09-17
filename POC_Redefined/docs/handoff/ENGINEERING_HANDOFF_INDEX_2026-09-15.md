# Engineering Handoff Index — 2026-09-15

**Supersedes [`ENGINEERING_HANDOFF_INDEX_2026-08-31.md`](ENGINEERING_HANDOFF_INDEX_2026-08-31.md).** Read this one. The Aug-31 index's four reading lists (Floor View, Attendance/GTT, Verint Capture, Platform) and their caveats are still accurate and were not re-verified this round — this index adds what changed since, rather than repeating them. A frozen, self-contained copy of everything below (plus the Aug-31 material) lives in [`Engineering_handoff_2026-09-15/`](Engineering_handoff_2026-09-15/) — that folder's own [`00_START_HERE.md`](Engineering_handoff_2026-09-15/00_START_HERE.md) is the equivalent index for the copied docs.

## What's new since 2026-08-31

### 1. Verint-only adherence reporting (GTT is no longer a hard requirement)

Read: [`docs/REPORT_SCHEMA.md`](../REPORT_SCHEMA.md) (`source` field, `_meta.sources`), then code: `gtt_verint_reconciler.py`, `report_intelligence.py`, `local_api.py`'s `/generate-report`, `command-center/src/domain/accounts.ts`, `command-center/src/components/ReportConfigPanel.tsx`.

Some accounts don't have GTT access — the report can now be generated purely from Verint capture (attendance/adherence, no GTT cross-reference), toggled per account via a manual "Data Source" control in the Report Config panel, not a hard gate. `reconcile()` already degraded gracefully with an empty GTT set before this change; the work was mostly threading a `source` flag through so the report is honest about what it contains, plus fixing the handful of UI spots that assumed GTT numbers always exist (summary stats, discrepancy-type labels, charts, XLSX export, Chat digest text).

### 2. Epic Games' real branch structure, now reflected as accounts

`EPIC` (El Salvador, GTT, live) · `EPIC_PH` (Philippines, target system **PST**, negotiating API access, runs `verint_only` today) · `EPIC_BG` (Bulgaria, target system **Verint MyTime**, negotiating, unconfirmed Verint URL/timezone — placeholder). `accounts.ts`'s `AccountConfig` now carries `clockSystem`/`clockSystemStatus` per account — descriptive metadata for the next connector effort, not a runtime gate.

### 3. Two production incidents, root-caused (not just retried blind)

⚠️ **Read this before touching GTT or the Chat dispatch webhook again:**

- GTT's OAuth2 token endpoint intermittently rejected valid, correctly-signed JWTs — confirmed via independent local signature verification (not our key, not our crypto stack). Fixed with an 8-attempt retry in `gtt_adapter._mint_token`.
- The Chat dispatch webhook hit the same transient-rejection pattern, fixed the same way (retry on 5xx only). Separately, `local_api.py` never actually auto-loaded `.env` — a missing manual `export` looked identical to "the webhook stopped working." Both fixed; see `local_api.py`.
- ⚠️ **Still open as of this writing**: the GTT service-account key went from intermittent to 100%-dead around 2026-09-14 — looks like a real key rotation on the GCP IAM side. This needs a new key from whoever manages that GCP project; it is not fixable from this codebase. Check current status before assuming GTT reports work.

### 4. `docs/engineering/SECURITY_ARCHITECTURE.md` — drafted (was a blank outline)

The Aug-31 snapshot carried this as a headers-only outline. It's now fully written: trust model, OIDC/MFA, RBAC, API gateway, secrets (closes the real `fuelixClient.ts` `VITE_`-exposure gap), network, capture/write-path security, LLM endpoint security, STRIDE threat model, audit/non-repudiation, compliance hooks. Read it if you're doing any security review of this platform.

### 5. Architecture diagrams genericized; new data-pipeline diagram added

`Product_and_Architecture_docs/diagrams/` (22 `.mmd` + 2 archify diagrams) no longer name "CIBC" or "Automation Anywhere" anywhere — replaced with the generic descriptors this doc set already used elsewhere ("bank-tier client," "RPA Engine," or "Google Looker" where the original role was analytics/reporting rather than orchestration). **"Telus" and GCP service names were kept deliberately** — this was a client/vendor-name pass, not a de-Telus-ing. New: [`D-23-data-architecture-pipeline.mmd`](../../Product_and_Architecture_docs/diagrams/output/D-23-data-architecture-pipeline.png) — one consolidated capture → reconcile → report → dispatch view across all four clock-in sources (GTT, Verint, Verint MyTime, PST). Also added: an explicit "under assessment" note (`D-05`, `D-21`) that shared-GCP-project vs. one-project-per-account for future production environments is not yet decided, and a new **Looker Studio** component alongside Intelligent Insights on `D-21` (cross-account dashboards, GCP-native, no new vendor).

Same genericization pass extended to `docs/engineering/*.md` (`SYSTEM_ARCHITECTURE.md`, `CONNECTOR_CATALOG.md`, `DATA_GOVERNANCE_AND_MULTITENANCY.md`, `FDAE_CONFIGURATION_LAYER.md`, `PRD.md`, `README.md`) — including embedded Mermaid diagrams and the example tenant-manifest JSON in `FDAE_CONFIGURATION_LAYER.md` (`"tenantId": "cibc"` → `"banktier"`, matching the diagrams' convention). **Deliberately NOT touched**: the BRD (`platform/BRD_RTA_Command_Center_Phase1.md`) and other client-facing deliverables — those are intentionally CIBC-specific business documents, not part of the generic architecture package.

### 6. `Product_and_Architecture_docs/` is now part of the handoff, not separate future work

The 7-volume architecture package (Volume 0 Product Vision → Volume 6 Program Control Tower), its diagram set, and `DOC_PRODUCTION_PLAYBOOK.md` (this repo's documented process for producing these docs) are committed as of this handoff.

---

## Summary for the meeting

The two production incidents in item 3 were root-caused with real evidence (independent JWT verification, statistical retry-rate testing across a dozen-plus attempts) before being fixed — not patched on a guess. The one genuinely open item is the dead GTT key, which is an external GCP-side dependency, not something this codebase can fix on its own. Everything else above is complete and verified end-to-end. As with the Aug-31 handoff: the Aug-31 caveats weren't re-checked this round, so don't assume they're silently resolved just because this index doesn't repeat them.
