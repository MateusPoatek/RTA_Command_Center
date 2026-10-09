# RTA Board V2 — Backlog

Ideas worth keeping that are not being built now.

## Scope Full Capture to the account (and reuse it server-side)

**Found 2026-10-09.** Full Capture (`POC_Redefined/verint_extension/inject.js`, `runFullCapture`) runs a census with `useAllEmployees = true` and the named filter cleared, then pulls detail for every indexed id. One click therefore reads **every client the Verint user can see**: the first EPIC capture staged 11,705 alerts, and 52% of its roster belonged to other clients.

**Today:** the extension filters after the fact (`ACCOUNT_ORGS` in `background.js`, matched on `workResourceDetails.organizationName`). The board only sees the account's agents, but Verint still serves the whole floor.

**Next:**
- Skip the targeted chunks for ids whose org is not the account's. The census index already carries `org` per id. This cuts Verint calls roughly in half on the EPIC floor.
- Coordinate with governance/Dione before running active polling at this scale (the code comments say so already).

**Why it matters later:** the whole-floor census shows that one authenticated session can enumerate every org and agent the user is scoped to. A server-side Verint integration (Track B, `SERVER_SIDE_ARCHITECTURE.md`) can do the same with a service account, then fan out per account:
- one census;
- the org tree (`/wfo/rest/core-api/org/get`) to map org → account;
- targeted pulls per account.

That gives multi-account coverage with no browser.
