# ADR-0004 — Per-tenant rate budget with adaptive backoff (not a fixed timer)

- **Status:** Proposed (ceiling to be ratified with the Verint vendor)
- **Date:** 2026-06-10
- **Context:** Refresh architecture (see [../REFRESH_ARCHITECTURE.md](../REFRESH_ARCHITECTURE.md))

## Why (the decision)

**Govern Verint load as a *rate budget per tenant*, served sequentially, with automatic backoff on any sign of
strain** — rather than as a fixed "poll every N minutes" timer.

> *max N requests / minute / **tenant**, sequential, no fan-out; back off on `429` / `Retry-After` / `5xx` / latency
> creep. Cadence falls out of the budget.*

## The forces (three corrections to "every 5 minutes is fine")

1. **Burst shape matters as much as frequency.** Verint strains on *concurrent spikes*, not requests-per-hour. Ten
   census pages fired in parallel is a burst regardless of a 5-minute cadence. → page **sequentially with a gap**;
   never `Promise.all`.
2. **The ceiling is per-*tenant*, not per-*account*.** `wfo.a87` (TELUS) serves EPIC, CIBC, and others on **one
   backend**. "100 accounts" can sit behind one Verint backend, so the dangerous number is **total req/min on that
   tenant, summed across all accounts on it** — not per-account cadence.
3. **A fixed timer can't protect a struggling server; backoff can.** Reacting to Verint's own health signals (`429`,
   `Retry-After`, rising latency) by easing off is the real insurance against crashes. The system should get *quieter*
   exactly when Verint gets *unhealthier*.

## Consequences

- **Positive:** self-protecting under load; scales by tenant (the unit that actually breaks); "what's our load ceiling
  per tenant" is the language Verint's own reps speak.
- **Negative / accepted:** more logic than a `setInterval` — a budget accountant, a sequential queue, and a backoff
  controller. Worth it given the explicitly-flagged crash risk.

## Open item — ratify the ceiling, don't guess it

The numeric budget (`N`) starts as a conservative guess informed by the dry-run's V5 latency probe. Ruairi offered an
introduction to Verint ("Variant") representatives — **that call is where the sanctioned per-tenant ceiling gets
agreed**, turning this budget from a guess into a contract. Until then: err low.

## Governance note

Composing our own reads (vs. replaying the RTA's captured request verbatim) is **active polling** — flag it to the
governance council. It remains strictly **read-only**; "no AI writes" stays provable (audit `actor=ai AND op=write`
→ zero rows).
