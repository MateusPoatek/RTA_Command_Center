*Audience: delivery / program leadership · Purpose: how do accounts onboard in waves, and what does the platform look like once the current roadmap lands?*

---

# Volume 5 · Migration Strategy

> Traces to principle(s): **P3** (see [package README](../README.md#architecture-principles--brd-constraint-map)).
> Source of truth: [`Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md`](../../../Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md) (Gold/Silver/Bronze tiering) and [BRD §5 Account Prioritisation](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#5-account-prioritisation). This chapter elevates, it does not restate.

## Summary

Accounts onboard in three waves, ordered by how much of the enabling tech stack (Verint, GTT, Workday) they already have and how they're accessed. **Gold is ground truth** — 20 accounts, fully verified, ready today, no negotiation required. **Silver is a candidate list** — 85 accounts / 12,258 HC that look reachable on paper but haven't been individually cleared for Citrix/VDI lock or PCI scope. **Bronze is a seed list only** — a handful of confirmed-locked accounts (a bank-tier client among them), explicitly *not* a full accounting of everything that's hard to reach. The wave order is a readiness sequence, not a delivery-date commitment for Silver or Bronze. Under **P3**, onboarding any account — in any wave — is authoring one new tenant manifest, never a code change.

## Wave 1 — Gold: the Golden Cluster (ground truth)

| | |
|---|---|
| Qualifying rule | Verint scheduling **and** adherence, GTT time-capture, Workday payroll, all three **TI-owned** (not client-owned/Citrix) |
| Size | **20 accounts, 6,768 known HC, ~68 implied RTAs**, across Americas / Europe / APAC (5 of the 20 accounts have $0 recorded HC today but qualify on tech stack) |
| Value | $242K (conservative) – $660K (aggressive) recoverable/year, blended $7.96/hr real HC-weighted rate |
| Status | **Ready today.** Every account individually verified against all four tool criteria and TI-ownership. No negotiation, no new capture adapter needed. |

This is the only wave whose numbers are exact and individually verified — see the methodology doc §2 and §7 for the full per-account/per-geo detail and the real-rate correction that replaced an earlier flat $15/hr planning assumption.

## Wave 2 — Silver: partial stack (candidate)

| | |
|---|---|
| Qualifying rule | At least 2 of the 3 enabling systems present (any combination of Verint scheduling/adherence, GTT time-capture, Workday payroll); **not** confirmed Citrix/VDI-locked; **not** flagged PCI-restricted |
| Size | **85 accounts (candidate), 12,258 HC** — the BRD's existing "Tier 2" population, corrected 2026-07-08 after removing a bank-tier client's HC (previously double-counted against Bronze) |
| Status | **Candidate, not committed.** Ownership (TI vs. client) is not a Silver disqualifier the way it is for Gold — access method is. But Citrix/VDI status and PCI status have **not** been individually re-checked per account; the access-method signal available today (a free-text column scoped to attendance-report filing, not to the RTA's primary session) is weak supporting evidence, not proof. |

Treat Silver as *illustrative of the next wave's shape*, not a scheduled rollout list. Each account needs individual confirmation before it moves from candidate to committed — the same bar Gold accounts already cleared.

## Wave 3 — Bronze: locked or different stack (seed list, not sized)

| | |
|---|---|
| Qualifying rule | Fewer than 2 of the 3 enabling systems present (genuinely different stack — NICE, Five9, Genesys, IEX, Amazon Connect, etc.), **or** confirmed Citrix/VDI-locked, **or** confirmed PCI-restricted (any one condition is sufficient) |
| Size | **Seed list only — not fully sized.** Confirmed so far: a bank-tier client (839 HC), Bank of Montreal (2 segments), MasterCard (3 segments), MoneyGram, CoreLogic (252 HC), T-Mobile (387 HC), United Healthcare — known HC 1,478 of an unknown total. Barclays and Wise are flagged but unconfirmed. |
| Status | **Not reachable without negotiation or a different capture strategy.** Do not treat this list as exhaustive or commit a rollout date against it. |

**PCI status is not asserted for any account in any wave.** No PCI-DSS flag, cardholder-data indicator, or compliance-scope column exists in any source file checked (confirmed via full-text search, 2026-07-08). Where PCI scope matters to a Bronze classification (e.g. a bank-tier client), it comes from direct account-team knowledge, not a data field — and for accounts without that direct knowledge, PCI status is unknown and must be confirmed with legal/compliance or the account team before it is used to classify anything. This gap is deliberate and tracked in the methodology doc (§2A), not a modeling oversight here.

## What Doesn't Change Between Waves (P3)

Every wave — Gold, Silver, or Bronze — onboards the same way: one new tenant manifest, authored against the same OCI image and the same adapter-blind rules core (**P2**). The capture *adapter* an account uses may differ by wave (see Volume 4's rollout-tier detail, D-15) — Gold accounts are mostly server-side REST, Bronze accounts will more often need the browser-extension path or a negotiated access route — but that is a manifest and adapter-selection decision, never a fork of the platform. This is what makes Silver and Bronze additive rather than a second build: the wave order reflects *how much upfront negotiation an account needs*, not a difference in what gets built.

## Diagrams

| D-ID | What it shows |
|------|---------------|
| D-19 | Migration Waves — Gold/Silver/Bronze criteria, size, and status per wave, converging on the one-tenant-manifest onboarding contract (P3) |
| D-20 | Future Vision — today's production spine (capture → rules core → HITL → dispatch) with future extensions (Agents, Copilot, ANA, a second capture vendor, a data hub) radiating from it, all still bound by P1/P2/P5 |

![Migration Waves](../diagrams/output/D-19-migration-waves.png)

![Future Vision](../diagrams/output/D-20-future-vision.png)

## References

| Topic | Source of truth | Relationship |
|-------|-----------------|--------------|
| Gold/Silver/Bronze tiering, criteria, and the ground-truth numbers | [`Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md`](../../../Golden_Cluster_Calculations/ACCOUNT_SELECTION_METHODOLOGY.md) | references (this chapter elevates, never restates; that doc is the sole source for account counts/HC/dollar figures) |
| Account prioritisation in the business case | [BRD §5 Account Prioritisation](../../docs/handoff/BRD_RTA_Command_Center_Phase1.md#5-account-prioritisation) | references (Gold only as of this writing; Silver/Bronze not yet folded into the BRD) |
| Capture-tier detail per wave (REST vs. extension vs. negotiated access) | Volume 4 · Deployment & Operations (rollout waves, D-15) | extends |
| Tenant manifest mechanics (one image, many manifests) | Volume 2 · Product Architecture (multi-tenant model, D-07/D-08) | extends |
| Today's production spine and future extension points | [`../../docs/engineering/SYSTEM_ARCHITECTURE.md`](../../docs/engineering/SYSTEM_ARCHITECTURE.md) | references (feeds D-20) |

<!-- Status: 🟢 drafted/reviewed -->
