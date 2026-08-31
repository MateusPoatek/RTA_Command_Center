# Account Onboarding Plan — Zillow & Corelogic

*Audience: anyone picking up the Zillow/Corelogic side of the demo — including Max/Salvador, if they read this before we ask them anything.*
*Purpose: not just what to ask and what to build, but why — so the reasoning survives even if the person doing the work changes.*

---

## Glossary

| Term | Meaning |
|------|---------|
| **GTT** | Global Time Tracker — the reporting service that returns raw clock-event data per account. See `DEMO_DEPLOYMENT_CHECKLIST.md`. |
| **`functionalArea`** | The string GTT uses to identify which account's data a request is for (e.g. `FA_Epic Games`). Confirmed per-account by trial, not guessable from the account name alone. |
| **`sites`** | The string GTT uses to scope a request to a physical site within an account. Multiple candidate site names can exist per account; only one may actually return data. |
| **Verint tenant/subdomain** | The specific URL (e.g. `wfo.a87.verintcloudservices.com`) an account's Verint instance lives on. The browser extension's host permissions are an exact match on this domain. |
| **Verint org/campaign** | The internal Verint hierarchy node an account sits under (e.g. `BPO_GLOBAL_EPIC_TISV`). Needed to apply the right calendar filter. |
| **Account catalog** | A small, manually-curated list mapping each demo account to its `functionalArea`, `sites`, `verint_url`, and `timezone`. Doesn't exist yet for Zillow/Corelogic — see Section 3. |

---

## 1. Why this doc exists

