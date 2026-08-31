# Floor View — Refresh Architecture

*The engine that feeds the radar. For the UX, see [DESIGN.md](DESIGN.md). Decisions: [ADR-0003](decisions/0003-two-tier-lob-scoped-refresh.md),
[ADR-0004](decisions/0004-per-tenant-rate-budget-and-backoff.md).*

---

## 1. The liability we're turning into an engine

Verint's `calendar-filter` returns **50 records per page**. A 500-person floor is 10 pages. Naïvely, "keep the floor
fresh" means re-paging all 10 pages every cycle — slow, wasteful, and the kind of broad burst that makes Verint
nervous.

But the real captured request ([runs/netcap_20260604T1610360300/](../../runs)) shows the body is **ours to rewrite**,
and it fires in **two distinct shapes**:

```jsonc
// POST /api/wfm/main/v2/calendar-filter   →  body.calendarFilterCriteria:

// SHAPE A — "census": who is on the floor + their LOB. Paged.
{ "useAllEmployees": true, "limit": 50, "offset": 0, "total": 304, ... }

// SHAPE B — "targeted adherence": live adherence for people WE name. The lever.
{ "useAllEmployees": false, "workResourceIds": [<id>, <id>, ...], "limit": 50, ... }
```

And crucially, **LOB is intrinsic to each record** — `resourceData[].workResourceDetails.organizationName` — so we
can build neighbourhoods from the data itself, not from which filter we happened to apply.

## 2. Two-tier fetch (ADR-0003)

```
┌── CENSUS (Shape A) ────────────────────────┐     ┌── TARGETED PULL (Shape B) ──────────────┐
│ • paged by offset, SEQUENTIAL              │     │ • workResourceIds = a chosen set        │
│ • draws the map + builds id→LOB index      │ ──▶ │ • refreshes ONE neighbourhood / the hot │
│ • runs RARELY (shift start + slow cadence) │     │   avatars                               │
│ • floor COMPOSITION changes slowly         │     │ • runs OFTEN, where attention is        │
└────────────────────────────────────────────┘     └─────────────────────────────────────────┘
```

- **Census** answers *who is here and where do they sit* (which LOB). Composition changes slowly (logins, shift
  boundaries), so this expensive paged pass runs infrequently.
- **Targeted pulls** answer *what's the live adherence of these specific people*. Because we choose the
  `workResourceIds`, we refresh exactly the hot/watched neighbourhoods — not the whole floor.

**The floor view's attention model is the scheduler.** A neighbourhood accumulating heat, or the one the RTA is
looking at, gets polled tight; a calm neighbourhood gets polled lazily. See [DESIGN.md](DESIGN.md) — this is the same
mechanism as the UX, viewed from the data end.

> **Gate dependency:** targeted pulls assume Verint accepts a **self-composed** `workResourceIds` set (cross-page,
> cross-LOB). That is exactly what the [dry-run](DRY_RUN_PROTOCOL.md) (V2/V3) proves. If it's rejected, the fallback
> is **page-aligned neighbourhoods**: accept Verint's 50-row pages as the unit, group LOBs onto page boundaries, and
> refresh by page. Less elegant, same shape.

## 3. Why this scales the way it does

The headline: **load scales with how much of the floor is *hot*, not with headcount.**

If most of the floor is calm most of the time (it is), the system is naturally quiet — it spends its request budget
only where adherence is actually breaking. A 500-person floor that's 90% green costs roughly: *one rare census* +
*targeted pulls for the ~10% that's flaring*. Compare to "re-page everything every cycle," which costs the same
whether the floor is on fire or asleep.

## 4. Per-tenant rate budget + adaptive backoff (ADR-0004)

The instinct "every 5 minutes is fine, the worry is scale" is correct — with three refinements:

1. **Frequency is only half the story; burst shape is the other half.** Verint strains on *concurrent spikes*, not on
   requests-per-hour. A census of 10 pages fired in parallel is a burst regardless of a 5-minute cadence. → **Page
   sequentially, with a gap. Never fan out.** The attention-driven scheduler helps here because it polls *narrowly*
   (one neighbourhood's IDs) rather than *broadly*.

2. **The ceiling is per-*tenant*, not per-*account*.** `wfo.a87` is the TELUS tenant serving EPIC **and** CIBC **and**
   others on one backend. "100 accounts" may sit behind one Verint backend, so the number that crashes things is the
   **total req/min on that tenant, summed across every account we monitor on it** — not the per-account cadence.

3. **Reframe "every 5 minutes" as a rate budget, and make it self-protecting.** Define: *max N requests / minute /
   tenant, sequential.* Cadence falls out of the budget. Then **back off automatically** on any `429`, `Retry-After`,
   `5xx`, or latency creep — so if Verint gets unhealthy the system eases off on its own instead of hammering a
   struggling server. Adaptive backoff is the real insurance against crashes; a fixed guessed timer is not.

```
budget per tenant ──┐
                    ├─▶ scheduler picks the next neighbourhood/IDs by attention (heat, RTA focus)
health signals ─────┘        │
   (429 / Retry-After /      ├─▶ fire ONE request, sequentially
    5xx / latency)           ▼
                       observe response → update freshness + back off if unhealthy
```

## 5. Honest freshness

Under tiered polling, different neighbourhoods are fresh to different degrees — and that's fine, *as long as we say
so*. Each neighbourhood carries a `lastSyncedAt`, surfaced as "synced 8s ago / synced 4m ago." This is literally true
and avoids the trap we already named once for this project: do **not** claim "continuous zero-touch sync" when the
truth is interaction-driven, tiered polling.

## 6. Governance posture

- **This is "active polling."** Today's extension `refetch()` replays the RTA's *own* captured request verbatim —
  defensible as "riding their read." Composing new ID-scoped requests is *us* driving the read. It remains strictly
  **read-only / GET-equivalent**, but it crosses into active polling and must be **flagged for the governance
  council**. "No AI writes" stays provable (audit query `actor = ai AND op = write` returns zero rows).
- **Ratify the ceiling with the vendor, don't guess it.** Ruairi offered an introduction to Verint ("Variant")
  representatives. That call is where we pin down the *sanctioned* per-tenant request ceiling — turning ADR-0004's
  budget from an educated guess into an agreed contract.
