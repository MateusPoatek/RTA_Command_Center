# ADR-0003 — Two-tier fetch: rare census + attention-scoped targeted pulls

- **Status:** ✅ Accepted — gate PASSED on live Verint 2026-06-11 (see [../../dry_run/results_template.md](../../dry_run/results_template.md))
- **Date:** 2026-06-10 (accepted 2026-06-11)
- **Context:** Refresh architecture (see [../REFRESH_ARCHITECTURE.md](../REFRESH_ARCHITECTURE.md))

## Why (the decision)

**Split the floor refresh into two tiers** instead of re-paginating everyone every cycle:

1. **Census** (`useAllEmployees:true`, paged by `offset`) — draws the map and the `id→LOB` index. Runs **rarely**
   (shift start + a slow cadence), because floor *composition* changes slowly.
2. **Targeted pulls** (`useAllEmployees:false`, explicit `workResourceIds`) — refresh the **hot or watched**
   neighbourhoods only. Runs **often**, scoped by the floor view's attention model.

**The floor view's attention model is the scheduler.** Load then scales with *how much of the floor is hot*, not with
headcount.

## The forces

- Verint pages at 50 records; 500 people = 10 pages. Re-paging all of it every cycle is wasteful and a broad burst.
- The captured request proves the body is **rewritable** and that **LOB is intrinsic to each record**
  (`workResourceDetails.organizationName`) — so neighbourhoods can be built from data, and targeted pulls can be
  composed by us.
- Most of the floor is calm most of the time. Spending the request budget only where adherence is breaking is both
  cheaper and more responsive where it matters.

## The dependency — RESOLVED (gate passed)

Targeted pulls assumed Verint accepts a **self-composed `workResourceIds` set** spanning multiple pages and LOBs.
**Confirmed on live Verint 2026-06-11:** V2 cross-page `10/10`, V3 cross-LOB `6/6`, V4 single-LOB `12/12` — all `201`,
all exact, all ~0.7s. The fallback below is therefore **not** needed. Bonus finding: a broad census returned 21,501
rows in 88s while targeted pulls stay sub-second — empirical proof that census must be rare + tightly bounded and
targeted pulls are the workhorse (finding F1 in the results).

## Fallback if the gate fails

**Page-aligned neighbourhoods:** accept Verint's 50-row pages as the atomic unit, group LOBs onto page boundaries, and
refresh by page rather than by arbitrary ID set. Less elegant (a neighbourhood may straddle pages, a page may mix
LOBs), same two-tier shape, still far better than re-paging everything. The exact failure mode recorded in the
dry-run decides whether a milder variant exists (e.g. page-contiguous IDs accepted, or a sub-50 cap).

## Consequences

- **Positive:** sublinear load vs. headcount; the engine and the UX are the same mechanism; honest per-neighbourhood
  freshness becomes natural.
- **Negative / accepted:** more moving parts than "re-page everything" (a census tier, an id→LOB index, an attention
  scheduler). Justified by the scaling and responsiveness wins.