The GTT×Verint reconciliation pipeline (`gtt_adapter.py` → `gtt_verint_reconciler.py` → `report_intelligence.py` → the Command Center's Reports tab) already works end-to-end for one account: Epic Games El Salvador. Live-verified 2026-08-27 — `gtt_gate.py` returns 2,196 rows, HTTP 200.

Zillow and Corelogic don't need new *code* — they need account-specific *configuration data* (which `functionalArea`/`sites`/Verint org values map to them) that has never been written down anywhere, because nobody has confirmed it yet. This doc is the plan to close that gap: what to ask, why each answer matters, and how the answers turn into a working account selector in the UI.

---

## 2. Questions for Max/Salvador

**A note on who to actually ask:** Max/Salvador's confirmed remit (per the May 28 meeting notes) is GCP infra — Cloud Run, service accounts, IAM. That's the right pair for the GTT-side questions below, because that's exactly the kind of request Maximiliano already fulfilled for Epic Games. The Verint-side questions are a different system, likely owned by whoever administers Verint per client — ask Max/Salvador "is this yours, or who do we ask" rather than assuming they have the answer.

### Why guessing here is dangerous — the Epic Games precedent

When we confirmed Epic Games' GTT parameters, Maximiliano provided **4 candidate El Salvador site names**. Three of them returned `HTTP 200, 0 rows` — a *successful* response with no data, not an error. Only `SV - Antiguo Cuscatlan - Torre Emblema` returned real records (2,288 rows). The API doesn't fail loudly on a wrong site name; it succeeds and looks fine until someone checks the row count. That's the exact trap waiting for Zillow and Corelogic if we guess instead of confirm.

### GTT-side questions (Max/Salvador's actual lane)

**`functionalArea` is decided:** of the several FA variants each client has in `FAvsID.csv` (Zillow: `FA_Zillow`, `FA_Zillow - Digital Solutions`, `FA_Zillow - TIES`; Corelogic: `FA_CoreLogic` + 6 sub-account variants), we're using the **generic top-level FA for each — `FA_Zillow` and `FA_CoreLogic`** — not a sub-account variant. That removes one open question; the rest below still need Max/Salvador.

| Question | Why it matters | What breaks if we skip it |
|---|---|---|
| Confirm `FA_Zillow` and `FA_CoreLogic` are valid/live `functionalArea` values on the GTT side (not just present in the Workday export) | The FA CSV is a Workday↔FA mapping, not proof the value is wired into GTT's own account list. | A request GTT rejects or silently no-ops because the FA string, while real in Workday, isn't provisioned there. |
| Exact `sites` string(s) for each account | Same failure mode as Epic Games' 3-of-4 dead sites. | `HTTP 200, 0 rows` — a report that looks like it worked but is empty. |
| Does the existing SA (`td-sa-wfm-gtt-reports02@...`) already cover Zillow/Corelogic, or does it need a broader IAM grant? | This is the same class of blocker that took the Epic Games GTT gate from 403 to working — better to find out now than mid-demo. | Auth failure discovered live, in front of the client. |

### Verint-side questions (confirm ownership first)

| Question | Why it matters | What breaks if we skip it |
|---|---|---|
| Verint tenant URL/subdomain per account | The browser extension's host permissions are an exact domain match. Epic uses `wfo.a87.verintcloudservices.com` — Zillow/Corelogic may be on a different subdomain entirely. | Capture fails silently — no error, just no data forwarded to the Command Center. |
| Verint org/campaign structure per account (Epic's equivalent: `BPO_GLOBAL_EPIC_TISV`) | Needed to know which node to apply the calendar filter to. | Can't scope the capture to the right roster. |
| Calendar-filter name to apply in Verint | This is literally how we tell the extension which account it's looking at. | No filter = no way to isolate one account's data from the rest of the tenant. |
| Do we already have Verint login credentials for these orgs, or is that a separate access request? | Access provisioning can have its own SLA, independent of the GTT side. | Discovering a credentials gap on-site, with no lead time to fix it. |

---

## 3. Account selector design

### The problem

`POC_Redefined/Functional_Areas_and_WorkdayIDs/FAvsID.csv` has no site, geo, or Verint-org column — it only maps `FA_Hierarchy / FA_ID / FA_Name / WD_ID`. This isn't a gap we can close by parsing harder; the account → Verint-org → GTT-site mapping simply isn't represented as data anywhere yet. It only exists as tribal knowledge, confirmed the same way Maximiliano confirmed Epic Games: by asking and by trial.

### The pattern to reuse

`POC_Redefined/docs/SERVER_SIDE_ARCHITECTURE.md` already designs the right shape for this — an account catalog, just not yet wired into the frontend:

```yaml
- id: "epic_sv"
  label: "Epic Games El Salvador"
  verint_url: "https://wfo.a87.verintcloudservices.com"
  gtt_functional_area: "FA_Epic Games"
  gtt_sites: ["SV - Antiguo Cuscatlan - Torre Emblema"]
  timezone: "America/El_Salvador"
```

### The concrete change

1. Add `command-center/src/domain/accounts.ts` exporting this catalog as a typed array — seed it with the Epic Games entry now (already-confirmed values above), plus placeholder Zillow (`gtt_functional_area: "FA_Zillow"`) and Corelogic (`gtt_functional_area: "FA_CoreLogic"`) entries with `gtt_sites`/`verint_url` left blank until Section 2's answers land.
2. In `ReportConfigPanel.tsx` (currently free-text `functionalArea`/`sites` inputs, ~lines 120-135), replace the two `<input>` fields with a single `<select>` bound to the catalog. Selecting an account writes its `gtt_functional_area`/`gtt_sites`/`verint_url` into `cfg` via the existing `persist()` call — no change to how config is consumed downstream.

### Why this order matters

The UI change is trivial once the data exists — it's a dropdown over a static list. Building the selector *before* the data exists would just move the guessing problem from a CLI flag (`--functional-area`) into a dropdown with wrong options, which is worse: it looks authoritative and invites trusting an unconfirmed value.

---

## 4. Sequencing

| Step | Action | Why this order |
|---|---|---|
| 1 | Send the Section 2 questions to Max/Salvador (and whoever they point to for the Verint-side items) | Nothing downstream can start without these values. |
| 2 | Fill in the Zillow/Corelogic entries in `accounts.ts` as answers arrive | Turns tribal knowledge into a reusable, typed artifact — same value Maximiliano's answer gave Epic Games. |
| 3 | Swap `ReportConfigPanel.tsx` to the catalog-backed `<select>` | Now switching accounts in the UI is a selection, not a retype-the-magic-string exercise. |
| 4 | Re-run `gtt_gate.py` per new account to verify live before demo day | Confirms row counts are non-zero for the *specific* site chosen — the same check that caught Epic Games' 3 dead site candidates. Feeds directly into `DEMO_DEPLOYMENT_CHECKLIST.md` Phase 2 (live verification per account). |

---

## See also

- [DEMO_DEPLOYMENT_CHECKLIST.md](./DEMO_DEPLOYMENT_CHECKLIST.md) — the broader on-site deployment plan this feeds into
- [../SERVER_SIDE_ARCHITECTURE.md](../SERVER_SIDE_ARCHITECTURE.md) — the account catalog schema this reuses
- [../REPORT_SCHEMA.md](../REPORT_SCHEMA.md) — the shape of the reconciliation report the pipeline produces once an account's data flows correctly
